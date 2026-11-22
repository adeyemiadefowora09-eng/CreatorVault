# 01 — PAYMENT ARCHITECTURE AUDIT

> **Status note:** this audit describes the code BEFORE the fixes in this package. Items C1–C6, H1–H8 and M1–M7 are addressed by the changes in `03_REQUIRED_CODE_FIXES.md`. C7 (rotating the secrets you uploaded) is still your action.

Scope: `backend/` (Express + Prisma + PostgreSQL), `frontend/` (Next.js payment UI), `ai-engine/` (checked: no money logic).
Method: static read of every payment-related file, repo-wide search for escrow/wallet/ledger/refund/transaction/webhook logic, and comparison with Payaza's published API docs (docs.payaza.africa).
Not done yet: nothing has been executed. No dependencies were installed, no database was touched, no provider call was made. Every statement below is from reading code or docs.

---

## 0. VERDICT

**Can you complete Brand → platform → Creator → bank withdrawal today? NO.**

Three independent reasons, any one of which is sufficient:

1. **With Payaza keys set (your current `_env` / `backend/.env`), every real provider call is built wrongly** (wrong auth scheme, malformed URL, wrong request bodies, wrong webhook shape). Nothing reaches a working Payaza endpoint.
2. **With Payaza keys blank, the app switches to "demo mode"**, where the Brand confirms their own payment with a button and payouts instantly become `COMPLETED` with a fake `DEMO_` reference. That exercises the UI but proves nothing about money.
3. **There is no escrow and no ledger.** The Brand pays only *after* approving finished work, and "balance" is a SUM over mutable `Payment` rows.

---

## 1. ARCHITECTURE INVENTORY (Phase One)

| Area | Finding | Evidence |
|---|---|---|
| Frontend | Next.js 15 App Router, React Query, Zustand | `frontend/package.json` |
| Backend | Express 4, TypeScript, Zod validation, Helmet, express-rate-limit | `backend/src/app.ts` |
| Database | PostgreSQL via Prisma 6 | `backend/prisma/schema.prisma` |
| Auth | JWT access + refresh; role is read from the token, set at registration (`CREATOR` or `BRAND` only) | `utils/jwt.ts`, `auth.validation.ts:7` |
| Account models | `User.role`, `CreatorProfile` (bank fields), `BrandProfile` | `schema.prisma` |
| Payment provider | Payaza only (`PaymentProvider` enum also lists FLUTTERWAVE/MANUAL, unused) | `payments.service.ts` |
| Escrow / wallet | **None.** No such model, table, or code | repo-wide grep |
| Ledger | **None** | repo-wide grep |
| Payment models | `Payment` (per milestone), `Payout` | `schema.prisma` |
| Webhook | One endpoint, `POST /api/v1/payments/webhook/payaza` | `payments.routes.ts:24` |
| Background jobs / queues / reconciliation | **None** | repo |
| Admin | `ADMIN` role exists but **cannot be created** (register accepts only CREATOR/BRAND; `db:seed` points at `prisma/seed.ts`, which is not in the repo). Only dispute resolution uses it | `disputes.routes.ts:16`, `package.json` |
| Database transactions | `prisma.$transaction` is used **only** in trust-score code. **Zero uses in payments** | grep |
| Automated tests | **None** (`vitest` is installed, no test files) | repo |

### Current money-movement map (as the code actually behaves)

```
Creator submits milestone ──► Brand APPROVES milestone ──► Brand clicks Pay
                                                             │
                              POST /payments/initialize      ▼
                              (payments.service.ts:42)  Payment row = PENDING, providerRef = PV_<time>_<rand>
                                                             │
                    ┌────────────────────────────────────────┴───────────────────────────┐
              keys BLANK (demo)                                                    keys SET (live path)
                    │                                                                    │
     Brand clicks "Confirm payment"                                      fetch Payaza card/card_charge/initialize
     POST /payments/mock/:ref/confirm                                    (wrong auth + malformed URL → fails)
     (Brand self-confirms; no money)                                                     │
                    │                                                        Brand pays on hosted page (never reached)
                    └──────────────► markPaymentCompletedForWebhook() ◄── webhook "charge.success" or POST /verify/:ref
                                      3 separate writes, no transaction:
                                      Payment=COMPLETED, Milestone=PAID, notification
                                                             │
Creator "balance" = SUM(COMPLETED payments) − SUM(COMPLETED payouts) − SUM(PENDING|PROCESSING payouts)
                                                             │
Creator POST /payments/payouts ──► check balance ──► insert Payout(PENDING)   (no lock, no transaction)
                    ┌────────────────────────────────────────┴──────────────┐
              demo: instantly COMPLETED, ref "DEMO_<id>"            live: POST payout-receptor/payout
                                                                    (wrong body/auth) → stays PENDING forever
                                                                    No payout webhook, no polling, no reconciliation
```

