import { prisma } from "../../config/db.js";
import { paymentsEnvironment } from "../../config/env.js";
import { ApiError } from "../../utils/apiError.js";
import { audit } from "./audit.js";
import { refundMilestoneEscrow, releaseMilestoneEscrow, settleBrandRefund } from "./escrow.service.js";
import { Decimal, parseMoney } from "./money.js";
import * as payaza from "./payaza.client.js";

/** Read-only financial health check. Every number is derived from the append-only ledger. */
export async function integrityReport() {
  const env = paymentsEnvironment();

  const totals = await prisma.$queryRaw<{ debit: string; credit: string }[]>`
    SELECT COALESCE(SUM(e.amount) FILTER (WHERE e.direction = 'DEBIT'), 0)::text  AS debit,
           COALESCE(SUM(e.amount) FILTER (WHERE e.direction = 'CREDIT'), 0)::text AS credit
    FROM ledger_entries e JOIN ledger_transactions t ON t.id = e."transactionId"
    WHERE t.environment = ${env}`;

  const byType = await prisma.$queryRaw<{ type: string; net_debit: string }[]>`
    SELECT a.type::text AS type,
           COALESCE(SUM(CASE WHEN e.direction = 'DEBIT' THEN e.amount ELSE -e.amount END), 0)::text AS net_debit
    FROM ledger_accounts a LEFT JOIN ledger_entries e ON e."accountId" = a.id
    WHERE a.environment = ${env} GROUP BY a.type`;
  const net = (t: string) => new Decimal(byType.find((r) => r.type === t)?.net_debit ?? 0);
  // assets (net debit) must equal liabilities + revenue (net credit) - expenses
  const assets = net("ASSET").add(net("EXPENSE"));
  const claims = net("LIABILITY").add(net("REVENUE")).neg();

  const negatives = await prisma.$queryRaw<{ code: string; balance: string }[]>`
    SELECT a.code, SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END)::text AS balance
    FROM ledger_accounts a JOIN ledger_entries e ON e."accountId" = a.id
    WHERE a.environment = ${env} AND a.type = 'LIABILITY'
    GROUP BY a.code HAVING SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END) < 0`;

  const [reviewPayments, stalePayouts, stalePayments, failedEvents] = await Promise.all([
    prisma.payment.count({ where: { status: "REVIEW", environment: env } }),
    prisma.payout.count({ where: { status: { in: ["PENDING", "PROCESSING"] }, environment: env, requestedAt: { lt: new Date(Date.now() - 30 * 60_000) } } }),
    prisma.payment.count({ where: { status: "PENDING", environment: env, createdAt: { lt: new Date(Date.now() - 3 * 3600_000) } } }),
    prisma.providerEvent.count({ where: { status: "FAILED" } }),
  ]);

  let providerBalance: number | null = null;
  try { providerBalance = await payaza.getMainAccountBalanceNGN(); } catch { /* informational only */ }

  const ledgerCash = await prisma.$queryRaw<{ cash: string }[]>`
    SELECT COALESCE(SUM(CASE WHEN e.direction = 'DEBIT' THEN e.amount ELSE -e.amount END), 0)::text AS cash
    FROM ledger_accounts a JOIN ledger_entries e ON e."accountId" = a.id
    WHERE a.environment = ${env} AND a.code = 'PROVIDER_CASH:PAYAZA'`;

  const debit = new Decimal(totals[0]?.debit ?? 0);
  const credit = new Decimal(totals[0]?.credit ?? 0);
  return {
    environment: env,
    ledgerBalanced: debit.equals(credit),
    totalDebits: debit.toString(),
    totalCredits: credit.toString(),
    assetsEqualClaims: assets.equals(claims),
    negativeLiabilityAccounts: negatives,
    paymentsNeedingReview: reviewPayments,
    stalePendingPayments: stalePayments,
    stalePayouts,
    failedWebhookEvents: failedEvents,
    ledgerProviderCash: ledgerCash[0]?.cash ?? "0",
    payazaReportedBalanceNGN: providerBalance,
    note: "ledgerProviderCash is what the platform *thinks* it holds at Payaza from collections minus payouts; provider fees are not modelled, so a small positive gap vs payazaReportedBalanceNGN is expected.",
    healthy: debit.equals(credit) && assets.equals(claims) && negatives.length === 0 && reviewPayments === 0 && stalePayouts === 0,
  };
}

export async function listReviewPayments() {
  return prisma.payment.findMany({ where: { status: "REVIEW" }, orderBy: { createdAt: "desc" }, take: 100 });
}

/** Admin decision for a disputed (or otherwise stuck) funded milestone. */
export async function resolveEscrow(milestoneId: string, action: "RELEASE_TO_CREATOR" | "REFUND_TO_BRAND", reason: string, adminId: string) {
  await audit("ADMIN_ESCROW_DECISION", "milestone", milestoneId, { action, reason }, adminId);
  if (action === "RELEASE_TO_CREATOR") return releaseMilestoneEscrow(milestoneId, adminId, { adminOverride: true });
  return refundMilestoneEscrow(milestoneId, adminId, reason);
}

export async function settleRefund(brandId: string, amountInput: unknown, reference: string, adminId: string) {
  const amount = parseMoney(amountInput);
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(reference)) throw ApiError.badRequest("reference must be 6-64 chars (letters, digits, - _)");
  await settleBrandRefund(brandId, amount, reference, adminId);
  return { settled: amount.toString() };
}
