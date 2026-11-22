/**
 * Escrow lifecycle:   UNFUNDED --(brand pays virtual account, provider confirms)--> FUNDED
 *                     FUNDED   --(brand approves milestone)------------------------> RELEASED (creator balance)
 *                     FUNDED   --(deal cancelled / admin decision)------------------> REFUNDED (brand refundable)
 *
 * Only a VERIFIED provider fact (signed webhook and/or Payaza transaction-query) can move
 * money into escrow. A client "payment succeeded" message is never trusted.
 */
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "../../config/db.js";
import { config, paymentsEnabled, paymentsEnvironment } from "../../config/env.js";
import { ApiError } from "../../utils/apiError.js";
import { logger } from "../../utils/logger.js";
import { createNotification } from "../notifications/notifications.service.js";
import { audit } from "./audit.js";
import { Accounts, post, lockAccount, balanceOf } from "./ledger.js";
import { Decimal, Dec, computeFee, fromProvider, sameAmount } from "./money.js";
import * as payaza from "./payaza.client.js";

export function requireEnabled() {
  if (!paymentsEnabled()) {
    throw new ApiError(503, "Payments are not enabled on this server (PAYMENTS_MODE=disabled)", "PAYMENTS_DISABLED");
  }
}

export function toPublicPayment(p: {
  id: string; dealId: string; milestoneId: string | null; amount: Prisma.Decimal; currency: string; status: string;
  providerRef: string | null; expiresAt: Date | null; vaAccountNumber: string | null; vaAccountName: string | null;
  vaBankName: string | null; environment: string; createdAt: Date; paidAt: Date | null; failureReason: string | null;
}) {
  return {
    id: p.id,
    dealId: p.dealId,
    milestoneId: p.milestoneId,
    amount: p.amount.toString(),
    currency: p.currency,
    status: p.status,
    providerRef: p.providerRef,
    environment: p.environment,
    expiresAt: p.expiresAt,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
    failureReason: p.failureReason,
    virtualAccount: p.vaAccountNumber
      ? { accountNumber: p.vaAccountNumber, accountName: p.vaAccountName, bankName: p.vaBankName }
      : null,
  };
}

// ------------------------------------------------------------------ funding
export async function initializePayment(userId: string, dealId: string, milestoneId: string) {
  requireEnabled();

  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { brand: true } });
  if (!deal) throw ApiError.notFound("Deal");
  if (deal.brandId !== userId) throw ApiError.forbidden("Only the brand on this deal can fund it");
  if (deal.status !== "ACTIVE") throw ApiError.badRequest("Only ACTIVE deals can be funded");
  if (deal.currency !== "NGN") throw ApiError.badRequest("Only NGN deals are supported by the payment provider");

  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
  // Original code never checked the milestone belonged to the deal the caller owns.
  if (!milestone || milestone.dealId !== dealId) throw ApiError.notFound("Milestone");
  if (milestone.escrowStatus !== "UNFUNDED") throw ApiError.conflict("This milestone is already funded");
  if (milestone.status === "PAID") throw ApiError.conflict("This milestone is already paid");

  const live = await prisma.payment.findFirst({ where: { activeKey: milestoneId } });
  if (live) {
    if (live.status === "PENDING" && live.expiresAt && live.expiresAt > new Date()) {
      return { payment: toPublicPayment(live), virtualAccount: toPublicPayment(live).virtualAccount, reference: live.providerRef, sandbox: live.environment === "sandbox" };
    }
    if (live.status === "PENDING") {
      const r = await confirmFunding(live.id, undefined, "initialize");
      if (r.status === "COMPLETED") throw ApiError.conflict("This milestone has just been funded");
      await expirePayment(live.id, "Virtual account expired unpaid");
    } else {
      throw ApiError.conflict(`A payment for this milestone is already ${live.status.toLowerCase()}`);
    }
  }

  const reference = `CV${randomUUID().replace(/-/g, "")}`;
  const amount = new Decimal(milestone.amount);

  let payment;
  try {
    payment = await prisma.payment.create({
      data: {
        dealId, milestoneId, payerId: deal.brandId, payeeId: deal.creatorId,
        amount, currency: "NGN", status: "PENDING", providerRef: reference, provider: "PAYAZA",
        environment: paymentsEnvironment(), isDemo: false, activeKey: milestoneId,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw ApiError.conflict("A payment for this milestone is already in progress");
    }
    throw e;
  }

  const [first, ...rest] = deal.brand.name.trim().split(/\s+/);
  try {
    const va = await payaza.createDynamicVirtualAccount({
      reference,
      amount: amount.toString(),
      accountName: `CreatorVault ${deal.title}`.slice(0, 40),
      description: `Escrow for ${milestone.title}`.slice(0, 60),
      customer: { firstName: first || "Brand", lastName: rest.join(" ") || "Brand", email: deal.brand.email, phone: config.PAYAZA_CUSTOMER_PHONE },
    });
    const payable = fromProvider(va.amountPayable);
    if (payable && !sameAmount(payable, amount)) {
      throw new payaza.PayazaError(`Provider quoted ${payable} for a ${amount} milestone`, 200, null, false);
    }
    const ttl = va.expiresInMinutes ?? config.PAYAZA_VA_EXPIRY_MINUTES;
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        vaAccountNumber: va.accountNumber, vaAccountName: va.accountName, vaBankName: va.bankName,
        expiresAt: new Date(Date.now() + ttl * 60_000),
      },
    });
    await audit("PAYMENT_INITIALIZED", "payment", payment.id, { milestoneId, amount: amount.toString() }, userId);
    const pub = toPublicPayment(updated);
    return { payment: pub, virtualAccount: pub.virtualAccount, reference, sandbox: updated.environment === "sandbox" };
  } catch (err) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", activeKey: null, failureReason: (err as Error).message.slice(0, 200) },
    });
    await audit("PAYMENT_INIT_FAILED", "payment", payment.id, { error: (err as Error).message.slice(0, 200) }, userId);
    logger.error(`payment init failed for ${payment.id}: ${(err as Error).message}`);
    throw new ApiError(502, "Could not create a payment account with the payment provider. Please try again.", "PROVIDER_ERROR");
  }
}

