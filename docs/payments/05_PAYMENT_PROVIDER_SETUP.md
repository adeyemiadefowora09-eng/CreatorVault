# 05 — Payaza setup

Source: https://docs.payaza.africa (Getting Started, Virtual Accounts, Transfers, Webhooks).

## Code vs. things only you can do
| | Who |
|---|---|
| Correct auth header, tenant header, URLs, bodies, webhook verification, bank enquiry | **Done in code** |
| Create/verify Payaza business account; generate **test** API keys | **You** (business.payaza.africa → Settings → Developers → API Keys) |
| Set the 6-digit **transaction PIN** (Settings → Profile → Security) | **You** |
| Register webhook URLs (below) | **You** |
| **Live only:** complete KYC/KYB; whitelist the server's public IP (Settings → Developers → IP Whitelisting); email support@payaza.africa from the Super Admin email to lift the **PND** restriction after setting/resetting the PIN; fund the Payaza NGN balance (transfers draw from it) | **You / Payaza** |
| Ask Payaza support to confirm your account is enabled for **virtual accounts** and **transfers**, and which bank (`PAYAZA_VA_BANK_CODE`: 140 Globus, 1067 78 MFB, 117 Fidelity) you may use | **You / Payaza** |

## Sandbox setup
1. In the dashboard use the **test** public/secret keys.
2. Public HTTPS URL for your backend (Payaza must reach it): e.g. `ngrok http 5000` or `cloudflared tunnel --url http://localhost:5000`.
3. Dashboard → Settings → Developers → webhooks: set the **same URL** for *Collections/Virtual account* and *Transfers/Payouts* (use the **Test** mode URLs):
   `https://<your-public-host>/api/v1/payments/webhook/payaza`
4. `backend/.env`: `PAYMENTS_MODE=sandbox`, keys, PIN (see doc 06). Restart the API.
5. Sanity check (replace the key; this is the doc's own smoke test):
   ```bash
   curl https://api.payaza.africa/live/payaza-account/api/v1/mainaccounts/merchant/enquiry/main \
     -H "Authorization: Payaza $(printf '%s' '<PUBLIC_KEY>' | base64)" -H "X-TenantID: test"
   ```
   You should see an NGN account with a `payazaAccountReference` (the code fetches this itself unless you set `PAYAZA_ACCOUNT_REFERENCE`).

## Facts that matter
- `https://api.payaza.africa/live/` — the `/live` is a fixed prefix. Sandbox vs live = `X-TenantID: test|live`, which the code derives from `PAYMENTS_MODE`.
- Auth = `Payaza <base64(PUBLIC key)>`. The **secret key never leaves your server**; it's only used for webhook HMAC.
- Dynamic virtual accounts: Globus (140) validates exact amount; Fidelity (117) does not (the server still rejects wrong amounts → REVIEW). Only 78 MFB honours expiry; the app tracks its own expiry anyway.
- Sandbox funding: `POST /payments/sandbox/:reference/simulate` calls Payaza's `fund_test_virtual_account`, which fires a real webhook.
- **Unconfirmed by me (needs your sandbox run):** whether the *test* tenant fully simulates bank enquiry and transfers (`NIP_SUCCESS` webhook) — treat sandbox payout success as "provider accepted it", not "money reached a bank"; the exact webhook signature encoding (code accepts base64 *and* hex); the exact status-query response shape for a not-found reference; Payaza's test bank codes.

## Going live checklist (provider side)
KYC approved · live keys generated · PIN set · PND lifted · server IP whitelisted · Payaza balance funded · webhook URLs saved for **Live** mode · support has enabled VA + transfers · a small real-money test (₦1,000 in, ₦1,000 out) done and reconciled.
