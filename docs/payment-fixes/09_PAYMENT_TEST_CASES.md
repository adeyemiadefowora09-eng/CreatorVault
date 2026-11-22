# 09 — PAYMENT TEST CASES

## Test environment setup

```bash
# Reset test database (development only — NEVER on production)
cd backend
npx prisma migrate reset --force
npx prisma migrate deploy
npm run dev
```

---

## Group A — Happy path (demo mode)

### TC-A1: Brand initiates payment

**Preconditions:** Deal active, Milestone APPROVED
**Steps:** `POST /api/v1/payments/initialize` with valid `dealId` + `milestoneId`
**Expected:** `{ payment: { status: "PENDING", providerRef: "DEMO_PV_..." }, mode: "demo" }`
**DB check:** `SELECT status FROM payments WHERE id = '<id>'` → `PENDING`

---

### TC-A2: Brand confirms demo payment

**Steps:** `POST /api/v1/payments/mock/{reference}/confirm`
**Expected:** `{ status: "COMPLETED", paidAt: "..." }`
**DB check:**
```sql
SELECT p.status, m.status FROM payments p
JOIN milestones m ON m.id = p."milestoneId"
WHERE p."providerRef" = 'DEMO_PV_...';
-- Both: COMPLETED / PAID
```

**Ledger check:**
```sql
SELECT type, amount_kobo FROM ledger_entries ORDER BY created_at DESC LIMIT 2;
-- PAYMENT_RECEIVED + CREATOR_EARNINGS with matching kobo amounts
```

---

### TC-A3: Creator sees correct balance

**Steps:** `GET /api/v1/payments/payouts/balance` (Creator JWT)
**Expected:** `availableBalance` = milestone amount as decimal string
**Failure condition:** Returns 0 — means demo payment providerRef not matching filter, or ledger not updated

---

### TC-A4: Creator requests payout

**Steps:** `POST /api/v1/payments/payouts` `{ "amount": 50000 }`
**Expected:** Payout COMPLETED (demo), `providerRef = "DEMO_<id>"`
**DB check:**
```sql
SELECT status, "providerRef" FROM payouts WHERE "userId" = 'CREATOR_ID';
```
**Ledger check:** `PAYOUT_DEMO` entry with correct kobo amount

---

### TC-A5: Creator balance is zero after payout

**Steps:** `GET /api/v1/payments/payouts/balance`
**Expected:** `availableBalance: "0.00"`

---

## Group B — Duplicate and retry protection

### TC-B1: Duplicate webhook event

**Steps:**
1. Send valid `charge.success` webhook for reference `PV_test-1`
2. Send same webhook again (identical body + signature)
**Expected:**
- First call: `{ received: true, processed: true }`
- Second call: `{ received: true, processed: false, reason: "duplicate" }`
**DB check:** Only one entry in `webhook_events` for `webhook_PV_test-1_charge.success`

---

### TC-B2: Duplicate payment for same milestone

**Steps:**
1. Initialize payment → confirm → milestone becomes PAID
2. Try `POST /api/v1/payments/initialize` again with same milestoneId
**Expected:** `409 Conflict — Payment already in progress or completed for this milestone`

---

### TC-B3: Payout retry on FAILED payment reference

**Steps:**
1. Create a Payment with status FAILED for a milestone
2. Try initialize payment for the same milestone again
**Expected:** Succeeds — service deletes the FAILED record and creates a new PENDING one
**DB check:** Only one Payment row for the milestoneId, status PENDING

---

## Group C — Concurrent withdrawal protection

### TC-C1: Two simultaneous payout requests

This test requires two concurrent requests. Use a simple script:

```bash
# Two simultaneous payout requests (both for the full balance)
curl -X POST http://localhost:5000/api/v1/payments/payouts \
  -H "Authorization: Bearer CREATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 50000}' &

curl -X POST http://localhost:5000/api/v1/payments/payouts \
  -H "Authorization: Bearer CREATOR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": 50000}' &

wait
```

**Expected:** Exactly one succeeds (200/201), the other fails with `400 Amount exceeds available balance`
**DB check:** Only one Payout row for the Creator