---

## 2. CAN IT WORK TODAY? (Phase Two)

| # | Question | Status | Why (evidence) |
|---|---|---|---|
| A | Fund as Brand | **BROKEN** (live) / simulation only (demo) | Live call: `payments.service.ts:113-120` sends `Authorization: Bearer <SECRET_KEY>`; Payaza requires `Payaza <base64 public key>`. URL built by `payazaUrl()` (`:38-40`) is `${BASE}/${ENV}/…`; your `backend/.env` already sets `PAYAZA_BASE_URL=https://api.payaza.africa/live/`, giving `…/live//test/card/…`. The checkout path itself is flagged UNVERIFIED in the code's own comments (`:106-111`) |
| B | Backend verifies payment | **BROKEN** | `verifyPayment` (`:206-268`) uses the same wrong auth/URL; webhook signs `JSON.stringify(req.body)` instead of raw bytes (`payments.webhook.ts:14-16`); expects `{event:"charge.success", data:{transaction_reference}}`, a shape not confirmed by Payaza's docs (their documented transfer webhook is flat: `transaction_reference`, `transaction_status`…). In demo mode there is no verification at all |
| C | Funds recorded correctly | **PARTIALLY WORKING** | Only `Payment.status` flips. No ledger entry. Three non-atomic writes (`:158-176`) |
| D | Linked to correct escrow/transaction | **NOT IMPLEMENTED** | No escrow concept. `Payment` links to a milestone only |
| E | Separate Creator login | **WORKING** | Register/login/role middleware (`role.middleware.ts`) |
| F | Accurate available balance | **PARTIALLY WORKING** | `getPayoutBalance` (`:327-364`): converted to JS `Number`, currency hardcoded `"NGN"`, `Math.max(0, …)` hides negatives, demo-funded payments count, no fees, no dispute holds |
| G | Initiate withdrawal | **PARTIALLY WORKING** | `requestPayout` (`:366-484`) validates role and bank fields, but check-then-insert with no transaction or lock → concurrent requests can overdraw |
| H | Provider processes payout | **BROKEN / BLOCKED BY CONFIGURATION / REQUIRES EXTERNAL PROVIDER APPROVAL** | Body at `:450-457` is flat (`amount`, `currency_code`, `bank_name`…). Payaza's documented body is `transaction_type` + `service_payload{payout_amount, transaction_pin, account_reference, currency, country, payout_beneficiaries[{credit_amount, account_number, account_name, bank_code, …}]}`. Live also needs a transaction PIN and server-IP whitelisting |
| I | Accurate final withdrawal status | **NOT IMPLEMENTED** | No payout webhook handler, no status polling. Live payouts never leave `PENDING`/`PROCESSING`; a non-OK response leaves `PENDING` and the amount stays locked against balance forever (`:470-481`) |
| J | Consistent financial records | **NOT IMPLEMENTED** | No immutable records, no reconciliation, no audit log |

---

## 3. FINDINGS BY SEVERITY

### CRITICAL (financial loss or fake balances)

**C1. No escrow: the Brand pays after the work is approved.**
`initializePayment` requires `milestone.status === "APPROVED"` (`:52`). Creators deliver work with zero funds secured, which is the opposite of the product promise in the README and the frontend banner ("escrow → confirm → balance → withdraw", `payments/page.tsx:223`). If you want escrow, funding must happen at deal activation (or per-milestone before work starts) and release on approval.

**C2. Demo mode fails open and contaminates real balances.**
`isLivePaymentsMode()` is true purely because two env strings are non-empty (`:19-21`). If production env vars are missing or mistyped, the app silently becomes a fake-money system. Worse: demo payments become `COMPLETED` rows identical to real ones (no `isDemo` flag), so **turning on live keys later lets creators withdraw real money that no Brand ever paid.**

**C3. Webhook can be forged in demo/misconfigured state.**
With `PAYAZA_SECRET_KEY` empty, `createHmac("sha512", "")` is computable by anyone, so a forged `charge.success` passes the signature check (`payments.webhook.ts:14-20`).

**C4. No amount or currency verification on provider confirmation.**
Neither `verifyPayment` nor the webhook compares the provider's reported amount/currency to `Payment.amount/currency`. A short-paid or wrong-currency transaction would mark the full milestone paid.

**C5. Concurrent withdrawals can overdraw.**
`getPayoutBalance` and `payout.create` are separate statements with no `$transaction`, no row lock, no idempotency key (`:383-398`). Two simultaneous requests both pass the balance check.

