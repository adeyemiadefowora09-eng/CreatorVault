# 🛡️ CreatorVault — Payment & Escrow Engine (Complete Audit & Implementation Guide)

This document is the master technical reference and operating guide for CreatorVault's production-grade **Escrow, Ledger, and Payaza Payment Engine**. It covers all architectural upgrades and fixes implemented in response to `01_PAYMENT_ARCHITECTURE_AUDIT.md` and `02_PAYMENT_REMAINING_FIXES.md`.

---

## 1. Executive Summary

CreatorVault operates a **True Escrow** and **Double-Entry Ledger** platform designed for African creators and brands. 

### Key Architectural Tenets:
1. **Fund-Before-Work Escrow**: Brands fund milestones upfront. Funds are intercepted and held in CreatorVault’s centralized Payaza holding vault. Creators never begin work until funds are secured in escrow.
2. **Double-Entry Ledger**: Balances are calculated through balanced credits and debits (`SYSTEM_PAYAZA_VAULT`, `SYSTEM_ESCROW_HOLDING`, `USER_PAYABLE_<id>`, `SYSTEM_PLATFORM_REVENUE`), preventing race conditions, deficits, and floating-point math errors.
3. **Automated Monetization**: Upon brand approval, the engine deducts a flat **100 NGN platform fee** into platform revenue and automatically disburses the net payout to the creator’s verified bank account via Payaza.
4. **Resilient Failure Reversals**: Failed or rejected payouts automatically trigger ledger reversal entries, instantly crediting the funds back to the creator’s balance.
5. **Cryptographic Webhook Security**: All Payaza webhooks are verified on raw byte buffers using HMAC SHA-512 and timing-safe equality checks, with amount/currency validation and event idempotency.

---

## 2. End-to-End Escrow Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Brand
    participant Frontend as Next.js 15 Client
    participant API as CreatorVault API
    participant Ledger as Double-Entry Ledger
    participant Payaza as Payaza Gateway
    participant CreatorBank as Creator Bank (NUBAN)
    actor Creator

    Note over Brand, Creator: 1. Escrow Funding (Before Work Starts)
    Brand->>API: POST /payments/initialize (Idempotency-Key)
    API->>Payaza: POST /api/v1/applications/initialize (CheckoutRequest)
    Payaza-->>API: checkout_url
    API-->>Frontend: checkout_url
    Brand->>Payaza: Pays milestone amount
    Payaza->>API: Webhook charge.success (Raw-body HMAC verified)
    API->>Ledger: Debit: SYSTEM_PAYAZA_VAULT | Credit: SYSTEM_ESCROW_HOLDING
    API->>API: Milestone marked IN_PROGRESS (Escrow Secured)
    API-->>Creator: Notification: "Escrow Secured 🛡️! Start work."

    Note over Brand, Creator: 2. Work Delivery & Review
    Creator->>API: PATCH /milestones/:id/submit (Deliverable links & notes)
    API-->>Brand: Notification: "Milestone submitted for review."

    Note over Brand, Creator: 3. Approval, Monetization & Disbursement
    Brand->>API: PATCH /milestones/:id/approve
    API->>API: Verify escrow hold & check active dispute freeze
    API->>Ledger: Debit: SYSTEM_ESCROW_HOLDING (Gross)<br/>Credit: USER_PAYABLE (Net)<br/>Credit: SYSTEM_PLATFORM_REVENUE (100 NGN)
    
    alt Creator has verified Bank Account
        API->>Payaza: POST /payout-receptor/payout (NUBAN transfer)
        alt Transfer Accepted
            Payaza->>CreatorBank: Credits Creator's Account
            API->>Ledger: Debit: USER_PAYABLE | Credit: SYSTEM_PAYAZA_VAULT
            API->>API: Payout COMPLETED & Milestone PAID
            API-->>Creator: Notification: "Funds disbursed to your bank!"
        else Transfer Failed / Rejected
            API->>Ledger: Payout Failure Reversal (Restores Creator Balance)
            API->>API: Payout FAILED
            API-->>Creator: Notification: "Transfer failed; balance restored."
        end
    else No Bank Account Yet
        API->>API: Milestone APPROVED; Funds held in Creator Available Balance
        API-->>Creator: Notification: "Funds ready! Add bank details to withdraw."
    end
```

---

## 3. Payaza Integration Contract Details

### Authentication & Tenant Headers
Payaza calls use base64-encoded public keys and dedicated tenant headers:
* **Header**: `Authorization: Payaza <base64_encoded_public_key>` (strictly **not** `Bearer`).
* **Tenant**: `X-TenantID: test | live` (determined by `PAYAZA_TENANT`).
* **Base URL**: `https://api.payaza.africa/live/` (without duplicate `/live/` or `/test/`).

