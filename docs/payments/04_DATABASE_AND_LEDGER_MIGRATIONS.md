# 04 — Database and ledger migrations

## Apply
```bash
cd backend
# 1. BACK UP FIRST (pg_dump), especially if the DB holds anything you care about
npx prisma migrate deploy        # applies 20261120000000_payments_escrow_ledger
npx prisma generate
```
Use `migrate deploy`, **not** `db push` (README previously said `db:push`; it bypasses history and would not create the triggers). For a throw-away local DB, `npx prisma migrate reset` is fine.

> I could not run this migration here (no PostgreSQL in my sandbox, and your `node_modules` contain Windows Prisma engines). I validated `schema.prisma` and generated the client types, and hand-wrote the SQL to match. **First thing to do on your machine:** run `npx prisma migrate deploy` on a copy of your DB, then `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <shadow>`; it should report no drift (the triggers/CHECK constraints live only in SQL and are ignored by Prisma). If it reports anything, send it to me.

## What it does
| Area | Change |
|---|---|
| Enums | + `LedgerAccountType`, `LedgerDirection`, `EscrowStatus`; `PaymentStatus` + `EXPIRED`, `REVIEW` |
| `milestones` | + `escrowStatus` (default UNFUNDED), `fundedAt`, `releasedAt` |
| `payments` | + environment, isDemo, **activeKey UNIQUE** (one live payment per milestone; NULL when failed/expired), VA details, expiresAt, amountReceived, providerStatus, failureReason, confirmedAt, updatedAt; `providerRef` now UNIQUE; **dropped** unique(milestoneId); CHECK(amount>0) |
| `payouts` | + bankCode, bankAccountName, idempotencyKey (UNIQUE per user), environment, isDemo, providerStatus, updatedAt; `providerRef` UNIQUE; CHECK(amount>0) |
| `creator_profiles` | + bankVerifiedAt, bankChangedAt |
| new | `ledger_accounts`, `ledger_transactions` (unique idempotencyKey), `ledger_entries` (CHECK amount>0), `provider_events` (unique eventKey), `audit_logs` |
| triggers | append-only on ledger/audit tables (UPDATE/DELETE/TRUNCATE raise); deferred constraint trigger: each ledger transaction has ≥2 entries and debits = credits at COMMIT |
| backfill | every existing payment/payout ⇒ `isDemo=true`; paid milestones ⇒ `RELEASED`. **Demo data is never posted to the ledger**, so it can't become withdrawable money |

## Reading the ledger
```sql
-- balance of a creator (liability: credits - debits)
SELECT COALESCE(SUM(CASE WHEN e.direction='CREDIT' THEN e.amount ELSE -e.amount END),0)
FROM ledger_entries e JOIN ledger_accounts a ON a.id=e."accountId"
WHERE a.code = 'USER_AVAILABLE:<creatorUserId>' AND a.environment='sandbox';

-- full audit trail of one milestone
SELECT t."createdAt", t.type, a.code, e.direction, e.amount
FROM ledger_transactions t JOIN ledger_entries e ON e."transactionId"=t.id JOIN ledger_accounts a ON a.id=e."accountId"
WHERE t."refId" = '<milestoneId>' OR t."refId" IN (SELECT id FROM payments WHERE "milestoneId"='<milestoneId>')
ORDER BY t."createdAt";
```
Or call `GET /api/v1/payments/admin/integrity` as ADMIN.

## Rollback
Only safe **before** any live money exists. Drop the triggers, the five new tables and added columns; recreate `UNIQUE INDEX "payments_milestoneId_key"`. After live funds exist, never roll back: the ledger is the only record of who is owed what. Take a backup before every deploy.
