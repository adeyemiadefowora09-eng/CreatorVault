# 03 — REQUIRED CODE FIXES

Every fix references the exact original file and the exact replacement file in this package.

---

## FIX-01 — `PAYMENTS_MODE` replaces boolean `isLivePaymentsMode()`

**File:** `backend/src/config/env.ts`
**Problem:** `isLivePaymentsMode()` returned `true` as soon as any two env strings were non-empty. If production keys were mistyped, the app silently became a fake-money system. Demo payments created rows identical to real ones — no `isDemo` flag — so turning on live keys later allowed creators to withdraw real money that no brand ever paid.
**Fix:** Explicit `PAYMENTS_MODE=demo|sandbox|live` with fail-closed validation. Live mode without credentials aborts at startup.

**Files changed:**
- `backend/src/config/env.ts` ← full replacement provided
- `backend/src/modules/payments/payments.service.ts` ← uses `getPaymentsMode()`

---

## FIX-02 — Payaza auth header corrected

**File:** `backend/src/modules/payments/payments.service.ts` (old), `payaza.client.ts` (new)
**Problem:** `Authorization: Bearer <PAYAZA_SECRET_KEY>`. Payaza requires `Authorization: Payaza <PUBLIC_KEY_BASE64>`.
**Fix:** New `payaza.client.ts` centralises all Payaza calls with the correct header. Secret key is never sent outbound.

**Files changed:**
- `backend/src/modules/payments/payaza.client.ts` ← new file (full implementation)

---

## FIX-03 — URL construction corrected (tenant via header, not path)

**File:** `backend/src/modules/payments/payments.service.ts` (old `payazaUrl()`)
**Problem:** Code appended `/test/` or `/live/` to the URL, e.g. `https://api.payaza.africa/live//test/card/…` — a double-slash broken URL.
**Fix:** Base URL is `https://api.payaza.africa` (no path segments). `X-TenantID: test|live` header controls the environment.

**Files changed:**
- `backend/src/modules/payments/payaza.client.ts` ← `payazaHeaders()` and `payazaUrl()`

---

## FIX-04 — `markPaymentCompletedForWebhook` atomicity

**File:** `backend/src/modules/payments/payments.service.ts`
**Problem:** Three separate DB writes (Payment, Milestone, Notification). If the process died mid-sequence, the Payment was `COMPLETED` but the Milestone stayed `APPROVED`. Webhook retry was then blocked (`status !== "COMPLETED"` check skipped it), leaving the milestone permanently stuck.
**Fix:** All writes inside a single `prisma.$transaction`. Notification is best-effort outside the transaction.

---

## FIX-05 — Amount and currency cross-check on confirmation

**File:** `backend/src/modules/payments/payments.service.ts`
**Problem:** Neither the webhook handler nor `verifyPayment` compared the provider-reported amount/currency to the DB payment record. A short-paid or wrong-currency charge would mark the full milestone paid.
**Fix:** `markPaymentCompletedForWebhook` accepts `providerAmount` and `providerCurrency`. If they don't match (allowing for kobo rounding), the payment is marked FAILED instead of COMPLETED.

---

## FIX-06 — Concurrent withdrawal protection (race condition)

**File:** `backend/src/modules/payments/payments.service.ts`
**Problem:** `getPayoutBalance` and `payout.create` were two separate statements with no lock. Two simultaneous requests both passed the balance check and both created payouts, overdrawing the creator's balance.
**Fix:** `requestPayout` uses `prisma.$transaction` with `SERIALIZABLE` isolation + `SELECT … FOR UPDATE` on the creator's existing payouts before recomputing balance.

---

## FIX-07 — Payment reference collision prevention

**File:** `backend/src/modules/payments/payments.service.ts`
**Problem:** `PV_${Date.now()}_${Math.floor(Math.random() * 1000)}` — only 1000 possible values per millisecond. Collisions possible under load.
**Fix:** `crypto.randomUUID()` — cryptographically random, zero collision probability.

---

## FIX-H3 — `milestoneId @unique` blocks payment retries

**File:** `backend/src/modules/payments/payments.service.ts`
**Problem:** A PENDING or FAILED payment on a milestone permanently prevented a new attempt because `payment.create` threw a unique-constraint violation (HTTP 500).
**Fix:** Before creating a new payment, delete any existing PENDING or FAILED payment for the same milestone. COMPLETED/PROCESSING payments block as before.

---

## FIX-H4 — Webhook HMAC over raw bytes + constant-time compare

