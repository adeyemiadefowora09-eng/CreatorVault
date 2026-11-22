# 02 — PAYMENT FLOW ARCHITECTURE

## Overview

```
Brand                 CreatorVault Backend              Payaza              Creator
 │                           │                            │                    │
 │  POST /payments/initialize │                            │                    │
 │──────────────────────────▶│                            │                    │
 │                           │ create Payment(PENDING)    │                    │
 │                           │ write idempotency ref       │                    │
 │                           │                            │                    │
 │                           │ POST checkout/api/v1/initiate                   │
 │                           │───────────────────────────▶│                    │
 │                           │       { checkout_url }      │                    │
 │                           │◀───────────────────────────│                    │
 │  { checkoutUrl }           │                            │                    │
 │◀──────────────────────────│                            │                    │
 │                           │                            │                    │
 │  Brand pays on Payaza      │                            │                    │
 │  hosted checkout page      │                            │                    │
 │──────────────────────────────────────────────────────▶│                    │
 │                           │                            │                    │
 │                           │  POST /webhook/payaza       │                    │
 │                           │   event: charge.success     │                    │
 │                           │◀───────────────────────────│                    │
 │                           │ verify HMAC signature       │                    │
 │                           │ check idempotency_key       │                    │
 │                           │ cross-check amount/currency │                    │
 │                           │ prisma.$transaction:        │                    │
 │                           │  Payment → COMPLETED        │                    │
 │                           │  Milestone → PAID           │                    │
 │                           │  LedgerEntry: brand→escrow  │                    │
 │                           │  LedgerEntry: escrow→creator│                    │
 │                           │                            │                    │
 │                           │                     notification: "Payment received"
 │                           │────────────────────────────────────────────────▶│
 │                           │                            │                    │
 │                           │                            │  GET /payouts/balance
 │                           │                            │◀───────────────────│
 │                           │ availableBalance = ledger  │                    │
 │                           │────────────────────────────────────────────────▶│
 │                           │                            │                    │
 │                           │                            │ POST /payouts       │
 │                           │                            │◀───────────────────│
 │                           │ prisma.$transaction (SERIALIZABLE):             │
 │                           │  SELECT payouts FOR UPDATE                       │
 │                           │  recompute balance                               │
 │                           │  create Payout(PENDING)                          │
 │                           │                            │                    │
 │                           │ POST payout-receptor/payout│                    │
 │                           │───────────────────────────▶│                    │
 │                           │  Payout → PROCESSING        │                    │
 │                           │  LedgerEntry: creator→bank  │                    │
 │                           │                            │                    │
 │                           │  POST /webhook/payaza       │                    │
 │                           │   event: transfer.success   │                    │
 │                           │◀───────────────────────────│                    │
 │                           │  Payout → COMPLETED         │                    │
 │                           │                     notification: "Payout completed"
 │                           │────────────────────────────────────────────────▶│
```

## Ledger Design

The ledger uses double-entry bookkeeping. Every financial event writes two ledger entries that net to zero.

| Event | Debit Account | Credit Account | Type |
|---|---|---|---|
| Brand pays | `brand_{userId}` | `platform_escrow` | `PAYMENT_RECEIVED` |
| Creator earns | `platform_escrow` | `creator_{userId}` | `CREATOR_EARNINGS` |
| Payout submitted | `creator_{userId}` | `bank_external` | `PAYOUT_PROCESSING` |
| Payout failed reversal | `bank_external` | `creator_{userId}` | `PAYOUT_FAILED_REVERSAL` |
| Demo payment | `brand_{userId}` | `platform_escrow` | `PAYMENT_RECEIVED` |
| Demo payout | `creator_{userId}` | `bank_external` | `PAYOUT_DEMO` |

> [!IMPORTANT]
> **Never update or delete ledger_entries rows.** The balance on `ledger_accounts` is a running total. If you need to reverse a transaction, write a new reverse entry — never mutate an existing one.

## Mode Matrix

| `PAYMENTS_MODE` | Real Payaza calls? | Demo auto-complete? | Use when |
|---|---|---|---|
| `demo` | No | Yes | UI testing with no credentials |
| `sandbox` | Yes (`X-TenantID: test`) | No | End-to-end sandbox testing |
| `live` | Yes (`X-TenantID: live`) | No | Real customer money |

## Key File Map

| File | Responsibility |
|---|---|
| `src/config/env.ts` | All env vars, fails closed if live mode lacks keys |
| `src/modules/payments/payaza.client.ts` | All Payaza API calls, correct auth header |
| `src/modules/payments/payments.service.ts` | Business logic, atomic transactions, ledger writes |
| `src/modules/payments/payments.webhook.ts` | Raw-body HMAC verification, deduplication |
| `src/modules/payments/payments.routes.ts` | Routes, webhook rate limiter |
| `src/app.ts` | Raw-body capture middleware (before express.json) |
| `prisma/migrations/20261119…/migration.sql` | Ledger tables, webhook_events |
