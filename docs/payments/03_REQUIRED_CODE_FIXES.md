# 03 — Required code fixes (what changed, where, why)

Paths are relative to your repo root (`backend/…`, `frontend/…`). Everything in this zip is already in that layout: **unzip over your project**.

## A. DELETE this file
| File | Why |
|---|---|
| `backend/src/modules/payments/payments.webhook.ts` | Replaced by `webhook.ts`. The old one signs re-serialised JSON, uses `!==`, and imports a function that no longer exists (build fails if left). |

## B. NEW files (backend)
| File | Purpose |
|---|---|
| `modules/payments/payaza.client.ts` | The only Payaza caller. `Authorization: Payaza <base64 public key>`, `X-TenantID`, correct URLs/bodies per docs.payaza.africa, timeouts, ambiguity detection, no secret logging |
| `modules/payments/ledger.ts` | Double-entry posting, idempotency, balances, row locking |
| `modules/payments/money.ts` | Exact Decimal parsing/compare/fee (no floats) |
| `modules/payments/escrow.service.ts` | Initialise funding, verified confirmation, release, refunds |
| `modules/payments/payouts.service.ts` | Locked withdrawals, dispatch, settle/fail/reverse |
| `modules/payments/bank.service.ts` | Bank list, Payaza name enquiry, verified save, cooling-off |
| `modules/payments/webhook.ts` | Raw-body HMAC-SHA512 (base64 or hex), event store, idempotency |
| `modules/payments/reconciler.ts` | Lost-webhook / crash recovery |
| `modules/payments/admin.service.ts` | Integrity report, review queue, escrow decision, refund settlement |
| `modules/payments/audit.ts` | Append-only audit trail |
| `scripts/create-admin.ts` | Creates the first ADMIN (none could be created before) |
| `prisma/migrations/20261120000000_payments_escrow_ledger/migration.sql` | Schema + triggers (doc 04) |
| `tests/…`, `vitest.config.ts` | Unit + integration tests (doc 09) |

## C. REPLACED files (backend) — problem → fix
| File | Problem in old code | Fix |
|---|---|---|
| `config/env.ts` | Demo mode switched on by two env strings; base URL accepted `/live/`→ `…/live//test/…`; no PIN/mode vars | `PAYMENTS_MODE=disabled\|sandbox\|live` (fail-closed), live needs a second confirm flag + `NODE_ENV=production`, base URL normalised, PIN validated |
| `modules/payments/payments.service.ts` | Float balances, hard-coded NGN, demo rows counted, mock-confirm by brand, wrong auth | Ledger-backed balances/stats, provider-verified `verifyPayment`, sandbox simulate |
| `modules/payments/payments.controller.ts`, `.routes.ts`, `.validation.ts` | No bank/admin/idempotency routes; mock confirm route; webhook behind JSON parser | New routes (below); `/mock/:ref/confirm` **removed** |
| `app.ts` | `express.json()` + global limiter in front of the webhook | Webhook mounted first with `express.raw()`, outside the limiter |
| `server.ts` | — | Starts reconciler, logs mode |
| `modules/milestones/milestones.service.ts` | Approve didn't touch money; submit allowed with no funds; funded milestones editable; `payment` relation | Approve ⇒ atomic escrow release; submit requires FUNDED (`REQUIRE_FUNDED_ESCROW`); edits/deletes blocked once funded or in payment; still returns `payment` for the UI |
| `modules/deals/deals.service.ts` | Cancelling left money untouched | `cancelDeal` refunds funded escrow to brand's refundable balance |
| `modules/users/users.validation.ts` | Free-text bank fields (no verification, instant withdrawal after hijack) | Removed; use `PUT /payments/bank` |
| `modules/notifications/notifications.service.ts` | — | 4 new notification types |
| `prisma/schema.prisma` | `Payment.milestoneId @unique` (a failed attempt blocked retries forever), non-unique `providerRef`, no ledger | See doc 04 |
| `package.json` | — | scripts: `db:deploy`, `test:unit`, `test:integration`, `create-admin` |

## D. API changes
| Route | Who | Notes |
|---|---|---|
| `POST /payments/initialize` | BRAND | Returns `{payment, virtualAccount, reference, sandbox}` (no `checkoutUrl`) |
| `POST /payments/verify/:reference` | payer/payee | Re-checks with Payaza; never trusts caller |
| `POST /payments/sandbox/:reference/simulate` | BRAND | Sandbox only |
| `POST /payments/webhook/payaza` | Payaza | Raw body + signature |
| `GET /payments/banks`, `POST /payments/bank/resolve`, `PUT /payments/bank` | CREATOR | Verified bank setup |
| `POST /payments/payouts` | CREATOR | `Idempotency-Key` header recommended; `amount` string/number, ≤2 dp |
| `GET /payments/payouts/balance` | CREATOR | Same fields as before + `inEscrow`, `environment` |
| `GET /payments/admin/integrity`, `/review`; `POST /admin/reconcile`, `/admin/escrow/:milestoneId/resolve`, `/admin/brand-refunds/settle` | ADMIN | |
| ~~`POST /payments/mock/:reference/confirm`~~ | — | Removed (a brand could confirm its own payment) |

## E. Frontend (all typecheck clean)
`types/payments.ts`, `hooks/usePayments.ts` (replaced) · `components/payments/FundingPanel.tsx` (new) · `app/(dashboard)/payments/page.tsx` (verified bank card, idempotent withdraw, sandbox/disabled banners) · `app/(dashboard)/deals/[dealId]/milestones/page.tsx` ("Fund escrow" + transfer instructions; creators wait for funding) · `app/(dashboard)/profile/page.tsx` (bank inputs replaced by a link, since they are no longer accepted) · `types/deals.ts` (`escrowStatus`).

## F. Dependencies
None new. (`express`, `prisma`, `zod`, `crypto` already present.)

## G. Behaviour changes you should know
1. With `PAYMENTS_MODE=disabled` (default) nothing can be funded or withdrawn, and creators can't submit work (escrow required). Set `sandbox` to test.
2. All pre-existing payments/payouts are flagged `isDemo` and hidden from lists and balances; they never reach the ledger.
3. Creators' bank details must be re-entered via the verified flow. Withdrawals pause `PAYOUT_COOLDOWN_HOURS` (default 24) after each change; set `0` for sandbox tests.
