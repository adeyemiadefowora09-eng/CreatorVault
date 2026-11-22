# 07 — WEBHOOK CONFIGURATION

## Endpoint

```
POST /api/v1/payments/webhook/payaza
```

No JWT authentication. Authentication is via HMAC-SHA512 signature on the `x-payaza-signature` header.

---

## How signature verification works (after the fix)

1. `app.ts` captures raw request bytes into `req.rawBody` **before** `express.json()` parses them.
2. `payments.webhook.ts` computes HMAC-SHA512 of `req.rawBody` using `PAYAZA_SECRET_KEY`.
3. Both hex and base64 digests are tested (Payaza's docs are inconsistent on encoding).
4. `crypto.timingSafeEqual()` prevents timing attacks.
5. If `PAYAZA_SECRET_KEY` is empty, the endpoint returns `401` immediately (no HMAC with empty key).

---

## Events handled

| Payaza event | Action taken |
|---|---|
| `charge.success` | Marks Payment COMPLETED, Milestone PAID, writes ledger entries |
| `transfer.success` | Marks Payout COMPLETED |
| `transfer.failed` | Marks Payout FAILED, writes reversal ledger entry, restores balance |

> [!IMPORTANT]
> The exact Payaza webhook body shape for **collections** (card/virtual account charge) is not fully documented publicly. The handler supports both a nested `{ event, data }` envelope and the flat transfer shape. Run at least one sandbox webhook delivery and log `req.body` to confirm the actual shape, then adjust if needed.

---

## Idempotency

Every processed event is recorded in `webhook_events` with a unique `event_key = webhook_{reference}_{event}`.

Retried events that arrive after the first processing:
- Return HTTP 200 (Payaza stops retrying)
- Do **not** trigger a second state change or ledger entry

---

## Rate limiting

The webhook route uses a dedicated `webhookLimiter` (1,000 req / 15 min). This is separate from the global `defaultLimiter` (100 req / 15 min) to prevent Payaza's retry IPs from being throttled.

---

## Local development — exposing the webhook

Payaza must be able to reach your backend. For local development, use a tunnel:

### Option A — ngrok (recommended)

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 5000

# Your webhook URL will be something like:
# https://abc123.ngrok.io/api/v1/payments/webhook/payaza
```

### Option B — Cloudflare Tunnel

```bash
cloudflared tunnel --url http://localhost:5000
```

### Option C — localtunnel

```bash
npx localtunnel --port 5000
# Returns: https://your-tunnel-name.loca.lt
# Webhook URL: https://your-tunnel-name.loca.lt/api/v1/payments/webhook/payaza
```

Register the tunnel URL in your Payaza dashboard before starting a sandbox payment test. The URL must be HTTPS.

---

## Testing the webhook manually

```bash
# Simulate a charge.success event (replace values as needed)
PAYLOAD='{"event":"charge.success","data":{"transaction_reference":"PV_your-ref-here","amount":5000,"currency":"NGN"}}'

# Compute HMAC-SHA512 signature (replace YOUR_SECRET_KEY)
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha512 -hmac "YOUR_SECRET_KEY" | awk '{print $2}')

curl -X POST http://localhost:5000/api/v1/payments/webhook/payaza \
  -H "Content-Type: application/json" \
  -H "x-payaza-signature: $SIG" \
  -d "$PAYLOAD"

# Expected: 200 { "received": true, "processed": true }
# Second call with same payload: 200 { "received": true, "processed": false, "reason": "duplicate" }
```

---

## Verifying webhook processing in the database

```sql
-- Check webhook events table
SELECT event_key, received_at FROM webhook_events ORDER BY received_at DESC LIMIT 10;

-- Check payment was updated
SELECT id, status, "paidAt", "providerRef" FROM payments
WHERE "providerRef" = 'PV_your-ref-here';

-- Check ledger entries
SELECT type, amount_kobo, description FROM ledger_entries
WHERE reference_id = (
  SELECT id FROM payments WHERE "providerRef" = 'PV_your-ref-here'
);
```
