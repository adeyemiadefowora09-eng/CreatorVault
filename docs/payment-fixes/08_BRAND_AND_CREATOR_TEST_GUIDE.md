# 08 — BRAND AND CREATOR TEST GUIDE

## Prerequisites

- [ ] Backend is running: `cd backend && npm run dev`
- [ ] Frontend is running: `cd frontend && npm run dev`
- [ ] Database is migrated: `cd backend && npx prisma migrate deploy`
- [ ] `backend/.env` is set with at minimum `PAYMENTS_MODE=demo`
- [ ] You have two separate browser sessions (use Incognito for the second)

---

## STEP 1 — Create a Brand account

**Browser session A (normal window)**

1. Open `http://localhost:3000`
2. Click **Sign Up**
3. Fill in:
   - **Email:** `brand@test.com`
   - **Password:** `BrandPass123!`
   - **Name:** Test Brand
   - **Role:** Brand
4. Click **Create account**
5. You should be redirected to the Brand dashboard

**Verify:**
```bash
curl http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"brand@test.com","password":"BrandPass123!"}'
# Expected: { "success": true, "data": { "user": { "role": "BRAND" } } }
```

---

## STEP 2 — Create a Creator account

**Browser session B (Incognito window)**

1. Open `http://localhost:3000` in Incognito
2. Click **Sign Up**
3. Fill in:
   - **Email:** `creator@test.com`
   - **Password:** `CreatorPass123!`
   - **Name:** Test Creator
   - **Role:** Creator
4. Click **Create account**

**Verify Creator profile exists:**
```sql
SELECT u.id, u.role, cp.id as profile_id
FROM users u
LEFT JOIN creator_profiles cp ON cp."userId" = u.id
WHERE u.email = 'creator@test.com';
```

---

## STEP 3 — Creator: set up bank details

**In Browser session B (Creator)**

1. Go to **Profile** or **Settings**
2. Navigate to **Bank Details** / **Payout Settings**
3. Enter:
   - **Bank Name:** GTBank
   - **Bank Code:** 058
   - **Account Number:** 0123456789
   - **Account Name:** Test Creator

> [!NOTE]
> In `demo` mode the bank enquiry step (name resolution) is skipped by the client. In `sandbox` mode, `POST /api/v1/payments/bank-enquiry` must succeed before saving.

**Verify via API:**
```bash
# Get creator's access token first (login), then:
curl http://localhost:5000/api/v1/users/profile \
  -H "Authorization: Bearer CREATOR_TOKEN"
# Check creatorProfile.bankAccountNumber is populated
```

---

## STEP 4 — Brand: create a deal with the Creator

**In Browser session A (Brand)**

1. Navigate to **Deals → New Deal**
2. Select **Test Creator** as counterparty
3. Fill in deal details:
   - Title: `Test Deal`
   - Amount: `50000` (NGN)
   - Add at least one milestone: `Milestone 1`, Amount: `50000`
4. Submit the deal

**Verify deal and milestone in DB:**
```sql
SELECT d.id, d.status, m.id as milestone_id, m.status, m.amount
FROM deals d
JOIN milestones m ON m."dealId" = d.id
WHERE d.title = 'Test Deal';
```

---

## STEP 5 — Move the deal to ACTIVE and approve the milestone

For payment to be initializable, the milestone must be `APPROVED`.

**Creator (Session B):** Accept the deal → submit work on the milestone.

**Brand (Session A):** Approve the milestone submission.

```sql
-- After Brand approves:
SELECT status FROM milestones WHERE id = 'MILESTONE_ID_HERE';
-- Expected: APPROVED
```

---

## STEP 6 — Brand: initiate payment (Demo mode)

**In Browser session A (Brand)**

1. Navigate to **Payments** or the Deal page
2. Click **Pay Milestone** / **Fund Escrow**
3. The page shows the demo mode payment UI (no Payaza redirect in demo)
4. Click **Confirm Payment**

