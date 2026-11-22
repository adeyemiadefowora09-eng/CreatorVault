/**
 * Withdrawals.
 *   request  : lock creator ledger account -> check ledger balance -> create Payout(PENDING)
 *              + ledger  DR USER_AVAILABLE / CR PAYOUT_INFLIGHT   (all in ONE db transaction)
 *   dispatch : call Payaza with a deterministic unique reference (safe to retry)
 *   settle   : provider says NIP_SUCCESS -> DR PAYOUT_INFLIGHT / CR PROVIDER_CASH, payout COMPLETED
 *   fail     : provider says NIP_FAILURE  -> DR PAYOUT_INFLIGHT / CR USER_AVAILABLE (reversal), payout FAILED
 * A payout is only ever COMPLETED/FAILED on provider evidence (signed webhook or status query),
 * never because our own request returned.
 */
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "../../config/db.js";
import { config, paymentsEnvironment } from "../../config/env.js";
import { ApiError } from "../../utils/apiError.js";
import { logger } from "../../utils/logger.js";
import { createNotification } from "../notifications/notifications.service.js";
import { audit } from "./audit.js";
import { requireEnabled } from "./escrow.service.js";
import { Accounts, balanceOf, lockAccount, post } from "./ledger.js";
import { Decimal, ZERO, parseMoney, toProviderNumber } from "./money.js";
import * as payaza from "./payaza.client.js";

const GENERIC_FAILURE = "The payout could not be processed. Your balance has been restored. Please try again or contact support.";

export async function getPayoutBalance(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("User");
  if (user.role !== "CREATOR") throw ApiError.forbidden("Only creators have a payout balance");

  const env = paymentsEnvironment();
  const account = await prisma.ledgerAccount.findUnique({ where: { code_environment: { code: Accounts.userAvailable(userId).code, environment: env } } });
  const available = await balanceOf(prisma, Accounts.userAvailable(userId));
  const earned = account
    ? await prisma.ledgerEntry.aggregate({ where: { accountId: account.id, direction: "CREDIT", transaction: { type: "ESCROW_RELEASE" } }, _sum: { amount: true } })
    : { _sum: { amount: null } };
  const [paidOut, inflight, escrow] = await Promise.all([
    prisma.payout.aggregate({ where: { userId, environment: env, isDemo: false, status: "COMPLETED" }, _sum: { amount: true } }),
    prisma.payout.aggregate({ where: { userId, environment: env, isDemo: false, status: { in: ["PENDING", "PROCESSING"] } }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { payeeId: userId, environment: env, isDemo: false, status: "COMPLETED", milestone: { escrowStatus: "FUNDED" } }, _sum: { amountReceived: true } }),
  ]);
  const n = (d: Prisma.Decimal | null | undefined) => Number(new Decimal(d ?? 0).toFixed(2));
  return {
    totalEarned: n(earned._sum.amount),
    totalPaidOut: n(paidOut._sum.amount),
    pendingPayouts: n(inflight._sum.amount),
    availableBalance: n(available),
    inEscrow: n(escrow._sum.amountReceived),
    currency: "NGN",
    environment: env,
  };
}