**C6. Completion is not atomic and can strand milestones.**
`markPaymentCompletedForWebhook` updates payment, milestone and notification separately. If the process dies after the payment update, the webhook retry is skipped (`payments.webhook.ts:29` only acts when `status !== "COMPLETED"`) and the milestone stays `APPROVED` forever, while the creator's balance already includes the money.

**C7. Secrets were shared in plaintext.**
`_env` and `backend/.env` (inside `backend.zip`) hold populated values for the database URL, JWT secrets, Payaza keys, an AI key, Cloudinary and Resend. I did not print them, but they have now left your machine. **Rotate all of them** before any further testing. `backend/.env` also sets `PAYAZA_BASE_URL` to the **live** URL.

### HIGH

**H1. Payout failure handling.** Failed/ambiguous payouts are never resolved, never `FAILED`, never reversed, and keep reducing the available balance indefinitely.
**H2. Unverified bank details.** `bankAccountName/Number/Name` are free text (`users.validation.ts:14-17`); `bankCode` is optional and unused; no Payaza Account Name Enquiry; the stored name is user-supplied. A hijacked creator account can change the bank account and withdraw immediately (no cooling-off, no re-authentication).
**H3. `milestoneId @unique` on `Payment` blocks retries.** A `FAILED` or abandoned `PENDING` payment permanently prevents a new attempt: the duplicate check (`:54-57`) ignores them, then `create` throws a unique-constraint error (HTTP 500). `schema.prisma` (Payment), migration `…init/migration.sql:232`.
**H4. Webhook signature implementation.** Signs re-serialised JSON (key order/whitespace can differ from the raw body), compares with `!==` (not timing-safe), and no raw-body capture exists (`app.ts:25` uses `express.json()` globally). Payaza's own docs show HMAC-SHA512 in `x-payaza-signature` but their sample encodes the digest as base64 while your code uses hex; this must be settled empirically in sandbox.
**H5. No webhook idempotency or replay protection.** No stored event IDs; `providerRef` is not unique (`findFirst` on a non-unique column).
**H6. Webhook is rate-limited.** `defaultLimiter` (100 req / 15 min per IP) is applied before all routes (`app.ts:26`); Payaza retries all come from the same few IPs and can be throttled into 429s.
**H7. No refunds, no fund holds.** `PaymentStatus.REFUNDED` exists but nothing sets it. Disputes (`disputes.service.ts`) change deal status and trust score only; a creator can still withdraw funds from a disputed deal. Cancelling an `ACTIVE` deal doesn't touch money.
**H8. Wrong provider contract (summary).** Auth header, tenant handling, checkout endpoint, payout body, webhook envelope, status endpoints, bank codes: all unverified or contradicted by docs (see §4).

### MEDIUM

- **M1. Float money.** `z.number()` payout amounts, `Number(...)` on Decimal sums and when sending to the provider. Use Decimal/minor units end to end.
- **M2. Currency.** `Deal.currency` is free text defaulting to NGN; balances and payouts hardcode NGN and sum across currencies.
- **M3. Predictable references.** `PV_${Date.now()}_${random 0-999}` can collide; use a UUID/ULID.
- **M4. Post-checkout redirect 404s.** `callback_url` is `${CORS_ORIGIN}/payments/verify/${reference}` (`:101`), but the frontend has only `payments/page.tsx`; no `verify` route exists, and no frontend hook calls `/payments/verify` (`usePayments.ts`).
- **M5. No platform fee/commission model**, though the README says "platform fees and commissions" are part of the design.
- **M6. No audit log.** Money-relevant events are `console.error` lines and notifications.
- **M7. README uses `prisma db push`**, which bypasses the migration history (there are 5 migrations incl. a near-empty `init2`). Use `prisma migrate deploy`.
- **M8. `.env.example` lists `OPENAI_API_KEY`, `_env` has `GROQ_API_KEY`**, and `env.ts` only declares `OPENAI_API_KEY` (Payaza public-key base64, tenant, PIN, account reference, webhook settings are all absent).

### WORKING AS INTENDED (good, keep)

- Amount comes from the server-side milestone, never the client (`:63`).
- `initialize` restricted to `BRAND` and the deal's own brand (`:48`); `verify` restricted to the two parties (`:219`); payout routes `CREATOR`-only; `listPayments` scoped to payer/payee.
- `verifyPayment` no longer trusts the client (the code comments describe an earlier, worse version).
- Money columns are `Decimal(12,2)` in the database.
- Deterministic payout reference `PO_<payout.id>` (usable as an idempotency key once the flow is fixed).

---

## 4. PROVIDER REVIEW: PAYAZA (Phase Four)

Facts confirmed from official docs (docs.payaza.africa):

