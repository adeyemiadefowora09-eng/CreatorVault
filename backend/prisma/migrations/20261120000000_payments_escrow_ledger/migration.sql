-- CreatorVault: escrow + append-only double-entry ledger + hardened payments/payouts.
-- Apply with:  npx prisma migrate deploy
-- Do NOT use `prisma db push` on a database that already holds payment data.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE');
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "EscrowStatus" AS ENUM ('UNFUNDED', 'FUNDED', 'RELEASED', 'REFUNDED');
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'REVIEW';

-- ---------------------------------------------------------------------------
-- 2. Creator bank verification stamps
-- ---------------------------------------------------------------------------
ALTER TABLE "creator_profiles" ADD COLUMN "bankVerifiedAt" TIMESTAMP(3);
ALTER TABLE "creator_profiles" ADD COLUMN "bankChangedAt" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- 3. Milestone escrow state
-- ---------------------------------------------------------------------------
ALTER TABLE "milestones" ADD COLUMN "escrowStatus" "EscrowStatus" NOT NULL DEFAULT 'UNFUNDED';
ALTER TABLE "milestones" ADD COLUMN "fundedAt" TIMESTAMP(3);
ALTER TABLE "milestones" ADD COLUMN "releasedAt" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- 4. Payments
-- ---------------------------------------------------------------------------
-- Make provider references unique (de-duplicate any legacy collisions first).
UPDATE "payments" p SET "providerRef" = p."providerRef" || '_' || p."id"
WHERE p."providerRef" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "payments" q WHERE q."providerRef" = p."providerRef" AND q."id" < p."id");

ALTER TABLE "payments" ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'sandbox';
ALTER TABLE "payments" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "payments" ADD COLUMN "activeKey" TEXT;
ALTER TABLE "payments" ADD COLUMN "vaAccountNumber" TEXT;
ALTER TABLE "payments" ADD COLUMN "vaAccountName" TEXT;
ALTER TABLE "payments" ADD COLUMN "vaBankName" TEXT;
ALTER TABLE "payments" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN "amountReceived" DECIMAL(12,2);
ALTER TABLE "payments" ADD COLUMN "providerStatus" TEXT;
ALTER TABLE "payments" ADD COLUMN "failureReason" TEXT;
ALTER TABLE "payments" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Every payment that exists before this migration is demo/simulated or never reached a
-- working provider. Flag it so it can never be treated as real money or withdrawn.
UPDATE "payments" SET "isDemo" = true;
UPDATE "payments" SET "activeKey" = "milestoneId" WHERE "status" = 'COMPLETED' AND "milestoneId" IS NOT NULL;

-- Multiple attempts per milestone are now allowed; "activeKey" enforces one LIVE payment.
DROP INDEX "payments_milestoneId_key";
CREATE INDEX "payments_milestoneId_idx" ON "payments"("milestoneId");
CREATE UNIQUE INDEX "payments_providerRef_key" ON "payments"("providerRef");
CREATE UNIQUE INDEX "payments_activeKey_key" ON "payments"("activeKey");
CREATE INDEX "payments_status_createdAt_idx" ON "payments"("status", "createdAt");
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);

-- Legacy milestones that were already paid in demo mode.
UPDATE "milestones" SET "escrowStatus" = 'RELEASED' WHERE "status" = 'PAID';

-- ---------------------------------------------------------------------------
-- 5. Payouts
-- ---------------------------------------------------------------------------
ALTER TABLE "payouts" ADD COLUMN "bankCode" TEXT;
ALTER TABLE "payouts" ADD COLUMN "bankAccountName" TEXT;
ALTER TABLE "payouts" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "payouts" ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'sandbox';
ALTER TABLE "payouts" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "payouts" ADD COLUMN "providerStatus" TEXT;
ALTER TABLE "payouts" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "payouts" SET "isDemo" = true;