export async function expirePayment(paymentId: string, reason: string) {
  const r = await prisma.payment.updateMany({
    where: { id: paymentId, status: "PENDING" },
    data: { status: "EXPIRED", activeKey: null, failureReason: reason },
  });
  if (r.count) await audit("PAYMENT_EXPIRED", "payment", paymentId, { reason });
}

export interface WebhookFacts { status: string | null; amount: Dec | null; currency: string | null }
export type FundingOutcome = { status: string; payment: Awaited<ReturnType<typeof prisma.payment.findUnique>> };

/**
 * Idempotent. Safe to call from webhook, verify endpoint and reconciler concurrently:
 * the payment row is locked and the ledger posting is keyed `fund:<paymentId>`.
 */
export async function confirmFunding(paymentId: string, hint?: WebhookFacts, source = "verify"): Promise<FundingOutcome> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw ApiError.notFound("Payment");
  if (payment.status === "COMPLETED" || payment.isDemo || !payment.providerRef) return { status: payment.status, payment };

  // 1. independent verification with the provider; fall back to the (already signature-verified) webhook facts
  let completed = false;
  let amount: Dec | null = null;
  let currency: string | null = null;
  try {
    const q = await payaza.queryVirtualAccountTransaction(payment.providerRef);
    completed = q.status === "Completed";
    amount = fromProvider(q.amountReceived);
    currency = q.currency;
  } catch (err) {
    if (hint && hint.status && /^(completed|funds received)$/i.test(hint.status)) {
      completed = true; amount = hint.amount; currency = hint.currency;
    } else {
      logger.warn(`funding verification unavailable for ${payment.id} (${source}): ${(err as Error).message}`);
      return { status: payment.status, payment };
    }
  }
  if (!completed) return { status: payment.status, payment };

  // 2. amount + currency must match what we asked for
  const expected = new Decimal(payment.amount);
  if (!sameAmount(amount, expected) || (currency ?? "NGN") !== payment.currency) {
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "REVIEW", amountReceived: amount, providerStatus: "AMOUNT_MISMATCH", failureReason: `Expected ${expected} ${payment.currency}, provider reported ${amount ?? "?"} ${currency ?? "?"}` },
    });
    await audit("PAYMENT_AMOUNT_MISMATCH", "payment", payment.id, { expected: expected.toString(), received: amount?.toString() ?? null, currency, source });
    return { status: "REVIEW", payment: updated };
  }

  // 3. money arrived after we gave up on the account -> never auto-credit, escalate
  if (payment.status === "EXPIRED" || payment.status === "FAILED") {
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "REVIEW", amountReceived: amount, providerStatus: "LATE_PAYMENT", failureReason: "Funds received after the payment was expired/failed" },
    });
    await audit("LATE_PAYMENT_RECEIVED", "payment", payment.id, { amount: amount?.toString(), source });
    return { status: "REVIEW", payment: updated };
  }

  // 4. atomic: lock -> ledger -> payment -> milestone
  let doubleFunded = false;
  let alreadyDone = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payments WHERE id = ${payment.id} FOR UPDATE`;
      const fresh = await tx.payment.findUnique({ where: { id: payment.id } });
      if (!fresh || fresh.status === "COMPLETED") { alreadyDone = true; return; }

      const m = await tx.milestone.updateMany({
        where: { id: fresh.milestoneId!, escrowStatus: "UNFUNDED" },
        data: { escrowStatus: "FUNDED", fundedAt: new Date() },
      });
      if (m.count === 0) { doubleFunded = true; throw new Error("MILESTONE_ALREADY_FUNDED"); }

      await post(tx, {
        idempotencyKey: `fund:${fresh.id}`,
        type: "ESCROW_FUNDING",
        description: `Brand funded escrow for milestone ${fresh.milestoneId}`,
        refType: "payment",
        refId: fresh.id,
        entries: [
          { account: Accounts.providerCash(), direction: "DEBIT", amount: expected },
          { account: Accounts.escrow(fresh.milestoneId!), direction: "CREDIT", amount: expected },
        ],
      });
      await tx.payment.update({
        where: { id: fresh.id },
        data: { status: "COMPLETED", amountReceived: expected, providerStatus: "Completed", confirmedAt: new Date(), paidAt: new Date(), failureReason: null },
      });
      await audit("PAYMENT_CONFIRMED", "payment", fresh.id, { amount: expected.toString(), source }, null, tx);
    });
  } catch (err) {
    if (doubleFunded) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "REVIEW", providerStatus: "DUPLICATE_FUNDING", failureReason: "Milestone was already funded by another payment", amountReceived: expected } });
      await audit("DUPLICATE_FUNDING", "payment", payment.id, { milestoneId: payment.milestoneId });
      return { status: "REVIEW", payment: await prisma.payment.findUnique({ where: { id: payment.id } }) };
    }
    throw err;
  }

  const finalPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
  if (alreadyDone) return { status: "COMPLETED", payment: finalPayment };

  const milestone = await prisma.milestone.findUnique({ where: { id: payment.milestoneId! }, include: { deal: true } });
  await Promise.all([
    createNotification({ userId: payment.payeeId, type: "ESCROW_FUNDED", title: "Milestone funded", message: `${expected} NGN is now held in escrow for "${milestone?.title}". You can start work.`, metadata: { dealId: payment.dealId, milestoneId: payment.milestoneId } }),
    createNotification({ userId: payment.payerId, type: "PAYMENT_CONFIRMED", title: "Payment confirmed", message: `Your payment of ${expected} NGN was confirmed and is held in escrow until you approve the milestone.`, metadata: { dealId: payment.dealId, milestoneId: payment.milestoneId } }),
  ]).catch(() => undefined);

  // Legacy path: brand approved before funding. Release straight away.
  if (milestone?.status === "APPROVED") await releaseMilestoneEscrow(milestone.id, null).catch((e) => logger.error(`auto-release failed: ${e.message}`));

  return { status: "COMPLETED", payment: finalPayment };
}

// ------------------------------------------------------------------ release / refund
export interface ReleaseOptions { adminOverride?: boolean; markApproved?: boolean }

/** Moves escrow -> creator available balance (minus platform fee) and flips the milestone to PAID. Atomic + idempotent. */
export async function releaseMilestoneEscrow(milestoneId: string, actorId: string | null, opts: ReleaseOptions = {}) {
  let creatorId = "";
  let net: Dec = new Decimal(0);
  let title = "";
  let alreadyReleased = false;

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM milestones WHERE id = ${milestoneId} FOR UPDATE`;
    const m = await tx.milestone.findUnique({ where: { id: milestoneId }, include: { deal: true } });
    if (!m) throw ApiError.notFound("Milestone");
    if (m.escrowStatus === "RELEASED") { alreadyReleased = true; return; }
    if (m.escrowStatus !== "FUNDED") throw ApiError.badRequest("This milestone's escrow is not funded");
    if (m.deal.status === "DISPUTED" && !opts.adminOverride) {
      throw ApiError.conflict("This deal is under dispute — escrow is frozen until an admin resolves it");
    }

    const funding = await tx.payment.findFirst({ where: { milestoneId, status: "COMPLETED" } });
    if (!funding) throw ApiError.internal("Funded milestone has no completed payment (ledger/state mismatch)");
    const gross = new Decimal(funding.amount);
    const fee = computeFee(gross, config.PLATFORM_FEE_BPS);
    net = gross.sub(fee);
    creatorId = m.deal.creatorId;
    title = m.title;

    const entries: Parameters<typeof post>[1]["entries"] = [
      { account: Accounts.escrow(milestoneId), direction: "DEBIT", amount: gross },
      { account: Accounts.userAvailable(creatorId), direction: "CREDIT", amount: net },
    ];
    if (fee.gt(0)) entries.push({ account: Accounts.platformRevenue(), direction: "CREDIT", amount: fee });

    await post(tx, {
      idempotencyKey: `release:${milestoneId}`,
      type: "ESCROW_RELEASE",
      description: `Escrow released to creator for milestone ${milestoneId}`,
      refType: "milestone",
      refId: milestoneId,
      metadata: { gross: gross.toString(), fee: fee.toString(), net: net.toString() },
      entries,
    });
    await tx.milestone.update({ where: { id: milestoneId }, data: { status: "PAID", escrowStatus: "RELEASED", releasedAt: new Date() } });
    await audit("ESCROW_RELEASED", "milestone", milestoneId, { net: net.toString(), fee: fee.toString() }, actorId, tx);
  });

  if (!alreadyReleased) {
    await createNotification({
      userId: creatorId, type: "PAYMENT_COMPLETED", title: "Payment released",
      message: `${net} NGN for "${title}" is now in your available balance. You can withdraw it from the Payments page.`,
      metadata: { milestoneId },
    }).catch(() => undefined);
  }
  return { released: !alreadyReleased };
}

