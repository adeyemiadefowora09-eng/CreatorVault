# 08 — Brand + Creator sandbox test (step by step)

Prereqs: docs 04–07 done (migration applied, `.env` sandbox, tunnel + webhook URL saved, `PAYOUT_COOLDOWN_HOURS=0`, `PAYOUT_MIN_AMOUNT=100`). Run backend `npm run dev` (5000) and frontend `npm run dev` (3000). Use **two different browsers/profiles** (one per role).

| # | Role | Do | Endpoint | Expect | Check in DB | If it fails |
|---|---|---|---|---|---|---|
| 0 | — | `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run create-admin` | — | "Created ADMIN" | `users.role='ADMIN'` | needs ≥12-char password |
| 1 | Brand | Register as **Brand**, log in | `POST /auth/register` | dashboard | `users.role=BRAND` | |
| 2 | Creator | Register as **Creator** (other browser) | same | dashboard | `role=CREATOR` | |
| 3 | Brand | Create a deal for the creator; add a milestone of **₦5,000**; propose | deals/milestones | PROPOSED | `deals`, `milestones.escrowStatus=UNFUNDED` | |
| 4 | Creator | Accept deal | `POST /deals/:id/accept` | ACTIVE | `deals.status` | |
| 5 | Creator | Open the milestone: sees "Waiting for the brand to fund escrow"; **no submit button** | — | as stated | | |
| 6 | Brand | Milestones page → **Fund escrow** | `POST /payments/initialize` | Bank + account no. + exact ₦5,000 + expiry | `payments`: PENDING, `vaAccountNumber`, unique `providerRef` (CV…) | 503 ⇒ `PAYMENTS_MODE`; 502 ⇒ keys/IP/Payaza error in server log (no secrets logged) |
| 7 | Brand | Click **Sandbox: simulate bank transfer** | `POST /payments/sandbox/:ref/simulate` | `requested` | provider call succeeds | 502 ⇒ test keys / VA not enabled |
| 8 | (auto) | Payaza webhook arrives | `POST /payments/webhook/payaza` | `provider_events.status=PROCESSED` | `payments.status=COMPLETED`, `amountReceived=5000`; **exactly one** `ledger_transactions` with key `fund:<paymentId>`; `milestones.escrowStatus=FUNDED` | No webhook? Click "I've paid — check status" (does the same verification) or wait ≤60 s for the reconciler. Check tunnel URL/Test-mode webhook setting |
| 9 | Brand | Verify | `GET /payments/stats` | "Held in escrow ₦5,000" | | |
| 10 | Creator | Refresh | `GET /payments/payouts/balance` | **In escrow ₦5,000, Available ₦0**; "Funded — held in escrow"; submit enabled | | |
| 11 | Creator | Try to withdraw ₦1,000 now | `POST /payments/payouts` | **400** "exceeds your available balance" (funds not yet eligible) | no payout row | |
| 12 | Creator | Submit work (note/link) | `POST /milestones/:id/submit` | SUBMITTED | | |
| 13 | Brand | **Approve** | `POST /milestones/:id/approve` | PAID | `ledger_transactions` `release:<milestoneId>`; escrow → creator | 409 ⇒ deal DISPUTED |
| 14 | Creator | Balance | payouts/balance | **Available ₦5,000** (minus fee if set), In escrow ₦0 | `USER_AVAILABLE` balance | |
| 15 | Creator | Payments page → Payout bank account: choose bank, enter a 10-digit account, **Verify account**, confirm the shown name, save | `POST /payments/bank/resolve`, `PUT /payments/bank` | name shown; saved | `creator_profiles.bankVerifiedAt` set | Sandbox may not support name enquiry for arbitrary accounts: ask Payaza for a test bank code/account |
| 16 | Creator | Withdraw ₦2,000 | `POST /payments/payouts` (+`Idempotency-Key`) | payout PROCESSING; Available ₦3,000 | `payouts` PENDING→PROCESSING; ledger `payout:<id>` | 400 ⇒ bank not verified / cooldown / below min |
| 17 | (auto) | Payaza transfer webhook | same endpoint | `NIP_SUCCESS` ⇒ COMPLETED | `payout-settled:<id>`; `payouts.status=COMPLETED` | stuck PROCESSING ⇒ reconciler queries status every 60 s; see `/payments/admin/integrity` |
| 18 | Admin | `GET /payments/admin/integrity` | | `ledgerBalanced:true`, `assetsEqualClaims:true`, no negatives, `healthy:true` | | |
| 19 | Brand | History | `GET /payments` | payment COMPLETED, milestone PAID | | |
| 20 | Both | **Duplicate checks:** double-click Fund (same VA returned, one payment); double-click Withdraw (same payout); replay a webhook (200 Duplicate) | | no second ledger rows | `SELECT count(*) FROM ledger_transactions GROUP BY "idempotencyKey" HAVING count(*)>1` ⇒ 0 rows | |

Cross-account check: log in as a *second* creator and call `GET /payments/payouts/balance` ⇒ ₦0; `POST /payments/verify/<ref of someone else's payment>` ⇒ 403.

What this does and doesn't prove: steps 6–19 prove the application, ledger and Payaza **sandbox** integration. They do **not** prove real bank settlement (see doc 10).
