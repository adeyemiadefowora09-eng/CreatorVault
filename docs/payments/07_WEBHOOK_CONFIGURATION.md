# 07 — Webhook configuration

**Endpoint:** `POST https://<public-host>/api/v1/payments/webhook/payaza` — one URL for collections *and* transfers; set it for Test and Live separately in the Payaza dashboard.

## Processing pipeline (`webhook.ts`)
1. Body captured **raw** (`express.raw`) — mounted before `express.json()` and before the rate limiter.
2. `x-payaza-signature` must equal HMAC-SHA512(raw bytes, **secret key**), base64 (documented) or hex; constant-time compare. Empty secret ⇒ 503 (an HMAC with an empty key is forgeable). Bad/missing signature ⇒ 401.
3. Classified: transfer events carry `sent_to` / `NIP_*` statuses; collection events carry `merchant_reference` / `channel`.
4. Stored once in `provider_events` (unique `eventKey` = kind + reference + status + session). Replays ⇒ `200 Duplicate`, nothing re-applied. A prior *failed* attempt is retried.
5. **Collection:** matched to our `providerRef` ⇒ `confirmFunding()` — re-verifies via Payaza `transaction-query`, requires status Completed, amount = expected, currency NGN, then one DB transaction (ledger + payment + milestone). Falls back to the signed webhook's own facts only if the status query is unreachable.
6. **Transfer:** matched to `Payout.providerRef` ⇒ status confirmed via Payaza status endpoint ⇒ `NIP_SUCCESS` settles; `NIP_FAILURE` reverses to the creator's balance; `NIP_PENDING`/`ESCROW_SUCCESS`/`TRANSACTION_INITIATED` stay PROCESSING.
7. Unknown references are acknowledged (200) and ignored. Processing errors return 500 so Payaza retries.

## Test it
```bash
# valid signature (base64) over the exact bytes you send
BODY='{"transaction_reference":"CVxxxx","merchant_reference":"CVxxxx","status":"Completed","transaction_status":"Funds Received","amount_received":"50000.00","currency_code":"NGN","channel":"VirtualAccount","session_id":"s1"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha512 -hmac "$PAYAZA_SECRET_KEY" -binary | base64 -w0)
curl -i -X POST http://localhost:5000/api/v1/payments/webhook/payaza -H 'Content-Type: application/json' -H "x-payaza-signature: $SIG" --data-binary "$BODY"
```
Expected: `200 OK`; sending it again ⇒ `200 Duplicate`; changing one character ⇒ `401`. (A reference that isn't in your DB is ignored, so use a real `providerRef` from `payments` to see an actual state change — and note the server will still confirm with Payaza, so for a *fabricated* body the funding won't complete unless Payaza agrees. That is the point.)

Inspect: `SELECT kind, reference, status, error FROM provider_events ORDER BY "receivedAt" DESC;`
Note: Payaza says webhooks also carry an auth header with your base64 public key; the code doesn't depend on it (the HMAC is the control).
