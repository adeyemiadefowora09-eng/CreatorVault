# 04 — DATABASE AND LEDGER MIGRATIONS

## Migration to Apply

**File:** `backend/prisma/migrations/20261119000000_ledger_and_webhook_events/migration.sql`

This is a **forward-only migration**. It only adds new tables and does not alter any existing column, so it cannot break existing functionality.

## What it creates

### `ledger_accounts`

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | Logical account ID: `platform_escrow`, `creator_{userId}`, `brand_{userId}`, `bank_external` |
| `label` | TEXT | Human-readable name |
| `balance_kobo` | BIGINT | Running sum in smallest currency unit (kobo for NGN) |
| `created_at` | TIMESTAMPTZ | Row creation time |

### `ledger_entries`

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `idempotency_key` | TEXT UNIQUE | Prevents duplicate entries from retried webhooks |
| `debit_account_id` | TEXT FK | Account whose balance decreases |
| `credit_account_id` | TEXT FK | Account whose balance increases |
| `amount_kobo` | BIGINT > 0 | Positive amount in kobo |
| `currency` | TEXT | ISO 4217 code (default: NGN) |
| `type` | TEXT | Event type (see table below) |
| `reference_id` | TEXT | Payment ID or Payout ID |
| `description` | TEXT | Human-readable |
| `created_at` | TIMESTAMPTZ | Immutable timestamp |

#### Ledger entry types

| `type` | Meaning |
|---|---|
| `PAYMENT_RECEIVED` | Brand payment captured into platform escrow |
| `CREATOR_EARNINGS` | Escrow released to creator wallet |
| `PAYOUT_PROCESSING` | Creator payout submitted to bank |
| `PAYOUT_FAILED_REVERSAL` | Payout rejected — balance restored |
| `PAYOUT_DEMO` | Demo mode simulated payout |

### `webhook_events`

| Column | Type | Description |
|---|---|---|
| `id` | TEXT PK | UUID |
| `event_key` | TEXT UNIQUE | `webhook_{reference}_{event}` — deduplication key |
| `payload` | JSONB | Full webhook body for audit |
| `received_at` | TIMESTAMPTZ | Arrival time |

## How to apply

```bash
cd backend

# Using Prisma migrate (recommended — tracks migration history)
npx prisma migrate deploy

# OR: Run the SQL directly against your database
psql "$DATABASE_URL" -f prisma/migrations/20261119000000_ledger_and_webhook_events/migration.sql
```

> [!IMPORTANT]
> Use `prisma migrate deploy`, not `prisma db push`. `db push` bypasses migration history and makes it impossible to track what schema is running in production.

## Prisma schema additions required

Add these models to `backend/prisma/schema.prisma` so Prisma Client is aware of the tables (Prisma does not auto-detect tables it didn't create):

```prisma
model LedgerAccount {
  id          String         @id
  label       String
  balanceKobo BigInt         @default(0) @map("balance_kobo")
  createdAt   DateTime       @default(now()) @map("created_at")
  debits      LedgerEntry[]  @relation("LedgerDebit")
  credits     LedgerEntry[]  @relation("LedgerCredit")

  @@map("ledger_accounts")
}

model LedgerEntry {
  id              String        @id @default(uuid())
  idempotencyKey  String        @unique @map("idempotency_key")
  debitAccountId  String        @map("debit_account_id")
  creditAccountId String        @map("credit_account_id")
  amountKobo      BigInt        @map("amount_kobo")
  currency        String        @default("NGN")
  type            String
  referenceId     String?       @map("reference_id")
  description     String?
  createdAt       DateTime      @default(now()) @map("created_at")
  debitAccount    LedgerAccount @relation("LedgerDebit",  fields: [debitAccountId],  references: [id])
  creditAccount   LedgerAccount @relation("LedgerCredit", fields: [creditAccountId], references: [id])

  @@index([referenceId])
  @@index([type])
  @@index([createdAt(sort: Desc)])
  @@map("ledger_entries")
}

model WebhookEvent {
  id         String   @id @default(uuid())
  eventKey   String   @unique @map("event_key")
  payload    Json?
  receivedAt DateTime @default(now()) @map("received_at")

  @@index([receivedAt(sort: Desc)])
  @@map("webhook_events")
}
```

After editing schema.prisma, regenerate the Prisma Client:

```bash
npx prisma generate
```

## Rollback

If something goes wrong, roll back manually:

```sql
DROP TABLE IF EXISTS "webhook_events";
DROP TABLE IF EXISTS "ledger_entries";
DROP TABLE IF EXISTS "ledger_accounts";
```

Then delete the migration folder and remove the schema.prisma additions.

> [!WARNING]
> Rolling back after any ledger entries have been written means losing financial audit history. Only roll back on a database with no production data.

## Verifying after migration

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('ledger_accounts', 'ledger_entries', 'webhook_events');

-- Check seed accounts
SELECT * FROM ledger_accounts;

-- After a demo payment, inspect ledger
SELECT * FROM ledger_entries ORDER BY created_at DESC LIMIT 20;
```
