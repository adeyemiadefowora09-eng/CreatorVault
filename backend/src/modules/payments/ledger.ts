/**
 * Append-only double-entry ledger.
 *
 * Every movement of money is ONE LedgerTransaction with >= 2 LedgerEntry rows
 * whose DEBIT total equals CREDIT total. Rows are never updated or deleted
 * (enforced by DB triggers in the migration). A balance is always computed
 * from entries, never stored. Each transaction carries a unique idempotency
 * key, so replaying a webhook / retry cannot post twice.
 *
 * Normal balances:
 *   ASSET / EXPENSE      : debits  - credits
 *   LIABILITY / REVENUE  : credits - debits
 */
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { paymentsEnvironment } from "../../config/env.js";
import { Decimal, Dec, ZERO } from "./money.js";

export type Tx = Prisma.TransactionClient;
export type AccountType = "ASSET" | "LIABILITY" | "REVENUE" | "EXPENSE";

export interface AccountRef { code: string; type: AccountType; ownerId?: string }
export interface EntryInput { account: AccountRef; direction: "DEBIT" | "CREDIT"; amount: Dec }

export const Accounts = {
  providerCash: (): AccountRef => ({ code: "PROVIDER_CASH:PAYAZA", type: "ASSET" }),
  payoutInflight: (): AccountRef => ({ code: "PAYOUT_INFLIGHT", type: "LIABILITY" }),
  platformRevenue: (): AccountRef => ({ code: "PLATFORM_REVENUE", type: "REVENUE" }),
  escrow: (milestoneId: string): AccountRef => ({ code: `ESCROW:${milestoneId}`, type: "LIABILITY", ownerId: milestoneId }),
  userAvailable: (userId: string): AccountRef => ({ code: `USER_AVAILABLE:${userId}`, type: "LIABILITY", ownerId: userId }),
  brandRefundable: (brandId: string): AccountRef => ({ code: `BRAND_REFUNDABLE:${brandId}`, type: "LIABILITY", ownerId: brandId }),
};

/** Pure check (unit-tested): >=2 entries, positive 2dp amounts, debits == credits. */
export function assertBalanced(entries: { direction: "DEBIT" | "CREDIT"; amount: Dec }[]): void {
  if (entries.length < 2) throw new Error("Ledger transaction needs at least two entries");
  let debit = ZERO;
  let credit = ZERO;
  for (const e of entries) {
    if (!e.amount.gt(0)) throw new Error("Ledger entry amounts must be positive");
    if (e.amount.decimalPlaces() > 2) throw new Error("Ledger amounts are limited to 2 decimal places");
    if (e.direction === "DEBIT") debit = debit.add(e.amount);
    else credit = credit.add(e.amount);
  }
  if (!debit.equals(credit)) throw new Error(`Unbalanced ledger transaction: debit ${debit} != credit ${credit}`);
}

export async function getAccount(tx: Tx, ref: AccountRef, environment: string = paymentsEnvironment()) {
  const existing = await tx.ledgerAccount.findUnique({ where: { code_environment: { code: ref.code, environment } } });
  if (existing) return existing;
  // Race-safe create: two concurrent first uses of the same account must not abort the surrounding transaction.
  await tx.$executeRaw`INSERT INTO ledger_accounts (id, code, environment, type, currency, "ownerId")
    VALUES (${randomUUID()}, ${ref.code}, ${environment}, ${ref.type}::"LedgerAccountType", 'NGN', ${ref.ownerId ?? null})
    ON CONFLICT (code, environment) DO NOTHING`;
  return tx.ledgerAccount.findUniqueOrThrow({ where: { code_environment: { code: ref.code, environment } } });
}

export interface PostInput {
  idempotencyKey: string;
  type: string;
  description: string;
  refType?: string;
  refId?: string;
  metadata?: Prisma.InputJsonValue;
  entries: EntryInput[];
}

/** Posts a balanced transaction. If the idempotency key exists, posts nothing and reports duplicate. */
export async function post(tx: Tx, input: PostInput, environment: string = paymentsEnvironment()) {
  assertBalanced(input.entries);

  const existing = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { duplicate: true as const, transactionId: existing.id };

  const accountIds = new Map<string, string>();
  for (const e of input.entries) {
    if (!accountIds.has(e.account.code)) accountIds.set(e.account.code, (await getAccount(tx, e.account, environment)).id);
  }

  const created = await tx.ledgerTransaction.create({
    data: {
      idempotencyKey: input.idempotencyKey,
      environment,
      type: input.type,
      description: input.description,
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      metadata: input.metadata ?? undefined,
      entries: {
        create: input.entries.map((e) => ({
          accountId: accountIds.get(e.account.code)!,
          direction: e.direction,
          amount: e.amount,
          currency: "NGN",
        })),
      },
    },
  });
  return { duplicate: false as const, transactionId: created.id };
}

/** Balance computed from entries only (never from a stored column). */
export async function balanceOf(tx: Tx, ref: AccountRef, environment: string = paymentsEnvironment()): Promise<Dec> {
  const acct = await tx.ledgerAccount.findUnique({ where: { code_environment: { code: ref.code, environment } } });
  if (!acct) return ZERO;
  const rows = await tx.ledgerEntry.groupBy({
    by: ["direction"],
    where: { accountId: acct.id },
    _sum: { amount: true },
  });
  const debit = new Decimal(rows.find((r) => r.direction === "DEBIT")?._sum.amount ?? 0);
  const credit = new Decimal(rows.find((r) => r.direction === "CREDIT")?._sum.amount ?? 0);
  const normalDebit = ref.type === "ASSET" || ref.type === "EXPENSE";
  return normalDebit ? debit.sub(credit) : credit.sub(debit);
}

/** Row-lock an account so concurrent withdrawals serialise. Must run inside a transaction. */
export async function lockAccount(tx: Tx, ref: AccountRef, environment: string = paymentsEnvironment()) {
  const acct = await getAccount(tx, ref, environment);
  await tx.$queryRaw`SELECT id FROM ledger_accounts WHERE id = ${acct.id} FOR UPDATE`;
  return acct;
}
