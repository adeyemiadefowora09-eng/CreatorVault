# 06 — Environment variables (`backend/.env`)

A template is in `backend/.env.example`. **Never commit `.env`.** The old `.env` and `_env` you uploaded contained real secrets; rotate them (doc 10).

| Variable | Required | Purpose / where to get it |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | yes | PostgreSQL connection strings |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | yes (≥32 chars, different) | `openssl rand -hex 32` |
| `CORS_ORIGIN` | yes | Frontend origin |
| `PAYMENTS_MODE` | yes | `disabled` (default, fail-closed) · `sandbox` · `live` |
| `PAYMENTS_LIVE_CONFIRM` | live only | must be exactly `I_UNDERSTAND_THIS_MOVES_REAL_MONEY`; live also requires `NODE_ENV=production` |
| `PAYAZA_API_KEY` | sandbox/live | Payaza **public** key (raw is fine) — Dashboard → Settings → Developers |
| `PAYAZA_SECRET_KEY` | sandbox/live | Payaza **secret** key; webhook verification only |
| `PAYAZA_BASE_URL` | no | default `https://api.payaza.africa/live` (suffixes are normalised) |
| `PAYAZA_TRANSACTION_PIN` | sandbox/live | 6 digits, set in dashboard |
| `PAYAZA_ACCOUNT_REFERENCE` | no | NGN `payazaAccountReference`; auto-fetched if blank |
| `PAYAZA_VA_BANK_CODE` | no | 140 (default), 1067, 117 |
| `PAYAZA_VA_EXPIRY_MINUTES` | no | 15–480 (78 MFB only), default 30 |
| `PAYAZA_CUSTOMER_PHONE` | no | Payaza requires a phone number for the VA customer; we don't collect brand phones, so this default is sent |
| `PLATFORM_FEE_BPS` | no | commission in basis points, default 0 |
| `PAYOUT_MIN_AMOUNT` / `PAYOUT_MAX_AMOUNT` | no | default 1000 / 5,000,000 NGN |
| `PAYOUT_COOLDOWN_HOURS` | no | pause after bank change, default 24 (use 0 for sandbox tests) |
| `REQUIRE_FUNDED_ESCROW` | no | creators can't submit unfunded milestones (default true) |
| `ENABLE_RECONCILER`, `RECONCILE_INTERVAL_SECONDS` | no | default on / 60 |
| `OPENAI_API_KEY` | no | AI Deal Guardian. (`_env` also had `GROQ_API_KEY`, which the code never reads) |
| `CLOUDINARY_*`, `RESEND_API_KEY`, `FROM_EMAIL` | optional | as before |
Frontend: `NEXT_PUBLIC_API_URL` as you already have it.