### Payaza Payout Receptor Body Schema
Transfers follow Payaza's exact JSON contract:
```json
{
  "transaction_type": "nuban",
  "service_payload": {
    "payout_amount": 49900,
    "transaction_pin": "0000",
    "account_reference": "CREATORVAULT_MERCHANT",
    "currency": "NGN",
    "country": "NGA",
    "payout_beneficiaries": [
      {
        "credit_amount": 49900,
        "account_number": "0123456789",
        "account_name": "Jane Creator",
        "bank_code": "058"
      }
    ]
  }
}
```

### Bank Account Name Enquiry
Before saving creator bank accounts, the system verifies account ownership via Payaza:
* **Endpoint**: `POST /payaza-account/api/v1/mainaccounts/merchant/provider/enquiry`
* **Payload**: `{ "currency": "NGN", "bank_code": "058", "account_number": "0123456789" }`
* **Action**: Saves the resolved, verified account holder name rather than unverified user-supplied text.

---

## 4. Double-Entry Ledger System

To prevent floating-point discrepancies, race conditions, and overdraws, financial state is recorded using immutable double-entry bookkeeping:

| Event | Debited Account | Credited Account | Economic Meaning |
|---|---|---|---|
| **Escrow Hold** | `SYSTEM_PAYAZA_VAULT` (Asset +) | `SYSTEM_ESCROW_HOLDING` (Liability +) | Brand funds enter platform custody; held for deal. |
| **Escrow Release** | `SYSTEM_ESCROW_HOLDING` (Gross) | `USER_PAYABLE_<creatorId>` (Net)<br/>`SYSTEM_PLATFORM_REVENUE` (100 NGN) | Escrow liability discharged; creator is credited net; platform fee retained. |
| **Payout Disbursed** | `USER_PAYABLE_<creatorId>` (Liability -) | `SYSTEM_PAYAZA_VAULT` (Asset -) | Cash leaves platform vault and is transferred to creator's bank. |
| **Payout Reversal** | `SYSTEM_PAYAZA_VAULT` (Asset +) | `USER_PAYABLE_<creatorId>` (Liability +) | Failed transfer cash is returned; creator balance is restored. |
| **Escrow Refund** | `SYSTEM_ESCROW_HOLDING` (Liability -) | `SYSTEM_PAYAZA_VAULT` (Asset -) | Unused escrow is refunded back to the brand. |

---

## 5. Security & Risk Controls

1. **Cryptographic Webhook Verification**:
   - Captured raw request buffer (`req.rawBody`) in Express middleware before JSON parsing.
   - Verified with `crypto.createHmac("sha512", PAYAZA_SECRET_KEY)`.
   - Used `crypto.timingSafeEqual` to eliminate timing attacks.
   - **Fail-Closed**: Rejects with HTTP 500 if `PAYAZA_SECRET_KEY` is missing or empty.
2. **Amount & Currency Validation**:
   - Webhook checks reported amounts and currencies against the database record before approving transactions.
3. **Webhook Replay Idempotency**:
   - Webhook payloads are deduplicated against the `WebhookEvent` table using `eventId`. Duplicate deliveries return `200 OK` without re-running transactions.
4. **Rate Limiting Exemption**:
   - Webhook endpoints (`/api/v1/payments/webhook/*`) are exempted from Express rate limiters so provider retries are never throttled into HTTP 429s.
5. **Bank Account Cooling-Off Period**:
   - If a creator updates their bank details, withdrawals are locked for **24 hours** (`BankAccount.lastChangedAt`) to protect against account takeover.
6. **Dispute Freezes**:
   - Escrow payouts and balance withdrawals for deals marked `DISPUTED` are automatically frozen until arbitrated by an admin.
7. **Environment Safety Switch**:
   - `PAYMENTS_MODE=sandbox | live | test | disabled`. In test mode, transactions are tagged `isDemo = true` and prevented from initiating real bank transfers. When disabled, all money routes fail closed.
8. **Persistent Audit Log**:
   - Financial operations log immutable entries to the `AuditLog` table.

---

## 6. API Reference