| Topic | Documentation says | Your code |
|---|---|---|
| Auth header | `Authorization: Payaza <public API key, base64-encoded>` (not `Bearer`) | `Bearer <secret key>` ✗ |
| Test vs live | `X-TenantID: test \| live` header on the live base URL `https://api.payaza.africa/live/` | Path segment `/test/` appended to base URL ✗ |
| Transfers | `POST /payout-receptor/payout` with `transaction_type`, `service_payload{payout_amount, transaction_pin, account_reference, currency, country, payout_beneficiaries[…]}` | Flat body ✗ (URL path itself is right) |
| Transfer prerequisites (live) | Transaction PIN set; server IP whitelisted (Settings → Developers); PND restriction may need lifting via support after a PIN reset. Test env is not IP-restricted | Not handled ✗ |
| Source of funds | Transfers debit your Payaza account balance (`account_reference` from "View Payaza Account Details") | Not fetched ✗ |
| Bank name enquiry | `POST /payaza-account/api/v1/mainaccounts/merchant/provider/enquiry` with `currency`, `bank_code`, `account_number`; docs say show the resolved name and require user confirmation | Not implemented ✗ |
| Webhook signature | `x-payaza-signature`, HMAC-SHA512 of payload with secret key (digest encoding shown inconsistently in docs) | Hex over `JSON.stringify` ⚠ |
| Webhook URLs | Configured per transaction type in the dashboard | Single URL assumed ⚠ |
| Collections available | Card, virtual account (dynamic/reserved NGN), mobile money. **A test endpoint `fund_test_virtual_account` simulates a customer paying a virtual account** | Code uses an unverified `card/card_charge/initialize` ✗ |
| Transfer status | `GET …/payaza-account/api/v1/mainaccounts/transaction/status?transaction_reference=…` | Not implemented ✗ |

**Cannot be fixed in code (you must do these on Payaza's side):** generate/confirm API keys in the dashboard; set a transaction PIN; whitelist your server's public IP (live only); fund the Payaza account balance (transfers draw from it); register webhook URLs; ask Payaza support whether your account is enabled for the products you need and whether any compliance/KYB step is pending before live transfers. Whether Payaza's *test* tenant fully simulates a bank payout settlement is something I could not confirm from the docs; treat sandbox payout success as "provider accepted the request", not "money reached a bank".

**Not verified by me:** the exact webhook body for card/virtual-account collections (docs excerpt I could read shows the transfer sample only), the exact Card Collection checkout flow, and Payaza's test bank codes. These need a sandbox run to pin down.

---

## 5. RECOMMENDED IMPLEMENTATION ORDER

0. **Rotate all exposed secrets; remove `.env` from the zip/repo history.**
1. **Decide the escrow model** (fund at activation vs per milestone; see the question in the chat reply).
2. **Provider client**: one `payaza.client.ts` (auth header, tenant header, timeouts, typed errors, no secret logging). Fix env schema (base URL without tenant, public key, secret, tenant, PIN, account reference, webhook toggle).
3. **Ledger migration**: append-only double-entry (`LedgerAccount`, `LedgerTransaction`, `LedgerEntry`) with DB constraints (entries per transaction sum to zero, unique idempotency keys, no UPDATE/DELETE via trigger). Backfill is **not** recommended for demo data; mark it and exclude it.
4. **Remove demo mode from production paths** (explicit `PAYMENTS_MODE=sandbox|live|disabled`, fail closed; demo only when `NODE_ENV=test`).
5. **Funding flow**: virtual-account (dynamic) collection first because it has a documented sandbox funding endpoint, then card checkout once the contract is confirmed. Verify with provider status call, check amount/currency, post ledger entries atomically, once.
6. **Webhook rewrite**: raw-body capture, constant-time signature check, stored event IDs, exempt from the global rate limiter, enqueue-then-ack.
7. **Withdrawals**: bank name enquiry + confirmation, balance from ledger, `SELECT … FOR UPDATE`/serializable transaction, idempotency key, `PROCESSING → COMPLETED/FAILED` via payout webhook + status polling reconciliation job, reversal entries on failure, cooling-off after bank-detail change.
8. **Refunds/disputes/holds** wired into the ledger.
9. **Tests** (unit + integration with a real Postgres), then sandbox runs, then docs 02–10.

---

## 6. WHAT I NEED FROM YOU

1. The escrow decision (C1).
2. Whether the Payaza keys currently in your env are **test** keys (the docs' `X-TenantID` header chooses the environment, so I cannot tell from the keys themselves).
3. When you reach the sandbox step: a Payaza dashboard with a transaction PIN set, and a public HTTPS URL for webhooks (e.g. a tunnel) because Payaza must reach your server.
