# 09 — Test cases and results

Run: `cd backend && npm run test:unit` (no DB) · `DATABASE_URL=<throwaway DB with migrations applied> npm run test:integration`.

## Results so far (be precise about what ran)
| Suite | Result |
|---|---|
| TypeScript compile of the whole backend (`tsc --noEmit`) | **PASS** (0 errors) |
| TypeScript compile of the frontend (`tsc --noEmit`) | **PASS** (0 errors) |
| Unit tests (15) | **PASS 15/15** — executed in my sandbox via a vitest-compatible shim, because your `node_modules` ship Windows-only rollup/esbuild binaries. They're standard vitest files; please re-run with real vitest on your machine |
| Integration tests (9) in `tests/integration/payments-flow.test.ts` | **NOT RUN** — no PostgreSQL available to me. They type-check. Treat them as unproven until you run them |
| Payaza sandbox end-to-end | **NOT RUN** — needs your keys, PIN, public webhook URL |
| Real bank settlement | **NOT TESTED** (cannot be tested outside live) |

## Automated cases
| Case | Where | Kind |
|---|---|---|
| Amount parsing rejects floats/negatives/>2dp; fee rounds down; net+fee = gross | unit | automated |
| Ledger refuses unbalanced / single-sided / ≤0 / >2dp | unit | automated |
| Webhook signature: base64 + hex OK; wrong key, tampered body, missing header, **empty secret**, re-serialised JSON ⇒ rejected | unit | automated |
| Payload classification (collection vs transfer) | unit | automated |
| Base URL normalisation; public key base64 (once); payout/VA request shapes, auth header, tenant header, secret key absent from requests | unit | automated (fake network) |
| Network error / 5xx ⇒ "ambiguous" (never marks a payout failed); 4xx on status lookup ⇒ "no record" | unit | automated |
| Funding recorded **exactly once** under 4 concurrent confirmations + repeats | integration | automated, needs DB |
| Short-paid transfer ⇒ REVIEW, escrow stays 0 | integration | needs DB |
| Other brand can't fund; failed/expired attempt doesn't block retry | integration | needs DB |
| Can't withdraw un-funded/un-released money; other creator has ₦0 | integration | needs DB |
| Release idempotent (one ledger tx, milestone PAID) | integration | needs DB |
| **5 concurrent withdrawals can't overdraw** (exactly 1 succeeds) | integration | needs DB |
| Idempotency-Key reuse ⇒ same payout; different amount ⇒ 409 | integration | needs DB |
| Failed payout restores balance once (duplicate failure webhook); success booked once | integration | needs DB |
| Ledger UPDATE/DELETE rejected; unbalanced transaction rejected at commit | integration | needs DB (triggers) |

## Manual / sandbox cases to run (doc 08 covers the happy path)
| Case | Expected |
|---|---|
| Sandbox pay wrong amount (Fidelity VA has no amount validation) | payment REVIEW, nothing credited, admin sees it in `/payments/admin/review` |
| Pay after the VA expired | REVIEW (`LATE_PAYMENT`), not auto-credited |
| Webhook replay / out-of-order | `Duplicate`, no double posting |
| Webhook with bad signature | 401, nothing stored as processed |
| Kill the server after creating a payout, restart | reconciler re-dispatches (unique reference ⇒ no double pay) or follows provider status |
| Payout to an invalid account (provider `NIP_FAILURE`) | FAILED, balance restored, creator notified |
| Dispute opened on a funded milestone, brand tries to approve | 409 (frozen) |
| Admin `POST /payments/admin/escrow/:id/resolve` RELEASE or REFUND | ledger entries, milestone RELEASED/REFUNDED |
| Cancel deal with funded milestone | escrow ⇒ `BRAND_REFUNDABLE`; admin `settle` after you pay the brand manually |
| Change bank details then withdraw immediately | 403 until cooldown ends |
| Two creators withdraw simultaneously | independent, each correct |
| `PAYMENTS_MODE=disabled` | initialise/withdraw ⇒ 503, webhook ⇒ 503 |