/** FUNDED escrow -> brand's refundable balance (ledger only; the bank refund is settled by ops, see settleBrandRefund). */
export async function refundMilestoneEscrow(milestoneId: string, actorId: string | null, reason: string) {
  let brandId = "";
  let amount: Dec = new Decimal(0);
  let did = false;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM milestones WHERE id = ${milestoneId} FOR UPDATE`;
    const m = await tx.milestone.findUnique({ where: { id: milestoneId }, include: { deal: true } });
    if (!m) throw ApiError.notFound("Milestone");
    if (m.escrowStatus !== "FUNDED") return;
    const funding = await tx.payment.findFirst({ where: { milestoneId, status: "COMPLETED" } });
    if (!funding) throw ApiError.internal("Funded milestone has no completed payment");
    amount = new Decimal(funding.amount);
    brandId = m.deal.brandId;
    await post(tx, {
      idempotencyKey: `refund:${milestoneId}`,
      type: "ESCROW_REFUND",
      description: `Escrow refunded to brand for milestone ${milestoneId}: ${reason}`.slice(0, 200),
      refType: "milestone",
      refId: milestoneId,
      entries: [
        { account: Accounts.escrow(milestoneId), direction: "DEBIT", amount },
        { account: Accounts.brandRefundable(brandId), direction: "CREDIT", amount },
      ],
    });
    await tx.milestone.update({ where: { id: milestoneId }, data: { escrowStatus: "REFUNDED" } });
    await tx.payment.update({ where: { id: funding.id }, data: { status: "REFUNDED" } });
    await audit("ESCROW_REFUNDED", "milestone", milestoneId, { amount: amount.toString(), reason }, actorId, tx);
    did = true;
  });
  if (did) {
    await createNotification({ userId: brandId, type: "ESCROW_REFUNDED", title: "Escrow refund approved", message: `${amount} NGN has been returned to your refundable balance and will be paid to your bank by the CreatorVault team.`, metadata: { milestoneId } }).catch(() => undefined);
  }
  return { refunded: did };
}

export async function refundDealEscrow(dealId: string, actorId: string | null, reason: string) {
  const funded = await prisma.milestone.findMany({ where: { dealId, escrowStatus: "FUNDED" }, select: { id: true } });
  for (const m of funded) await refundMilestoneEscrow(m.id, actorId, reason);
  return { refunded: funded.length };
}

/** Admin: record that ops has paid a brand's refund out of the Payaza balance (manual bank transfer / dashboard). */
export async function settleBrandRefund(brandId: string, amount: Dec, reference: string, adminId: string) {
  await prisma.$transaction(async (tx) => {
    await lockAccount(tx, Accounts.brandRefundable(brandId));
    const bal = await balanceOf(tx, Accounts.brandRefundable(brandId));
    if (amount.gt(bal)) throw ApiError.badRequest(`Brand's refundable balance is only ${bal} NGN`);
    await post(tx, {
      idempotencyKey: `refund-settled:${reference}`,
      type: "BRAND_REFUND_SETTLED",
      description: `Refund paid to brand ${brandId} (ref ${reference})`,
      refType: "brand",
      refId: brandId,
      entries: [
        { account: Accounts.brandRefundable(brandId), direction: "DEBIT", amount },
        { account: Accounts.providerCash(), direction: "CREDIT", amount },
      ],
    });
    await audit("BRAND_REFUND_SETTLED", "brand", brandId, { amount: amount.toString(), reference }, adminId, tx);
  });
}
