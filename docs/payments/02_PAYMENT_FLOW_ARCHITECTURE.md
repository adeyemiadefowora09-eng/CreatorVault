# 02 — Payment flow architecture

## Model: true escrow, Payaza virtual accounts, append-only ledger

```
BRAND                     CREATORVAULT API                          PAYAZA                 CREATOR
  │  Fund escrow (milestone)    │                                      │                       │
  ├────────────────────────────►│ POST /payments/initialize            │                       │
  │                             │ Payment=PENDING (unique reference)   │                       │
  │                             ├─────────────────────────────────────►│ create DYNAMIC virtual│
  │                             │◄─────────────────────────────────────┤ account (exact amount)│
  │◄── bank + account no. ──────┤                                      │                       │
  │  bank transfer ─────────────────────────────────────────────────►  │                       │
  │                             │◄──── webhook (x-payaza-signature) ───┤                       │
  │                             │  1 verify HMAC over RAW body         │                       │
  │                             │  2 store event once (unique key)     │                       │
  │                             │  3 transaction-query (independent) ─►│                       │
  │                             │  4 amount == expected, NGN?          │                       │
  │                             │  5 ONE DB TX: ledger + payment +     │                       │
  │                             │    milestone = FUNDED                │                       │
  │                             │                                      │       sees "funded" ─►│ works, submits
  │  Approve milestone ────────►│ ONE DB TX: ESCROW → creator balance  │                       │
  │                             │ (− platform fee), milestone = PAID   │                       │
  │                             │                                      │◄── Withdraw ──────────┤
  │                             │ lock creator ledger acct, check bal, │                       │
  │                             │ Payout=PENDING, ledger → INFLIGHT    │                       │
  │                             ├─────────────────────────────────────►│ transfer (unique ref) │
  │                             │◄── webhook NIP_SUCCESS / NIP_FAILURE ┤                       │
  │                             │ settle (cash out) or REVERSE         │                       │
```
Lost webhooks / crashes are covered by `reconciler.ts` (every 60 s): it re-queries Payaza for unpaid VAs and in-flight payouts.

## Ledger (double entry, append-only)
| Event | Debit | Credit |
|---|---|---|
| Escrow funded | `PROVIDER_CASH:PAYAZA` (asset) | `ESCROW:<milestone>` |
| Released on approval | `ESCROW:<milestone>` | `USER_AVAILABLE:<creator>` (net) + `PLATFORM_REVENUE` (fee) |
| Withdrawal requested | `USER_AVAILABLE:<creator>` | `PAYOUT_INFLIGHT` |
| Payout confirmed | `PAYOUT_INFLIGHT` | `PROVIDER_CASH:PAYAZA` |
| Payout failed | `PAYOUT_INFLIGHT` | `USER_AVAILABLE:<creator>` |
| Deal cancelled / admin refund | `ESCROW:<milestone>` | `BRAND_REFUNDABLE:<brand>` |
| Refund paid by ops | `BRAND_REFUNDABLE:<brand>` | `PROVIDER_CASH:PAYAZA` |

Guarantees: every transaction balances (DB constraint trigger, checked at commit) · rows can't be updated/deleted/truncated (triggers) · each posting has a unique idempotency key (`fund:<paymentId>`, `release:<milestoneId>`, `payout-settled:<id>` …) · balances are computed from entries, never stored · sandbox and live use separate ledger accounts, so **sandbox money can never become withdrawable in live**.

## State machines
- **Payment:** PENDING → COMPLETED · PENDING → EXPIRED/FAILED (frees the milestone for a retry) · any → REVIEW (amount mismatch, late/duplicate payment: never auto-credited) · COMPLETED → REFUNDED
- **Milestone escrow:** UNFUNDED → FUNDED → RELEASED | REFUNDED
- **Payout:** PENDING → PROCESSING → COMPLETED | FAILED (reversal). Never COMPLETED/FAILED without provider evidence.

## Authorisation rules
Brand funds only its own deal's milestone (milestone must belong to that deal). Creator endpoints are role-gated and always keyed by the caller's id (no id in the URL ⇒ no cross-account access). Disputed deals freeze release. Admin-only: escrow decisions, refund settlement, integrity report.

## Known limits (be aware)
- Refunds to brands are ledger-recorded; the bank transfer back is a manual ops step (`/payments/admin/brand-refunds/settle` records it). Virtual-account payments cannot be reversed through Payaza's card-refund API.
- Payaza fees are not modelled in the ledger (see doc 10).
- Money already released to a creator's balance is not frozen by a later dispute; only escrow is.
