# 05 — PAYMENT PROVIDER SETUP (Payaza)

## What you must do in the Payaza Dashboard (not fixable in code)

### Step 1 — Account registration and KYB

1. Register at [payaza.africa](https://payaza.africa) if not already done.
2. Complete identity / business verification (KYB). Until KYB is approved, live collections and transfers may be blocked regardless of API key status.
3. Contact `integrationsupport@payaza.africa` to confirm:
   - Your account is enabled for **card collections** and/or **virtual account collections**.
   - Your account is enabled for **bank transfers (payouts)**.
   - Any compliance hold has been cleared.

### Step 2 — Obtain API keys

1. Payaza Dashboard → **Settings → API Keys**
2. Copy the **Public Key** (base64-encoded string). This goes into `PAYAZA_PUBLIC_KEY`.
3. Copy the **Secret Key**. This goes into `PAYAZA_SECRET_KEY` and is used **only** for webhook signature verification.

> [!CAUTION]
> Never put the Secret Key in an `Authorization` header on outbound API calls. It is for HMAC verification only. If you have already done this, rotate your keys now.

### Step 3 — Obtain your Account Reference

1. Payaza Dashboard → **"View Payaza Account Details"** (or similar account info section).
2. Copy the account reference string. This goes into `PAYAZA_ACCOUNT_REFERENCE`.
3. This account must be **funded** before any live payout transfers can be sent — transfers debit your Payaza balance.

### Step 4 — Set a Transaction PIN

1. Payaza Dashboard → **Settings → Transaction PIN**.
2. Set a 4-digit PIN.
3. This PIN goes into `PAYAZA_TRANSACTION_PIN` in your backend `.env`.

> [!WARNING]
> Payaza documentation notes that after certain account operations (e.g. a PIN reset), a **PND (Post No Debit)** restriction may be placed on the account. If payouts fail with a PND error, contact Payaza support to have it lifted.

### Step 5 — Whitelist your server IP (live only)

1. Payaza Dashboard → **Settings → Developers**.
2. Add your server's public IP address to the IP whitelist.
3. This is only required for **live** mode. Test/sandbox mode is not IP-restricted.

If you are deploying behind a load balancer or cloud provider with NAT, whitelist the NAT gateway IP, not the instance IP.

### Step 6 — Register webhook URL

1. Payaza Dashboard → **Settings → Webhooks** (location varies; ask support if you can't find it).
2. Register your webhook URL: `https://your-domain.com/api/v1/payments/webhook/payaza`
3. For local development, use a tunnel: see `07_WEBHOOK_CONFIGURATION.md`.
4. Payaza may allow separate webhook URLs per event type (collections vs transfers). If so, register the same URL for both.

### Step 7 — Test your Payaza sandbox credentials

```bash
# Verify your public key is accepted — replace PAYAZA_PUBLIC_KEY with yours
curl -X GET "https://api.payaza.africa/payaza-account/api/v1/mainaccounts/transaction/status?transaction_reference=TEST_NONEXISTENT" \
  -H "Authorization: Payaza YOUR_PUBLIC_KEY" \
  -H "X-TenantID: test"
# Expected: 200 or 404 with a JSON body — NOT a 401. A 401 means wrong key format.
```

## Sandbox bank codes (Nigeria)

Use these for sandbox payout testing:

| Bank | Code |
|---|---|
| GTBank | 058 |
| First Bank | 011 |
| Access Bank | 044 |
| Zenith Bank | 057 |
| UBA | 033 |

Confirm current codes from Payaza's sandbox documentation or contact support for their test bank code list.

## Sandbox test card

Payaza's test environment accepts test cards. Obtain the current test card numbers from your Payaza dashboard or `integrationsupport@payaza.africa`.

## What only Payaza can enable (cannot be fixed in code)

| Requirement | Action |
|---|---|
| KYB approval | Submit business documents via dashboard |
| Collections enablement | Contact Payaza support |
| Transfers/payouts enablement | Contact Payaza support |
| PND removal | Contact Payaza support |
| Test bank codes | Obtain from dashboard or support |
| Test webhook delivery | Use Payaza's sandbox event replay if available |
