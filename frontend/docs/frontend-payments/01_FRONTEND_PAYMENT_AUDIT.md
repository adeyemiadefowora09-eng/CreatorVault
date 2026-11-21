# 01 — Frontend Payment Audit

> **⚠ Written against the pre-escrow backend.** This document was produced before the "true escrow, double-entry ledger" rewrite landed on `main`. Where it says the flow is *approve, then pay* (`APPROVED → PAID`) or that there is *no escrow state*, that is now out of date: milestones are funded into escrow first, work starts after funding, and approval releases funds. The frontend code in this repo has been merged with the escrow UI, but this document has not been re-verified against the new backend contract (`/payments/mode`, demo-mode confirm, ledger balances). Treat the details below as a starting point and re-check them before relying on them.

Scope: `frontend/` (Next.js 16 App Router, React 19, Tailwind v4, React Query, Zustand, Axios). The backend was read **only** to map the API contract; nothing in `backend/` was changed.

## Verdict (before the fixes in this package)

**No — the end-to-end Brand → Creator test could not complete from the UI.** The two blockers were a missing payment-return route (brands land on a 404 after paying) and no way to see the payment become confirmed. Both are fixed here. Items that need backend work are listed in section 4.

## 1. Architecture found

| Area | Finding |
|---|---|
| Framework | Next.js 16.3.4 App Router, client-rendered dashboard (`(dashboard)/layout.tsx` is `"use client"`) |
| Data layer | React Query (`src/hooks/*`) + one Axios instance (`src/lib/api.ts`) with JWT attach + 401 refresh/retry |
| Auth state | Zustand `authStore`, persisted to `localStorage` (`creatorvault-auth`): user, access token, refresh token |
| Route protection | `(dashboard)/layout.tsx` redirects only when **not authenticated**. No role-based route guards, no `middleware`/`proxy` |
| Payment provider | **Payaza hosted checkout via redirect.** No client SDK, no script tag, no iframe |
| Payment UI | `payments/page.tsx` (history + withdraw), `deals/[dealId]/milestones/page.tsx` ("Pay" button) |
| Client env | Only `NEXT_PUBLIC_API_URL`. No secrets found anywhere in `src/`, `.env.local`, `next.config.ts`, `package.json` |

## 2. Money-state flow map (as built)

```
BRAND
 Milestone SUBMITTED ──Approve──▶ APPROVED ──"Pay"──▶ POST /payments/initialize
                                                         │ creates Payment PENDING (server)
                                                         ▼ returns checkoutUrl
   (this package) validate URL ─▶ same-tab redirect to Payaza hosted checkout
                                                         │ user pays
                                                         ▼
   Payaza redirects to  {CORS_ORIGIN}/payments/verify/{reference}        ◀── route did NOT exist
                                                         │
   (this package) page polls POST /payments/verify/{reference}
        backend asks Payaza → Payment COMPLETED, Milestone → PAID, creator notified
        (signed webhook POST /payments/webhook/payaza is the second, independent path)

CREATOR
 GET /payments/payouts/balance ─▶ available = earned − paidOut − (pending+processing payouts)
 Profile: bankName / bankAccountNumber / bankAccountName (free text, saved to creatorProfile)
 POST /payments/payouts {amount} ─▶ Payout PENDING ─▶ best-effort transfer ─▶ PROCESSING
                                                         └─ no settlement callback found (see §4)
```

**Product note (not a bug, but know it):** the implemented flow is *approve, then pay* (`APPROVED → PAID`). There is no "funded escrow held until approval" state anywhere in the schema or UI. The UI therefore labels creator `stats.pending` as **"Awaiting payment confirmation"**, not "In escrow", so it doesn't claim a safeguard the system doesn't have. If you need true escrow-first funding, that is a backend + product change.

## 3. Working / not-working assessment