export async function requestPayout(userId: string, amountInput: unknown, idempotencyKey?: string | null) {
  requireEnabled();
  const amount = parseMoney(amountInput);
  if (amount.lt(config.PAYOUT_MIN_AMOUNT)) throw ApiError.badRequest(`Minimum withdrawal is ${config.PAYOUT_MIN_AMOUNT} NGN`);
  if (amount.gt(config.PAYOUT_MAX_AMOUNT)) throw ApiError.badRequest(`Maximum single withdrawal is ${config.PAYOUT_MAX_AMOUNT} NGN`);
  if (idempotencyKey && !/^[A-Za-z0-9_-]{8,64}$/.test(idempotencyKey)) throw ApiError.badRequest("Invalid Idempotency-Key");

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { creatorProfile: true } });
  if (!user || user.role !== "CREATOR") throw ApiError.forbidden("Only creators can request a payout");
  const p = user.creatorProfile;
  if (!p?.bankAccountNumber || !p.bankName || !p.bankAccountName || !p.bankCode || !p.bankVerifiedAt) {
    throw ApiError.badRequest("Verify your payout bank account before requesting a withdrawal");
  }
  if (p.bankChangedAt) {
    const unlock = p.bankChangedAt.getTime() + config.PAYOUT_COOLDOWN_HOURS * 3600_000;
    if (Date.now() < unlock) throw ApiError.forbidden(`Withdrawals are paused until ${new Date(unlock).toISOString()} after a bank-detail change`);
  }

  if (idempotencyKey) {
    const existing = await prisma.payout.findFirst({ where: { userId, idempotencyKey } });
    if (existing) {
      if (!new Decimal(existing.amount).equals(amount)) throw ApiError.conflict("This Idempotency-Key was already used with a different amount");
      return existing;
    }
  }

  const payoutId = randomUUID();
  const reference = `CVP${payoutId.replace(/-/g, "")}`;
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      await lockAccount(tx, Accounts.userAvailable(userId)); // serialises concurrent withdrawals per creator
      const bal = await balanceOf(tx, Accounts.userAvailable(userId));
      if (amount.gt(bal)) throw ApiError.badRequest("Amount exceeds your available balance");

      const payout = await tx.payout.create({
        data: {
          id: payoutId, userId, amount, currency: "NGN", status: "PENDING", providerRef: reference,
          bankAccountNumber: p.bankAccountNumber!, bankName: p.bankName!, bankCode: p.bankCode!, bankAccountName: p.bankAccountName!,
          idempotencyKey: idempotencyKey ?? null, environment: paymentsEnvironment(), isDemo: false,
        },
      });
      await post(tx, {
        idempotencyKey: `payout:${payoutId}`,
        type: "PAYOUT_REQUEST",
        description: `Withdrawal requested by creator ${userId}`,
        refType: "payout",
        refId: payoutId,
        entries: [
          { account: Accounts.userAvailable(userId), direction: "DEBIT", amount },
          { account: Accounts.payoutInflight(), direction: "CREDIT", amount },
        ],
      });
      await audit("PAYOUT_REQUESTED", "payout", payoutId, { amount: amount.toString() }, userId, tx);
      return payout;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && idempotencyKey) {
      const existing = await prisma.payout.findFirst({ where: { userId, idempotencyKey } });
      if (existing) return existing;
    }
    throw e;
  }

  await createNotification({ userId, type: "PAYOUT_REQUESTED", title: "Withdrawal requested", message: `Your withdrawal of ${amount} NGN to ${p.bankName} ••••${p.bankAccountNumber!.slice(-4)} is being processed.`, metadata: { payoutId } }).catch(() => undefined);
  return dispatchPayout(created.id);
}

/** Sends a PENDING payout to Payaza. Idempotent: the reference is unique, so a retry can't pay twice. */
export async function dispatchPayout(payoutId: string) {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout || payout.status !== "PENDING" || payout.isDemo) return payout;

  try {
    const r = await payaza.initiateNubanTransfer({
      reference: payout.providerRef!,
      amount: toProviderNumber(new Decimal(payout.amount)),
      accountNumber: payout.bankAccountNumber,
      accountName: payout.bankAccountName ?? "",
      bankCode: payout.bankCode ?? "",
      narration: "CreatorVault payout",
    });
    if (r.accepted) {
      await audit("PAYOUT_SUBMITTED", "payout", payoutId, {});
      return prisma.payout.update({ where: { id: payoutId }, data: { status: "PROCESSING", providerStatus: "TRANSACTION_INITIATED" } });
    }
    return resolveViaStatus(payoutId, `Provider response not an acceptance (${r.raw?.response_message ?? "unknown"})`);
  } catch (err) {
    if (err instanceof payaza.PayazaError) {
      await audit("PAYOUT_SUBMIT_ERROR", "payout", payoutId, { status: err.status, ambiguous: err.ambiguous, message: err.message.slice(0, 200) });
      if (err.ambiguous) return payout; // might have gone through; the reconciler decides from the provider's records
      return resolveViaStatus(payoutId, err.message);
    }
    throw err;
  }
}

async function resolveViaStatus(payoutId: string, submitError: string) {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout) return null;
  try {
    const s = await payaza.queryTransferStatus(payout.providerRef!);
    if (s.found) return applyTransferStatus(payoutId, s.status, s.responseMessage);
    logger.warn(`payout ${payoutId}: provider has no record after submit error (${submitError})`);
    return failPayout(payoutId, GENERIC_FAILURE, `Submit rejected, provider has no record: ${submitError}`.slice(0, 200));
  } catch {
    return payout; // can't tell -> leave for the reconciler
  }
}

export async function applyTransferStatus(payoutId: string, status: string, message?: string | null) {
  switch (status) {
    case "NIP_SUCCESS":
      return settlePayout(payoutId, status);
    case "NIP_FAILURE":
      return failPayout(payoutId, message && message.length < 120 ? `Bank rejected the transfer: ${message}` : GENERIC_FAILURE, `${status}: ${message ?? ""}`.slice(0, 200));
    default: // TRANSACTION_INITIATED / NIP_PENDING / ESCROW_SUCCESS => still in flight
      return prisma.payout.updateMany({ where: { id: payoutId, status: { in: ["PENDING", "PROCESSING"] } }, data: { status: "PROCESSING", providerStatus: status } })
        .then(() => prisma.payout.findUnique({ where: { id: payoutId } }));
  }
}

