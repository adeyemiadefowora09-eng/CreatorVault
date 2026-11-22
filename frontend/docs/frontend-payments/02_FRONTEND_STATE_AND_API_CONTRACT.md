# 02 — Frontend State & API Contract

> **⚠ Written against the pre-escrow backend.** This document was produced before the "true escrow, double-entry ledger" rewrite landed on `main`. Where it says the flow is *approve, then pay* (`APPROVED → PAID`) or that there is *no escrow state*, that is now out of date: milestones are funded into escrow first, work starts after funding, and approval releases funds. The frontend code in this repo has been merged with the escrow UI, but this document has not been re-verified against the new backend contract (`/payments/mode`, demo-mode confirm, ledger balances). Treat the details below as a starting point and re-check them before relying on them.

All endpoints are under `NEXT_PUBLIC_API_URL` (default `http://localhost:5000/api/v1`). Success envelope: `{ success, message, data, meta? }`. Money fields from Prisma arrive as **strings** (`"5000.00"`); balance endpoints return **numbers**. The client parses both into integer minor units (`src/lib/money.ts`).

## UI flow → endpoint map

| UI action | Hook / component | Endpoint | Role | Notes |
|---|---|---|---|---|
| Brand clicks **Pay securely** on an APPROVED milestone | `PayButton` → `useInitializePayment` | `POST /payments/initialize` `{dealId, milestoneId}` + `Idempotency-Key` header | BRAND | Returns `{ payment, checkoutUrl }`. Changes **no** balance/status on the client |
| Provider returns brand to app | `payments/verify/[reference]/page.tsx` → `useVerifyPayment` | `POST /payments/verify/:reference` | payer or payee | Polled every 3s, max 40 polls (~2 min), then manual "Check again" |
| Payments list | `usePayments` | `GET /payments` | any | `["payments","list"]` |
| Stats cards | `usePaymentStats` | `GET /payments/stats` | any | creators: `earned`,`pending`; brands: `spent` |
| Creator balance | `usePayoutBalance(enabled)` | `GET /payments/payouts/balance` | CREATOR | `{ totalEarned, totalPaidOut, pendingPayouts, availableBalance, currency }` |
| Payout history | `usePayouts(enabled)` | `GET /payments/payouts` | CREATOR | Polled every 10s while any payout is `PENDING`/`PROCESSING` |
| Request withdrawal | `useRequestPayout` | `POST /payments/payouts` `{amount:number}` + `Idempotency-Key` | CREATOR | Backend needs bank name/number/account-name saved on profile first |
| Save bank details | profile page → `useUpdateCreatorProfile` | `PATCH` creator profile | CREATOR | Free text; client enforces 10-digit account number |
| Role / identity | `useMe` | `GET /auth/me` | any | Used as the trusted source of role on the payments page |

## Payment lifecycle (as the UI treats it)

| Backend `Payment.status` | Meaning | UI on the return page | Cache effect |
|---|---|---|---|
| `PENDING` | Created, provider hasn't confirmed | "Waiting for confirmation…" + "don't pay again", keeps polling | none |
| `PROCESSING` | In flight | same as above | none |
| `COMPLETED` | Backend confirmed with provider or via signed webhook | "Payment confirmed" + amount | invalidate `payments`, `deals` |
| `FAILED` | Provider declined | "Payment didn't go through" + link back to milestones | invalidate `payments`, `deals` |
| `REFUNDED` | Refunded | "Payment refunded" | invalidate |
| (poll limit hit) | still not terminal | "Still waiting…" + **Check again**; no scary failure | none |

Milestone moves `APPROVED → PAID` **only** server-side, after confirmation. The client never writes it.

## Payout lifecycle

| `Payout.status` | UI | Polling |
|---|---|---|
| `PENDING` | "Pending" | every 10s |
| `PROCESSING` | "Processing" | every 10s |
| `COMPLETED` | "Completed" | stops; balance refetched |
| `FAILED` | "Failed" + `failureReason` | stops; balance refetched |
| any other (e.g. `REVERSED`) | rendered with a neutral style, never crashes | stops |

The backend currently has no `REVERSED` and nothing that settles payouts after `PROCESSING` — see audit §4.

## Error handling contract

`getApiErrorMessage` (`src/lib/payments.ts`):
- No response (network down) → tells the user **not to pay again**, to check history first.
- Server `message` string → shown as-is (server messages are written for users).
- `429` → "Too many attempts".
- `5xx` / unknown → generic, no internal details.

Specific backend errors the UI relies on: `403 "Only the brand can pay"`, `400 "Milestone not approved yet"`, `409 "Payment already in progress or completed"`, `404 "Payment not found"`, `403 "You are not a party to this payment"`, `400 "Add your bank details…"`.

## Cache keys (React Query)

```
["payments","list"] ["payments","stats"] ["payments","verify",<ref>]
["payments","payouts","balance"] ["payments","payouts","list"]
["deals", ...]  (deals, deal detail, and ["deals",id,"milestones"])
```
Invalidating `["payments"]` refreshes every payment view; `["deals"]` refreshes deals and milestones.

## Idempotency

The client generates one UUID per click/withdrawal *intent*, reuses it for retries of that intent, and replaces it after success. It is sent as `Idempotency-Key`. **The backend currently ignores it**, so today protection is the client-side lock only. To make it real, the backend should store `(userId, key) → response` and replay it.

## Backend contract gaps the UI is waiting on

1. Bank list + account-name resolve (e.g. `GET /payments/banks`, `POST /payments/banks/resolve`).
2. Payout settlement updates (`PROCESSING → COMPLETED/FAILED`), ideally with `REVERSED`.
3. Honouring `Idempotency-Key`.
4. Confirmed Payaza verify path/response and webhook signature scheme.
