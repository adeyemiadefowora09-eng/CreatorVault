# 06 — ENVIRONMENT VARIABLES

All variables below must be set in `backend/.env`. Never commit this file to git.
The `.env.example` template is at `backend/.env.example`.

---

## Critical — payment infrastructure

| Variable | Required for | How to obtain | Example |
|---|---|---|---|
| `PAYMENTS_MODE` | All modes | Set manually | `demo` / `sandbox` / `live` |
| `PAYAZA_PUBLIC_KEY` | sandbox, live | Payaza Dashboard → Settings → API Keys | `dGVzdC1wdWJsaWMta2V5…` |
| `PAYAZA_SECRET_KEY` | sandbox, live (webhook HMAC only) | Payaza Dashboard → Settings → API Keys | `sk_test_…` |
| `PAYAZA_BASE_URL` | sandbox, live | Hardcoded | `https://api.payaza.africa` |
| `PAYAZA_TENANT` | sandbox, live | Set manually | `test` or `live` |
| `PAYAZA_ACCOUNT_REFERENCE` | live payouts | Payaza Dashboard → Account Details | `CV_ACC_12345` |
| `PAYAZA_TRANSACTION_PIN` | live payouts | Payaza Dashboard → Settings → Transaction PIN | `1234` |

> [!CAUTION]
> `PAYAZA_SECRET_KEY` must never appear in an Authorization header on outbound calls. It is used exclusively inside `payments.webhook.ts` for HMAC signature verification.

---

## Infrastructure

| Variable | Required | How to obtain | Example |
|---|---|---|---|
| `DATABASE_URL` | Always | Supabase / Railway / self-hosted Postgres | `postgresql://user:pass@host:5432/db?pgbouncer=true` |
| `DIRECT_URL` | Always | Same as above without pgbouncer param | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Always | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` | 128-char hex |
| `JWT_REFRESH_SECRET` | Always | Same command, different value | 128-char hex |
| `JWT_EXPIRY` | Always | Set manually | `15m` |
| `JWT_REFRESH_EXPIRY` | Always | Set manually | `7d` |
| `CORS_ORIGIN` | Always | Your frontend URL | `http://localhost:3000` |

---

## Optional services

| Variable | Required | How to obtain |
|---|---|---|
| `OPENAI_API_KEY` | AI features | platform.openai.com |
| `CLOUDINARY_CLOUD_NAME` | File uploads | cloudinary.com dashboard |
| `CLOUDINARY_API_KEY` | File uploads | cloudinary.com dashboard |
| `CLOUDINARY_API_SECRET` | File uploads | cloudinary.com dashboard |
| `RESEND_API_KEY` | Email | resend.com |
| `FROM_EMAIL` | Email | Your verified sender domain |

---

## Mode behaviour table

| `PAYMENTS_MODE` | `PAYAZA_PUBLIC_KEY` needed? | `PAYAZA_SECRET_KEY` needed? | Real money? |
|---|---|---|---|
| `demo` | No | No | No |
| `sandbox` | Yes (test key) | Yes (for webhooks) | No |
| `live` | Yes (live key) | Yes | **YES** |

---

## Secret rotation (action required NOW)

The audit found that `_env` and `backend/.env` were included in `backend.zip` and have therefore left your machine. **Rotate all of the following immediately:**

1. `JWT_SECRET` and `JWT_REFRESH_SECRET`
2. `PAYAZA_API_KEY`, `PAYAZA_SECRET_KEY` (renamed to `PAYAZA_PUBLIC_KEY` in the new schema)
3. `DATABASE_URL` password
4. `CLOUDINARY_API_SECRET`
5. `RESEND_API_KEY`

After rotating, invalidate all existing refresh tokens:

```sql
DELETE FROM "refresh_tokens";
```

---

## `.gitignore` check

Confirm these lines exist in `backend/.gitignore`:

```
.env
.env.local
.env.production
*.env
```

And in root `.gitignore`:

```
backend/.env
**/backend/.env
```