**File:** `backend/src/modules/payments/payments.webhook.ts`
**Problem:** Signature was computed over `JSON.stringify(req.body)`, which can differ from the original payload bytes. Comparison used `!==` (timing-unsafe). No raw-body was captured.
**Fix:**
1. `app.ts` registers a raw-body capture middleware before `express.json()` for the `/webhook` path.
2. HMAC is computed over `req.rawBody`.
3. `crypto.timingSafeEqual()` for comparison.
4. Both hex and base64 digests are tested (Payaza's docs are inconsistent on encoding).

**Files changed:**
- `backend/src/app.ts` ← raw-body middleware added
- `backend/src/modules/payments/payments.webhook.ts` ← full replacement

---

## FIX-H5 — Webhook idempotency / duplicate event prevention

**File:** `backend/src/modules/payments/payments.webhook.ts`
**Problem:** No stored event IDs. Payaza retries all fire state changes again, potentially writing duplicate ledger entries.
**Fix:** `webhook_events` table (created by migration). Event key inserted before processing; duplicate inserts are rejected by unique constraint.

**Migration required:**
```
prisma/migrations/20261119000000_ledger_and_webhook_events/migration.sql
```

---

## FIX-H6 — Webhook rate-limiter isolation

**File:** `backend/src/modules/payments/payments.routes.ts`
**Problem:** Global `defaultLimiter` (100 req / 15 min per IP) applied to webhook. Payaza retries from a small IP pool can exhaust the quota and receive 429s.
**Fix:** Webhook route uses a dedicated `webhookLimiter` (1000 req / 15 min).

---

## FIX-C3 — Empty secret key allows forged webhook signatures

**File:** `backend/src/modules/payments/payments.webhook.ts`
**Problem:** `createHmac("sha512", "")` with an empty key is computable by anyone. Any forged `charge.success` passed signature verification.
**Fix:** Webhook handler returns 401 immediately if `PAYAZA_SECRET_KEY` is not set.

---

## FIX-H8 — Payout body structure corrected

**File:** `backend/src/modules/payments/payaza.client.ts`
**Problem:** Old flat body `{ amount, currency_code, bank_name, account_number, … }`. Payaza documents: `{ transaction_type, service_payload: { payout_amount, transaction_pin, account_reference, currency, country, payout_beneficiaries: […] } }`.
**Fix:** `submitPayout()` in `payaza.client.ts` uses the documented nested structure.

---

## FIX-H1 — Payout failure handling (no infinite PENDING)

**File:** `backend/src/modules/payments/payments.service.ts`
**Problem:** Failed/ambiguous payouts were left `PENDING` forever, permanently reducing available balance.
**Fix:** `requestPayout` moves to `FAILED` + writes a reversal ledger entry when the provider rejects the call. `reconcilePayoutStatus` handles `FAILED` from webhook or admin poll.

---

## FIX-H2 — Bank account validation (bank enquiry)

**Files:**
- `backend/src/modules/payments/payaza.client.ts` ← `resolveAccountName()`
- `backend/src/modules/payments/payments.controller.ts` ← `bankEnquiry()`
- `backend/src/modules/payments/payments.routes.ts` ← `POST /bank-enquiry`
- `backend/src/modules/payments/payments.validation.ts` ← `bankEnquirySchema`
- `backend/prisma/schema.prisma` → `bankCode` made required at service layer

**Problem:** Bank details were free text, unverified. Creator could enter any string and immediately withdraw.
**Fix:** `POST /api/v1/payments/bank-enquiry` calls Payaza name enquiry. Frontend should call this and confirm the resolved name before saving bank details.

---

## FIX-M1 — Float precision

**File:** `backend/src/modules/payments/payments.service.ts`
**Problem:** `Number(Decimal)` conversions throughout balance calculations. JavaScript floats lose precision on currency arithmetic.
**Fix:** `Prisma.Decimal` used throughout. `toFixed(2)` for JSON serialization. Conversion to `Number` only at Payaza API boundary.

---

## NEW — Ledger tables

**Migration:** `backend/prisma/migrations/20261119000000_ledger_and_webhook_events/migration.sql`

Adds:
- `ledger_accounts` — running balance per logical wallet
- `ledger_entries` — append-only double-entry records with idempotency keys
- `webhook_events` — event deduplication table

---

## NEW — `payaza.client.ts`

**File:** `backend/src/modules/payments/payaza.client.ts`

Single typed wrapper for all Payaza API calls:
- `getTransactionStatus()` — collection status check
- `submitPayout()` — bank transfer with correct body structure
- `getPayoutStatus()` — payout status check
- `resolveAccountName()` — bank account name enquiry

---

## M4 FIX — Callback URL / frontend verify route

**Problem:** `callback_url` sent to Payaza was `${CORS_ORIGIN}/payments/verify/${reference}`, but the frontend has no such route. After paying, Payaza redirects the brand to a 404.
**Fix in env.ts:** Callback URL changed to `${CORS_ORIGIN}/payments/verify?reference=${reference}` (query string). The frontend `payments/page.tsx` should read `?reference` from the URL and call `POST /api/v1/payments/verify/:reference`.

> [!NOTE]
> You still need to add a `useEffect` in the frontend payments page that detects `?reference=` in the URL on mount and calls the verify endpoint automatically.