CREATE UNIQUE INDEX "payouts_providerRef_key" ON "payouts"("providerRef");
CREATE UNIQUE INDEX "payouts_userId_idempotencyKey_key" ON "payouts"("userId", "idempotencyKey");
CREATE INDEX "payouts_status_requestedAt_idx" ON "payouts"("status", "requestedAt");
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_amount_positive" CHECK ("amount" > 0);

-- ---------------------------------------------------------------------------
-- 6. Ledger
-- ---------------------------------------------------------------------------
CREATE TABLE "ledger_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "type" "LedgerAccountType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ledger_transactions" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ledger_entries_amount_positive" CHECK ("amount" > 0)
);

CREATE TABLE "provider_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'PAYAZA',
    "eventKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reference" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    CONSTRAINT "provider_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ledger_accounts_code_environment_key" ON "ledger_accounts"("code", "environment");
CREATE INDEX "ledger_accounts_ownerId_idx" ON "ledger_accounts"("ownerId");
CREATE UNIQUE INDEX "ledger_transactions_idempotencyKey_key" ON "ledger_transactions"("idempotencyKey");
CREATE INDEX "ledger_transactions_refType_refId_idx" ON "ledger_transactions"("refType", "refId");
CREATE INDEX "ledger_transactions_createdAt_idx" ON "ledger_transactions"("createdAt");
CREATE INDEX "ledger_entries_accountId_idx" ON "ledger_entries"("accountId");
CREATE INDEX "ledger_entries_transactionId_idx" ON "ledger_entries"("transactionId");
CREATE UNIQUE INDEX "provider_events_eventKey_key" ON "provider_events"("eventKey");
CREATE INDEX "provider_events_reference_idx" ON "provider_events"("reference");
CREATE INDEX "provider_events_status_idx" ON "provider_events"("status");
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 7. Ledger integrity (NOT expressible in schema.prisma; lives only in SQL)
-- ---------------------------------------------------------------------------
-- 7a. Append-only: no UPDATE / DELETE / TRUNCATE on ledger or audit rows.
CREATE OR REPLACE FUNCTION cv_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (% blocked)', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_immutable BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION cv_block_mutation();
CREATE TRIGGER ledger_transactions_immutable BEFORE UPDATE OR DELETE ON "ledger_transactions"
  FOR EACH ROW EXECUTE FUNCTION cv_block_mutation();
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION cv_block_mutation();
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON "ledger_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION cv_block_mutation();
CREATE TRIGGER ledger_transactions_no_truncate BEFORE TRUNCATE ON "ledger_transactions"
  FOR EACH STATEMENT EXECUTE FUNCTION cv_block_mutation();

-- 7b. Every transaction must balance (checked at COMMIT, so entries can be inserted one by one).
CREATE OR REPLACE FUNCTION cv_check_ledger_balanced() RETURNS trigger AS $$
DECLARE d NUMERIC; c NUMERIC; n INTEGER;
BEGIN
  SELECT COALESCE(SUM("amount") FILTER (WHERE "direction" = 'DEBIT'), 0),
         COALESCE(SUM("amount") FILTER (WHERE "direction" = 'CREDIT'), 0),
         COUNT(*)
    INTO d, c, n
    FROM "ledger_entries" WHERE "transactionId" = NEW."transactionId";
  IF n < 2 OR d <> c THEN
    RAISE EXCEPTION 'unbalanced ledger transaction % (debit %, credit %, entries %)', NEW."transactionId", d, c, n;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT ON "ledger_entries"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION cv_check_ledger_balanced();

-- ---------------------------------------------------------------------------
-- ROLLBACK (manual, only before any live money has been recorded):
--   DROP TRIGGER ... ; DROP TABLE audit_logs, provider_events, ledger_entries,
--   ledger_transactions, ledger_accounts; drop the added payments/payouts/milestones/
--   creator_profiles columns and indexes; recreate UNIQUE INDEX "payments_milestoneId_key".
--   Never roll back after live funds exist: the ledger is the only record of who is owed what.
-- ---------------------------------------------------------------------------