**What happens under the hood:**
1. `POST /api/v1/payments/initialize` → creates Payment(PENDING) with `providerRef=DEMO_PV_...`
2. `POST /api/v1/payments/mock/{reference}/confirm` → `markPaymentCompletedForWebhook()` runs atomically:
   - Payment → COMPLETED
   - Milestone → PAID
   - LedgerEntry: brand → platform_escrow
   - LedgerEntry: platform_escrow → creator wallet

**Verify:**
```sql
-- Payment completed
SELECT id, status, "providerRef", "paidAt" FROM payments
WHERE "payerId" = 'BRAND_USER_ID';

-- Milestone paid
SELECT id, status FROM milestones WHERE id = 'MILESTONE_ID';

-- Ledger entries created
SELECT type, amount_kobo, credit_account_id, description
FROM ledger_entries
ORDER BY created_at DESC LIMIT 5;
```

---

## STEP 7 — Creator: check balance

**In Browser session B (Creator)**

1. Navigate to **Payments → Balance** or **Payouts**
2. You should see `availableBalance: 50000.00 NGN`

**Via API:**
```bash
curl http://localhost:5000/api/v1/payments/payouts/balance \
  -H "Authorization: Bearer CREATOR_TOKEN"
# Expected: { "availableBalance": "50000.00", "currency": "NGN", "mode": "demo" }
```

---

## STEP 8 — Creator: request a payout

**In Browser session B (Creator)**

1. Navigate to **Payouts**
2. Enter amount: `50000`
3. Click **Withdraw**

**What happens:**
- `POST /api/v1/payments/payouts` runs with serializable transaction
- Balance re-verified inside lock
- Payout row created
- In demo mode: Payout immediately marked COMPLETED + demo ledger entry written

**Verify:**
```sql
SELECT id, status, amount, "providerRef", "completedAt"
FROM payouts
WHERE "userId" = 'CREATOR_USER_ID';
-- Expected: status=COMPLETED, providerRef=DEMO_<id>

SELECT availableBalance FROM (
  SELECT
    COALESCE(SUM(p.amount),0) -
    COALESCE(SUM(po.amount) FILTER (WHERE po.status='COMPLETED'),0) -
    COALESCE(SUM(po.amount) FILTER (WHERE po.status IN ('PENDING','PROCESSING')),0)
  AS availableBalance
  FROM payments p
  CROSS JOIN payouts po
  WHERE p."payeeId" = 'CREATOR_USER_ID' AND p.status = 'COMPLETED'
    AND po."userId" = 'CREATOR_USER_ID'
) balances;
-- Expected: 0 (all withdrawn)
```

---

## STEP 9 — Verify financial integrity

```sql
-- Full audit trail for the test deal
SELECT
  'payment' as record_type,
  p.id,
  p.status,
  p.amount::text,
  p."providerRef",
  p."createdAt"
FROM payments p WHERE p."dealId" = 'DEAL_ID'
UNION ALL
SELECT
  'payout',
  po.id,
  po.status,
  po.amount::text,
  po."providerRef",
  po."requestedAt"
FROM payouts po WHERE po."userId" = 'CREATOR_USER_ID'
ORDER BY "createdAt";

-- Ledger balance check
SELECT id, label, balance_kobo
FROM ledger_accounts
WHERE id IN ('platform_escrow', 'creator_CREATOR_ID');
-- After full withdrawal: creator balance = 0, escrow = 0
```

---

## Troubleshooting common failures

| Symptom | Likely cause | Fix |
|---|---|---|
| `Payment already in progress` | Stuck PENDING payment | Check DB; if FAILED/PENDING, the service now auto-deletes it on next initialize |
| `Amount exceeds available balance` | Concurrent request or demo/live mode mismatch | Check `PAYMENTS_MODE` matches the payment providerRef prefix |
| `Milestone not approved yet` | Wrong milestone status | Brand must approve milestone submission first |
| `Add your bank details first` | Creator profile missing bank fields | Complete Step 3 |
| `Missing bank code` | `bankCode` field empty | Update creator profile with valid bank code |
| Webhook returns 401 | Wrong `PAYAZA_SECRET_KEY` or empty key | Set the correct key in `.env` |
| Webhook returns 400 `Missing raw body` | Raw-body middleware not registered | Verify `app.ts` fix is applied |
