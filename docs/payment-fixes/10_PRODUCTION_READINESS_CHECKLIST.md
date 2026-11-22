# 10 — PRODUCTION READINESS CHECKLIST

> [!CAUTION]
> Do not handle real customer money until every item in this checklist is confirmed. Items marked 🔴 are hard blockers — the system will silently fail or lose money without them.

---

## Secrets and configuration 🔴

- [ ] All `.env` values rotated after the zip leak (see `06_ENVIRONMENT_VARIABLES.md`)
- [ ] `backend/.env` is in `.gitignore` and confirmed absent from git history
- [ ] `PAYMENTS_MODE=live` and both Payaza keys are set
- [ ] `PAYAZA_ACCOUNT_REFERENCE` is set and the account is funded
- [ ] `PAYAZA_TRANSACTION_PIN` is set
- [ ] Server public IP is whitelisted in Payaza Dashboard → Developers
- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET` are ≥ 64 random bytes

---

## Database 🔴

- [ ] `npx prisma migrate deploy` has been run (NOT `prisma db push`)
- [ ] `ledger_accounts`, `ledger_entries`, `webhook_events` tables exist
- [ ] `failureReason` column exists on `payouts`
- [ ] Database has daily automated backups configured
- [ ] Backup restore procedure has been tested

---

## Payaza provider setup 🔴

- [ ] KYB is fully approved
- [ ] Collections (card or virtual account) is enabled on the account
- [ ] Bank transfer / payout is enabled on the account
- [ ] No PND restriction on the account
- [ ] Webhook URL is registered for all relevant event types
- [ ] A sandbox test payment has been successfully processed end-to-end
- [ ] A sandbox payout has been successfully processed end-to-end
- [ ] Exact webhook body shape confirmed from sandbox delivery logs
- [ ] HMAC signature verification tested with real Payaza delivery (not just manual curl)

---

## Code fixes applied 🔴

- [ ] `backend/src/config/env.ts` — `PAYMENTS_MODE` schema
- [ ] `backend/src/modules/payments/payaza.client.ts` — correct auth header
- [ ] `backend/src/modules/payments/payments.service.ts` — full replacement
- [ ] `backend/src/modules/payments/payments.webhook.ts` — full replacement
- [ ] `backend/src/modules/payments/payments.routes.ts` — webhook rate limiter
- [ ] `backend/src/modules/payments/payments.controller.ts` — bankEnquiry, reconcile
- [ ] `backend/src/modules/payments/payments.validation.ts` — bankCode required
- [ ] `backend/src/app.ts` — raw-body middleware before express.json

---

## Frontend 🔴

- [ ] Frontend `payments/page.tsx` reads `?reference=` on mount and calls `POST /verify/:reference` to handle Payaza redirect-back
- [ ] Creator bank detail form calls `POST /api/v1/payments/bank-enquiry` and shows resolved name for confirmation before saving
- [ ] `bankCode` field is included in the creator profile form

---

## Financial integrity

- [ ] `markPaymentCompletedForWebhook` runs in a single `prisma.$transaction`
- [ ] `requestPayout` uses SERIALIZABLE isolation + `SELECT FOR UPDATE`
- [ ] No Payment or Payout is marked COMPLETED without real provider confirmation (sandbox or live)
- [ ] `ledger_entries` has no rows with `idempotency_key` duplicates
- [ ] Ledger balance reconciliation query (TC-F1 in `09_PAYMENT_TEST_CASES.md`) passes

---

## Security

- [ ] `PAYAZA_SECRET_KEY` never appears in any log line
- [ ] `PAYAZA_SECRET_KEY` never sent in an Authorization header
- [ ] Webhook returns 401 when secret is unset
- [ ] Webhook uses `crypto.timingSafeEqual` for signature comparison
- [ ] Webhook checks `webhook_events` before processing (idempotency)
- [ ] Creator cannot access another creator's balance (TC-D3 passes)
- [ ] Brand cannot trigger a Creator payout (TC-D4 passes)
- [ ] Forged webhook is rejected (TC-D1 passes)

---

## Operational

- [ ] A reconciliation procedure exists for stuck PENDING payouts (see `reconcilePayoutStatus`)
- [ ] Admin can call `POST /api/v1/payments/payouts/{id}/reconcile` to resolve stuck payouts
- [ ] Application logs are written to a persistent log sink (not just console)
- [ ] Error alerting is configured for 5xx responses
- [ ] A process exists to monitor `payouts` table for rows stuck in PROCESSING > 24h

---

## Tests

- [ ] TC-A1 through TC-A5 pass (happy path demo)
- [ ] TC-B1 (duplicate webhook) passes
- [ ] TC-B2 (duplicate payment) passes
- [ ] TC-C1 (concurrent withdrawals) passes — only one succeeds
- [ ] TC-D1 (forged webhook) passes — 401
- [ ] TC-D3 (cross-creator access) passes — balance isolation confirmed
- [ ] TC-F1 (ledger balance consistency) passes — no discrepancies

---

## Not required for MVP but strongly recommended before scaling

- [ ] Platform fee/commission model implemented and taken from escrow before creator earnings
- [ ] Dispute hold: open disputes block creator withdrawals on the disputed deal
- [ ] Deal cancellation refund flow implemented
- [ ] Automated payout status polling job for PROCESSING payouts
- [ ] Rate limiting on login endpoint uses `authLimiter` (already defined)
- [ ] Bank detail change cooling-off period (e.g. 24h before payout allowed after change)
- [ ] Email notifications for payment events (Resend integration)
- [ ] Admin dashboard showing platform ledger balances
