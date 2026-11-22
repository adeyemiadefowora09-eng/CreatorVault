# 04 — UI End-to-End Test Script (Brand funds → Creator withdraws)

> **⚠ Written against the pre-escrow backend.** This document was produced before the "true escrow, double-entry ledger" rewrite landed on `main`. Where it says the flow is *approve, then pay* (`APPROVED → PAID`) or that there is *no escrow state*, that is now out of date: milestones are funded into escrow first, work starts after funding, and approval releases funds. The frontend code in this repo has been merged with the escrow UI, but this document has not been re-verified against the new backend contract (`/payments/mode`, demo-mode confirm, ledger balances). Treat the details below as a starting point and re-check them before relying on them.

## 0. Before you start

- [ ] Backend running (default `:5000`), frontend running (`npm run dev`, `:3000`).
- [ ] Backend `CORS_ORIGIN` is exactly `http://localhost:3000` (no trailing slash). **Restart the backend after editing `.env`.**
- [ ] You know whether your Payaza keys are **sandbox or live** (`PAYAZA_BASE_URL` currently points at `router-live`). Use the smallest real amount if live.
- [ ] Two accounts: a **Brand** and a **Creator**, each in its own browser profile (or one normal + one incognito window) so tokens don't overwrite each other.
- [ ] A deal between them with at least one milestone you can take to `APPROVED`.
- [ ] Open DevTools (F12) → **Network** tab, tick **Preserve log**.

## A. Brand — fund a milestone

| # | Do | Expect | Check in DevTools |
|---|---|---|---|
| A1 | Log in as Brand | Dashboard loads | Network: `POST /auth/login` 200 |
| A2 | Open `/payments` | Brand sees "Total spent"; **no** "Withdraw" card | Network: **no** `/payments/payouts*` requests (they're creator-only; before the fix they returned 403) |
| A3 | Open the deal → Milestones. Creator submits work, Brand clicks **Approve** | Milestone shows `APPROVED` and a **Pay securely** button | — |
| A4 | Double-click **Pay securely** fast | Button locks immediately ("Opening secure checkout…") | Network: exactly **one** `POST /payments/initialize`, with header `Idempotency-Key` |
| A5 | Page navigates (same tab) to Payaza | URL host is the Payaza checkout host | If you see "couldn't verify the payment page address" → add that host to `NEXT_PUBLIC_CHECKOUT_HOST_ALLOWLIST` |
| A6 | Complete payment (test card / transfer) | Redirected back to `/payments/verify/PV_…` | URL path is `PV_<digits>_<digits>` |
| A7 | Watch the return page | "Confirming…" → "Waiting for confirmation…" → **"Payment confirmed"** with the right amount | Network: repeated `POST /payments/verify/PV_…` about every 3s, stopping on `COMPLETED` |
| A8 | Click "Back to milestones" | Milestone now `PAID` **without a manual refresh** | — |
| A9 | Open `/payments` | Payment row `Completed` with `-₦…`; "Total spent" updated | — |

**Tamper tests (should all be harmless):**
- [ ] Visit `/payments/verify/PV_1_1?status=success&trxref=anything` for a payment you did **not** make → "We couldn't find a payment…" (backend 403/404). The query params change nothing.
- [ ] Visit `/payments/verify/not-a-reference` → "Invalid payment link", **no** API call in Network.
- [ ] Close the tab on the Payaza page, reopen the app → `/payments` shows **"You have a payment in progress → Check payment status"**.
- [ ] Throttle to **Offline** while on the return page → message says *don't pay again*, **Check again** works once back online.

## B. Creator — payout setup

| # | Do | Expect |
|---|---|---|
| B1 | Log in as Creator (separate profile) → `/payments` | Balance card shows **Available / Payouts in progress / Paid out / Total earned** |
| B2 | After A7, refresh `/payments` | Available balance includes the milestone (up to backend processing) |
| B3 | Go to `/profile`, enter bank name, account number, account name | Entering `12345` → "Account number must be exactly 10 digits." Enter 10 digits → saves |
| B4 | Switch to the **Brand** window and open `/payments` | No Withdraw card and no `/payments/payouts*` calls — role isolation holds |

> **Known gap:** there is no bank list or account-name resolution yet (backend endpoints missing). Double-check the account name and number by eye — the money goes to exactly what you type.

## C. Creator — withdraw

| # | Do | Expect | Check |
|---|---|---|---|
| C1 | Type `abc`, `-5`, `0`, `1.234` | Inline error each time; button disabled | — |
| C2 | Type more than Available | "That's more than your available balance."; disabled | — |
| C3 | Type a valid amount (e.g. `100.50`) and double-click **Request payout** | One request only | Network: one `POST /payments/payouts` body `{"amount":100.5}` + `Idempotency-Key` |
| C4 | After success | Green confirmation; input clears; history row appears | Balance **drops**, "Payouts in progress" **rises** with no manual reload |
| C5 | Wait | Status auto-refreshes every ~10s | Network: `GET /payments/payouts` repeating while `PENDING/PROCESSING` |
| C6 | Force an error (stop the backend, submit) | Message about connection; button re-enables; **same** idempotency key is reused on retry | — |

> **Expected today:** payouts may stay `PROCESSING` — the backend has no settlement callback (audit §4). That's a backend gap, not a UI fault.

## D. Security spot-checks

- [ ] DevTools → Application → Local Storage: only `creatorvault-auth` (tokens + user). No bank details, no card data.
- [ ] DevTools → Sources/Network: search responses and JS for `sk_`, `secret`, `whsec` — nothing.
- [ ] Response headers on any page include `X-Frame-Options: DENY` and the CSP above.
- [ ] Try framing the app (`<iframe src="http://localhost:3000">` in a local HTML file) → blocked.
- [ ] Expire/clear the access token only (keep refresh token), reload `/profile` → it should silently refresh, not log you out (the `/auth/me` refresh fix).

## E. Pass criteria

All A–C rows behave as expected, no secret appears in D, and the only failures are the documented backend gaps (bank resolution, payout settlement, server-side idempotency).