| # | Question | Before | After this package | Evidence (original paths/lines) |
|---|---|---|---|---|
| A | Brand isolated from Creator routes/actions | `PARTIALLY WORKING` | `PARTIALLY WORKING` (improved) | Server enforces `requireRole` (`payments.routes.ts`). Client guard only checks `isAuthenticated` (`(dashboard)/layout.tsx:19`); creator-only UI keyed off the **localStorage** role (`payments/page.tsx:206`). Brands also fired creator-only `GET /payments/payouts` and got 403s (`payments/page.tsx:204`). Now: role comes from server `GET /auth/me`; payout queries disabled for brands. Residual: no route-level guard (needs cookie/middleware) — low risk because the API is authoritative |
| B | Initiate real payment, idempotency | `PARTIALLY WORKING` | `PARTIALLY WORKING` | Init works (`usePayments.ts:17-28`). No double-click lock; no idempotency. Backend only blocks `COMPLETED/PROCESSING`, so two quick calls create two `PENDING` payments (`payments.service.ts:20-25`). Now: synchronous submit lock + per-intent `Idempotency-Key` header. **Backend does not read the header yet** → `REQUIRES BACKEND ENDPOINT` for true server-side dedupe |
| C | Checkout without script/CORS/CSP failures | `BLOCKED BY CONFIGURATION` | `BLOCKED BY CONFIGURATION` | Redirect flow, so no SDK/CORS/CSP exposure. But `window.open` ran inside an async callback (`milestones/page.tsx:163-168`) — popup blockers silently kill it. Now: same-tab redirect. Needs: Payaza checkout host in the allow-list (default `payaza.africa`) and backend `CORS_ORIGIN` = real frontend origin |
| D | Callback handled without falsely marking "Paid" | `BROKEN` | `WORKING` (pending live test) | Backend sets `callback_url = {CORS_ORIGIN}/payments/verify/{reference}` (`payments.service.ts:58`); **no such route existed** → 404. Now: `payments/verify/[reference]/page.tsx` — validates the reference, ignores all query params, polls backend, shows "confirmed" only on `COMPLETED` |
| E | Accurate Brand transaction/escrow status | `PARTIALLY WORKING` | `WORKING` (pending live test) | No refresh after paying; milestone/payment lists went stale. Now invalidates `payments` and `deals` (milestones share that prefix) when verification reaches a terminal state |
| F | Creator bank/payout verification | `NOT IMPLEMENTED` | `REQUIRES BACKEND ENDPOINT` | Free-text bank name/number/name (`profile/page.tsx:158-168`). No bank-list or account-resolve endpoint exists in `backend/`. Client now enforces exactly-10-digit NUBAN format. Name resolution/confirmation cannot be done client-side |
| G | Accurate Pending vs Available, exact precision | `PARTIALLY WORKING` | `WORKING` | Hardcoded `"NGN"` ignoring `currency` (`payments/page.tsx:126,132,138,221-225`); `parseFloat`/float compare. Now: BigInt minor-unit math (`lib/money.ts`), record currency, relabelled breakdown |
| H | Valid withdrawal request with checks | `PARTIALLY WORKING` | `WORKING` | `Number(amount) > available` float compare, no submit lock (`payments/page.tsx:155-181`). Now: exact 2-dp validation, over-balance check, submit lock, server error message surfaced. Server remains authoritative (I did not audit backend transaction atomicity — out of frontend scope, worth a check) |
| I | Track withdrawal states, failed/reversed | `PARTIALLY WORKING` | `PARTIALLY WORKING` | Statuses render, but no polling (stale until reload) and a lookup miss on any new status would crash the row. Now: polls every 10s while `PENDING/PROCESSING`, unknown statuses render safely (incl. `REVERSED`). **Backend has no `REVERSED` and no payout-settlement webhook** (`payments.webhook.ts` handles only `charge.success`) → payouts can sit in `PROCESSING` indefinitely: `REQUIRES BACKEND ENDPOINT` |
| J | Consistent history, no stale cache | `PARTIALLY WORKING` | `WORKING` | Payout success only invalidated `["payments","payouts"]` (`usePayments.ts:82-84`), leaving stats/list stale. Now invalidates the whole `payments` prefix on settle |

## 4. Risks & backend dependencies (not changed — your call)

1. **Webhook signature** (`payments.webhook.ts:14-18`): HMAC is computed over `JSON.stringify(req.body)` (re-serialised, not the raw bytes) and compared with `!==`. Payaza's real scheme is unconfirmed (the code comment says so). Needs raw-body capture + constant-time compare, verified against Payaza docs.
2. **Payout settlement**: no webhook/poller moves payouts from `PROCESSING` to `COMPLETED/FAILED`. Creators will see "Processing" forever.
3. **Bank list + account-name resolution** endpoints missing (needed for F).
4. **Idempotency**: `Idempotency-Key` header is sent but ignored; duplicate `PENDING` payments are possible server-side.
5. **Verify endpoint**: path/response shape marked unconfirmed in the code comments (`payments.service.ts:107-111`).
6. **`PAYAZA_BASE_URL` points at `router-live.payaza.africa`** — by hostname that is the *live* router. I can't tell whether the keys are live or sandbox. Run this test with sandbox credentials or the smallest possible real amount.
7. **Secrets hygiene**: the `backend.zip` you sent contained a populated `.env` (database URL, JWT secrets, provider and email keys). I did not copy any values anywhere. If that zip went anywhere beyond this chat, rotate those secrets. Your root `.gitignore` already excludes `.env`.
8. **Tokens in `localStorage`** (access + refresh): readable by any XSS. Accepted trade-off for now; httpOnly cookies are the proper fix (backend + frontend change).
9. `callback_url` is built from `CORS_ORIGIN`; per environment it must equal the exact frontend origin with no trailing slash.

## 5. Client-side security results

| Check | Result |
|---|---|
| Secret keys in client code / bundle config | **None found** (`sk_*`, `whsec`, provider names, private keys searched) |
| Client-exposed env | Only `NEXT_PUBLIC_API_URL` (public by design) |
| `.env.local` committed? | Excluded by `frontend/.gitignore` (`.env*`) |
| Trusting URL/query values | Fixed: only the path `reference` is read, format-checked; `trxref`/`status`/etc. ignored |
| Open redirect / phishing via checkout URL | Fixed: https-only + host allow-list before navigating |
| `console.*` logging of sensitive data | None in `src/` |
| Sensitive data in storage | Tokens + user object in `localStorage` (see risk 8). Pending-payment recovery stores only a reference in `sessionStorage` |
| Error messages leaking internals | Fixed: removed UI text telling users to check `PAYAZA_API_KEY` in `backend/.env` |
| Clickjacking on pay/withdraw | Fixed: `frame-ancestors 'none'` + `X-Frame-Options` |
| Refresh bug | Fixed: GET `/auth/me` was excluded from token refresh, so an expired token broke profile/payout screens instead of refreshing |

## 6. Verification performed

- `tsc --noEmit`: **0 errors** (whole project).
- ESLint on every file changed: **0 errors, 0 warnings**.
- Whole-project ESLint still reports 6 errors / 2 warnings in files I did not touch (e.g. `components/ui/count-up.tsx` setState-in-effect, an unused var in `trust-score/index.tsx`). They pre-date this work.
- `next build` could **not** be run to completion in my sandbox (no internet for Google Fonts, missing native CSS binary). Run `npm run build` locally; typecheck passing makes a compile error unlikely, but it is not the same proof.
- **No live payment was executed.** Everything marked "pending live test" needs the walkthrough in `04_UI_END_TO_END_TEST_SCRIPT.md`.