---

## Group D — Security

### TC-D1: Forged webhook signature

**Steps:**
```bash
curl -X POST http://localhost:5000/api/v1/payments/webhook/payaza \
  -H "Content-Type: application/json" \
  -H "x-payaza-signature: fakedeadbeef" \
  -d '{"event":"charge.success","data":{"transaction_reference":"PV_forged"}}'
```
**Expected:** `401 Invalid signature`
**DB check:** No new payment rows with status COMPLETED

---

### TC-D2: Webhook with no PAYAZA_SECRET_KEY set

**Steps:** Temporarily set `PAYAZA_SECRET_KEY=` (empty) and restart backend
**Expected:** `401 Webhook not configured` on any webhook call
**Note:** Restore the key before continuing other tests

---

### TC-D3: Creator cannot access another Creator's funds

**Steps:**
1. Create Creator A and Creator B
2. Brand pays Creator A's milestone
3. Try `POST /api/v1/payments/payouts` as Creator B for Creator A's amount
**Expected:** `400 Amount exceeds available balance` for Creator B (their balance is 0)

---

### TC-D4: Brand cannot trigger Creator payout

**Steps:** `POST /api/v1/payments/payouts` with Brand JWT
**Expected:** `403 Forbidden — Only creators can request a payout`

---

### TC-D5: Amount / currency mismatch on webhook

**Steps:** Send a `charge.success` webhook where `data.amount` is less than the Payment.amount
**Expected:** Payment moves to FAILED, NOT COMPLETED

---

## Group E — Failed payout handling

### TC-E1: Payout rejected by provider (sandbox mode)

**Steps:** Configure sandbox mode with keys that cause Payaza to reject the payout
**Expected:**
- Payout status: FAILED
- `failureReason` populated
- Creator balance restored to pre-payout value
- `PAYOUT_FAILED_REVERSAL` ledger entry exists

---

### TC-E2: Payout never resolved (network error)

**Steps:** Kill network mid-payout (or mock a timeout in the client)
**Expected:**
- Payout stays PENDING (not auto-failed on network error)
- Creator balance temporarily locked (by design — prevents overdraft)
- Admin can call `POST /api/v1/payments/payouts/{id}/reconcile` to resolve

---

## Group F — Financial record integrity

### TC-F1: Ledger balances are consistent after full flow

After TC-A1 through TC-A5:
```sql
SELECT
  la.id,
  la.label,
  la.balance_kobo,
  COALESCE(SUM(CASE WHEN le.credit_account_id = la.id THEN le.amount_kobo ELSE 0 END), 0)
  - COALESCE(SUM(CASE WHEN le.debit_account_id  = la.id THEN le.amount_kobo ELSE 0 END), 0)
  AS calculated_balance
FROM ledger_accounts la
LEFT JOIN ledger_entries le ON le.credit_account_id = la.id OR le.debit_account_id = la.id
GROUP BY la.id, la.label, la.balance_kobo;
-- balance_kobo MUST equal calculated_balance for every account
```

---

### TC-F2: No negative available balances

```sql
-- Should return zero rows
SELECT u.email, 
  COALESCE(SUM(p.amount) FILTER (WHERE p.status='COMPLETED'), 0) -
  COALESCE(SUM(po.amount) FILTER (WHERE po.status='COMPLETED'), 0) -
  COALESCE(SUM(po.amount) FILTER (WHERE po.status IN ('PENDING','PROCESSING')), 0) AS balance
FROM users u
JOIN payments p ON p."payeeId" = u.id
JOIN payouts po ON po."userId" = u.id
WHERE u.role = 'CREATOR'
GROUP BY u.email
HAVING (
  COALESCE(SUM(p.amount) FILTER (WHERE p.status='COMPLETED'), 0) -
  COALESCE(SUM(po.amount) FILTER (WHERE po.status='COMPLETED'), 0) -
  COALESCE(SUM(po.amount) FILTER (WHERE po.status IN ('PENDING','PROCESSING')), 0)
) < 0;
```
