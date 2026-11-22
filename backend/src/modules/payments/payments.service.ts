import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { config, paymentsEnabled, paymentsEnvironment } from "../../config/env.js";
import { ApiError } from "../../utils/apiError.js";
import { getPaginationMeta } from "../../types/index.js";
import { Decimal } from "./money.js";
import { confirmFunding, requireEnabled, toPublicPayment } from "./escrow.service.js";
import { balanceOf, Accounts } from "./ledger.js";

export { initializePayment } from "./escrow.service.js";
export { getPayoutBalance, requestPayout, listPayouts } from "./payouts.service.js";

export async function getPaymentMode() {
  return {
    mode: config.PAYMENTS_MODE,
    enabled: paymentsEnabled(),
    sandbox: paymentsEnvironment() === "sandbox",
    live: config.PAYMENTS_MODE === "live",
    escrowRequired: config.REQUIRE_FUNDED_ESCROW,
    platformFeeBps: config.PLATFORM_FEE_BPS,
    payoutMinAmount: config.PAYOUT_MIN_AMOUNT,
  };
}

/**
 * Client-triggered "check where my payment stands". It never trusts the client: it asks Payaza,
 * and only a provider-confirmed, amount-matched payment moves money into escrow.
 */
export async function verifyPayment(reference: string, userId: string) {
  requireEnabled();
  const payment = await prisma.payment.findUnique({ where: { providerRef: reference } });
  if (!payment) throw ApiError.notFound("Payment");
  if (payment.payerId !== userId && payment.payeeId !== userId) throw ApiError.forbidden("You are not a party to this payment");
  const r = await confirmFunding(payment.id, undefined, "verify");
  const pub = toPublicPayment(r.payment!);
  return userId === payment.payerId ? pub : { ...pub, virtualAccount: null };
}

export async function listPayments(userId: string, query: { page: number; limit: number; status?: string; dealId?: string }) {
  const { page, limit, status, dealId } = query;
  const where: Prisma.PaymentWhereInput = {
    OR: [{ payerId: userId }, { payeeId: userId }],
    isDemo: false,
    environment: paymentsEnvironment(),
    ...(status && { status: status as Prisma.PaymentWhereInput["status"] }),
    ...(dealId && { dealId }),
  };
  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: "desc" },
      include: { deal: { select: { title: true } }, milestone: { select: { title: true, escrowStatus: true } } },
    }),
    prisma.payment.count({ where }),
  ]);
  const mapped = items.map((p) => {
    const pub = toPublicPayment(p);
    return { ...pub, payerId: p.payerId, payeeId: p.payeeId, provider: p.provider, virtualAccount: p.payerId === userId ? pub.virtualAccount : null, deal: p.deal, milestone: p.milestone };
  });
  return { items: mapped, meta: getPaginationMeta(page, limit, total) };
}

export async function getPaymentStats(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("User");
  const env = paymentsEnvironment();
  const base = { environment: env, isDemo: false };

  if (user.role === "CREATOR") {
    const available = await balanceOf(prisma, Accounts.userAvailable(userId));
    const [released, inEscrow] = await Promise.all([
      prisma.milestone.aggregate({ where: { deal: { creatorId: userId }, escrowStatus: "RELEASED", payments: { some: { ...base, status: "COMPLETED" } } }, _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { payeeId: userId, ...base, status: "COMPLETED", milestone: { escrowStatus: "FUNDED" } }, _sum: { amountReceived: true } }),
    ]);
    return {
      earned: new Decimal(released._sum.amount ?? 0).toString(),
      pending: new Decimal(inEscrow._sum.amountReceived ?? 0).toString(), // funded, awaiting brand approval
      available: available.toString(),
    };
  }
  const [funded, inEscrow, refundable] = await Promise.all([
    prisma.payment.aggregate({ where: { payerId: userId, ...base, status: "COMPLETED" }, _sum: { amountReceived: true } }),
    prisma.payment.aggregate({ where: { payerId: userId, ...base, status: "COMPLETED", milestone: { escrowStatus: "FUNDED" } }, _sum: { amountReceived: true } }),
    balanceOf(prisma, Accounts.brandRefundable(userId)),
  ]);
  return {
    spent: new Decimal(funded._sum.amountReceived ?? 0).toString(),
    inEscrow: new Decimal(inEscrow._sum.amountReceived ?? 0).toString(),
    refundable: refundable.toString(),
  };
}

/** SANDBOX ONLY: asks Payaza to simulate the brand's bank transfer. Payaza then fires a real webhook at us. */
export async function simulateSandboxPayment(reference: string, userId: string) {
  requireEnabled();
  if (paymentsEnvironment() !== "sandbox") throw ApiError.forbidden("Only available in sandbox mode");
  const p = await prisma.payment.findUnique({ where: { providerRef: reference } });
  if (!p || p.payerId !== userId) throw ApiError.notFound("Payment");
  if (p.status !== "PENDING" || !p.vaAccountNumber) throw ApiError.badRequest("Payment is not awaiting funds");
  const { fundTestVirtualAccount } = await import("./payaza.client.js");
  try {
    await fundTestVirtualAccount({ accountNumber: p.vaAccountNumber, accountName: p.vaAccountName ?? "", reference, amount: new Decimal(p.amount).toString() });
  } catch {
    throw new ApiError(502, "Sandbox funding request failed", "PROVIDER_ERROR");
  }
  return { requested: true, note: "Payaza will now send a webhook; you can also press 'Check payment status'." };
}