| Method | Endpoint | Role | Description |
|---|---|---|---|
| `POST` | `/api/v1/payments/initialize` | `BRAND` | Initializes Payaza checkout for milestone escrow funding. |
| `POST` | `/api/v1/payments/verify/:reference` | Authenticated | Confirms payment settlement and secures milestone in escrow. |
| `GET` | `/api/v1/payments` | Authenticated | Lists paginated payment history for deals. |
| `GET` | `/api/v1/payments/stats` | Authenticated | Returns total spent, earned, and currently secured in escrow. |
| `GET` | `/api/v1/payments/payouts/balance` | `CREATOR` | Returns creator available ledger balance ready for withdrawal. |
| `POST` | `/api/v1/payments/payouts` | `CREATOR` | Requests payout to verified bank account (atomic with ledger check). |
| `POST` | `/api/v1/payments/payouts/:id/sync` | `CREATOR` | Polls Payaza transfer status for pending/processing payouts. |
| `POST` | `/api/v1/payments/bank/enquiry` | Authenticated | Resolves account holder name via Payaza Account Enquiry API. |
| `POST` | `/api/v1/payments/bank/save` | `CREATOR` | Verifies and saves NUBAN bank account with cooling-off timestamp. |
| `POST` | `/api/v1/payments/refund` | Authenticated | Refunds milestone escrow back to brand (dispute or cancellation). |
| `POST` | `/api/v1/payments/webhook/payaza` | Public (Signed) | Handles collection and payout transfer callbacks with HMAC checks. |

---

## 7. Frontend Integration

1. **Verify Callback Page**:
   - Implemented at `frontend/src/app/(dashboard)/payments/verify/[reference]/page.tsx`.
   - Handles the Payaza redirect, displays a verification loader, checks settlement, and provides direct buttons to return to the deal or payments dashboard.
2. **Milestones Escrow View**:
   - Located at `frontend/src/app/(dashboard)/deals/[dealId]/milestones/page.tsx`.
   - **Brand View**: Displays `🛡️ Fund Escrow (₦Amount)` button before work begins; displays `✓ Approve & Release Funds` once work is submitted.
   - **Creator View**: Displays `Waiting for brand to fund escrow before you begin work` when pending; unlocks `Submit Deliverables` once escrow is funded.

---

## 8. Database Schema Additions (`schema.prisma`)

```prisma
model BankAccount {
  id            String    @id @default(uuid())
  creatorId     String    @unique
  creator       User      @relation(fields: [creatorId], references: [id])
  bankCode      String
  accountNumber String
  accountName   String
  isVerified    Boolean   @default(false)
  verifiedAt    DateTime?
  lastChangedAt DateTime  @default(now())
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@map("bank_accounts")
}

model AuditLog {
  id         String   @id @default(uuid())
  action     String   // ESCROW_INITIATED, ESCROW_SECURED, ESCROW_RELEASED, PAYOUT_REQUESTED, PAYOUT_FAILED_REVERSED, ESCROW_REFUNDED
  entityType String   // PAYMENT, PAYOUT, MILESTONE, DEAL, BANK_ACCOUNT
  entityId   String
  userId     String?
  metadata   Json?
  createdAt  DateTime @default(now())

  @@index([entityType, entityId])
  @@index([userId])
  @@map("audit_logs")
}

model WebhookEvent {
  id          String   @id @default(uuid())
  provider    String   @default("PAYAZA")
  eventId     String   @unique
  eventType   String
  payload     Json
  createdAt   DateTime @default(now())

  @@map("webhook_events")
}

model LedgerAccount {
  id          String        @id @default(uuid())
  name        String        @unique
  type        String        // ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  userId      String?
  currency    String        @default("NGN")
  createdAt   DateTime      @default(now())
  entries     LedgerEntry[]

  @@index([userId])
  @@map("ledger_accounts")
}

model LedgerTransaction {
  id          String        @id @default(uuid())
  reference   String        @unique
  description String
  createdAt   DateTime      @default(now())
  entries     LedgerEntry[]

  @@map("ledger_transactions")
}

model LedgerEntry {
  id            String            @id @default(uuid())
  transactionId String
  accountId     String
  direction     String            // DEBIT, CREDIT
  amount        Decimal           @db.Decimal(12, 2)
  createdAt     DateTime          @default(now())
  transaction   LedgerTransaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  account       LedgerAccount     @relation(fields: [accountId], references: [id])

  @@index([transactionId])
  @@index([accountId])
  @@map("ledger_entries")
}
```

---

## 9. Verification & Test Suite

* **Unit Test Suite**: Ran `npx vitest run` in `backend/` testing Payaza client headers, base64 public key encoding, tenant resolution, and base URLs.
  - Result: **All tests passed (2/2)**.
* **TypeScript Compilation**:
  - `backend/`: `npx tsc --noEmit` 👉 **0 errors (Exit code 0)**.
  - `frontend/`: `npx tsc --noEmit` 👉 **0 errors (Exit code 0)**.
* **Prisma Schema**: `npx prisma generate` generated clean type definitions.

---

## 10. Archive Files Location

All updated source files, Prisma schemas, frontend routes, and unit tests are bundled into the following ZIP document:

* **Local Workspace**: `/home/lock-in/.gemini/antigravity/scratch/creatorvault/creatorvault_payment_fixes.zip`
* **Artifact Path**: `/home/lock-in/.gemini/antigravity/brain/363118f1-dd64-489f-9ca9-7f044b5d4c12/creatorvault_payment_fixes.zip`