export async function settlePayout(payoutId: string, providerStatus: string) {
  let userId = "";
  let amount = ZERO;
  let transitioned = false;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM payouts WHERE id = ${payoutId} FOR UPDATE`;
    const p = await tx.payout.findUnique({ where: { id: payoutId } });
    if (!p || p.status === "COMPLETED") return;
    userId = p.userId;
    amount = new Decimal(p.amount);
    if (p.status === "FAILED") {
      // Provider paid out AFTER we reversed it. The creator was re-credited, so debit them again.
      await post(tx, {
        idempotencyKey: `payout-late-settle:${payoutId}`, type: "PAYOUT_LATE_SETTLEMENT",
        description: `Payout ${payoutId} succeeded after reversal`, refType: "payout", refId: payoutId,
        entries: [
          { account: Accounts.userAvailable(p.userId), direction: "DEBIT", amount },
          { account: Accounts.providerCash(), direction: "CREDIT", amount },
        ],
      });
      await audit("CRITICAL_PAYOUT_SUCCEEDED_AFTER_REVERSAL", "payout", payoutId, { amount: amount.toString() }, null, tx);
    } else {
      await post(tx, {
        idempotencyKey: `payout-settled:${payoutId}`, type: "PAYOUT_SETTLED",
        description: `Payout ${payoutId} confirmed by provider`, refType: "payout", refId: payoutId,
        entries: [
          { account: Accounts.payoutInflight(), direction: "DEBIT", amount },
          { account: Accounts.providerCash(), direction: "CREDIT", amount },
        ],
      });
      await audit("PAYOUT_SETTLED", "payout", payoutId, { providerStatus }, null, tx);
    }
    await tx.payout.update({ where: { id: payoutId }, data: { status: "COMPLETED", completedAt: new Date(), providerStatus, failureReason: null } });
    transitioned = true;
  });
  if (transitioned) {
    await createNotification({ userId, type: "PAYOUT_COMPLETED", title: "Withdrawal completed", message: `${amount} NGN was sent to your bank account.`, metadata: { payoutId } }).catch(() => undefined);
  }
  return prisma.payout.findUnique({ where: { id: payoutId } });
}

export async function failPayout(payoutId: string, userFacingReason: string, internalReason: string) {
  let userId = "";
  let amount = ZERO;
  let transitioned = false;
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM payouts WHERE id = ${payoutId} FOR UPDATE`;
    const p = await tx.payout.findUnique({ where: { id: payoutId } });
    if (!p || p.status === "FAILED") return;
    if (p.status === "COMPLETED") {
      await audit("PAYOUT_FAILURE_IGNORED_AFTER_SUCCESS", "payout", payoutId, { internalReason }, null, tx);
      return;
    }
    userId = p.userId;
    amount = new Decimal(p.amount);
    await post(tx, {
      idempotencyKey: `payout-reversed:${payoutId}`, type: "PAYOUT_REVERSED",
      description: `Payout ${payoutId} failed; funds returned to creator`, refType: "payout", refId: payoutId,
      entries: [
        { account: Accounts.payoutInflight(), direction: "DEBIT", amount },
        { account: Accounts.userAvailable(p.userId), direction: "CREDIT", amount },
      ],
    });
    await tx.payout.update({ where: { id: payoutId }, data: { status: "FAILED", failureReason: userFacingReason, providerStatus: "FAILED" } });
    await audit("PAYOUT_FAILED", "payout", payoutId, { internalReason }, null, tx);
    transitioned = true;
  });
  if (transitioned) {
    await createNotification({ userId, type: "PAYOUT_FAILED", title: "Withdrawal failed", message: `${amount} NGN was returned to your available balance. ${userFacingReason}`, metadata: { payoutId } }).catch(() => undefined);
  }
  return prisma.payout.findUnique({ where: { id: payoutId } });
}

export async function listPayouts(userId: string) {
  return prisma.payout.findMany({
    where: { userId, isDemo: false, environment: paymentsEnvironment() },
    orderBy: { requestedAt: "desc" },
    select: { id: true, amount: true, currency: true, status: true, providerRef: true, bankName: true, bankAccountNumber: true, failureReason: true, requestedAt: true, completedAt: true },
  }).then((rows) => rows.map((r) => ({ ...r, bankAccountNumber: `••••${r.bankAccountNumber.slice(-4)}` })));
}
