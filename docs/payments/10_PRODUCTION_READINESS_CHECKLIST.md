# 10 — Production readiness (before real customer money)

## Verdict today
**Not ready for live funds.** The code now implements a correct escrow + ledger design and compiles, but it has not been run against PostgreSQL or Payaza yet. Do not enable `live` until every box below is ticked.

## Blockers I cannot do for you
- [ ] **Rotate every secret in the files you uploaded** (`_env`, `backend/.env`): database password, JWT secrets, Payaza keys, AI key, Cloudinary, Resend. Treat them as public. Remove `.env` from zips and git history; confirm `.gitignore` covers it.
- [ ] Run `npx prisma migrate deploy` on a copy of your DB; confirm no drift (doc 04).
- [ ] Run unit + integration tests with real vitest and a real Postgres; all green.
- [ ] Complete doc 08 in Payaza sandbox, including a transfer webhook (`NIP_SUCCESS`) and a failure.
- [ ] Payaza live: KYC/KYB, keys, PIN, PND lifted, IP whitelist (needs a **static egress IP** — many hosts rotate IPs; use a fixed-IP/NAT add-on), balance funded, webhooks (Live) set, products enabled.
- [ ] Small real-money round trip (₦1,000 in, ₦1,000 out) and reconcile Payaza statement ↔ ledger by hand.

## Engineering still recommended
- [ ] **Provider fees:** Payaza's collection/transfer fees aren't in the ledger. Decide who bears them (platform vs creator) and add `PROVIDER_FEES` postings so `PROVIDER_CASH` matches Payaza's balance; today the integrity report shows the gap informationally.
- [ ] Daily reconciliation job comparing Payaza statement/balance to the ledger, with alerting on `/payments/admin/integrity` (`healthy:false`), `REVIEW` payments, stale payouts, failed webhook events, `CRITICAL_PAYOUT_SUCCEEDED_AFTER_REVERSAL` audit rows.
- [ ] Admin UI (today: API only) for the review queue, escrow decisions, refund settlement.
- [ ] Brand refunds are manual bank transfers: define the SOP and who approves (two-person rule).
- [ ] Dispute policy for money **already released** (currently only escrow is frozen).
- [ ] Step-up auth (OTP/re-entry of password) for bank change and withdrawal; email notification on bank change (in-app notification exists). Verify the resolved bank account name against the creator's KYC name.
- [ ] KYC/AML: Nigerian regulatory position of holding customer funds in escrow (licensing, CBN/NDPR), terms of service, dispute/refund policy, transaction limits and velocity checks. **Get legal/compliance advice; I'm not a lawyer.**
- [ ] Multi-instance deployment: reconciler is idempotent and row-locked, so safe, but add a distributed lock/queue if you scale out. `app.set('trust proxy')` for correct IPs behind a proxy.
- [ ] Rate limits/WAF on money routes (30/15 min per IP exist), request logging without PII, structured alerts, DB backups with point-in-time recovery, restore drill, Sentry or similar.
- [ ] Dependency/secret scanning in CI; pin Node; run `npm audit`.
- [ ] Legacy `isDemo` data: leave (hidden) or purge after backup.
- [ ] Only NGN is supported; add currency handling before accepting anything else.

## Go-live gate
Live mode needs all three: `PAYMENTS_MODE=live`, `PAYMENTS_LIVE_CONFIRM=I_UNDERSTAND_THIS_MOVES_REAL_MONEY`, `NODE_ENV=production`. Start with a small cap (`PAYOUT_MAX_AMOUNT`) and a few trusted users.
