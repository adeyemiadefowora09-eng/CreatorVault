# 03 — Frontend Env, Provider & Headers Setup

## Environment variables (client)

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | `http://localhost:5000/api/v1` | Backend base URL |
| `NEXT_PUBLIC_CHECKOUT_HOST_ALLOWLIST` | no | `payaza.africa` | Comma-separated hosts the app may redirect to for payment. Matches the host and its subdomains. Default `payaza.africa` |

Anything prefixed `NEXT_PUBLIC_` is shipped to every browser. **Never** put a provider secret, webhook secret, JWT secret or DB URL in a frontend env file. Public provider keys would also go here if you ever add an embedded SDK; today there is none.

> Confirm the real Payaza checkout hostname during the first test. If the app says "We couldn't verify the payment page address", add that host to `NEXT_PUBLIC_CHECKOUT_HOST_ALLOWLIST` (this guard is intentional — don't remove it).

## Provider integration model

Payaza is used as a **hosted redirect checkout**: the backend creates the checkout and returns `checkoutUrl`; the browser navigates there; Payaza redirects back to `{CORS_ORIGIN}/payments/verify/{reference}`.

Consequences:
- No client SDK / `<script>` to load, so no script-src, CORS or CSP allowances are needed for the provider.
- The return URL host is controlled by the **backend** `CORS_ORIGIN`. It must be the exact frontend origin for the environment (e.g. `http://localhost:3000`, no trailing slash), or the brand returns to the wrong place.

## Sandbox vs live

`backend/.env` has `PAYAZA_BASE_URL=https://router-live.payaza.africa`. By its hostname that is the **live** router. Before the end-to-end test, confirm which credentials you're using. Use sandbox credentials if Payaza offers them for this integration, otherwise the smallest real amount.

## Security headers (`next.config.ts`)

Applied to every route:

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | `frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'` | Blocks clickjacking over pay/withdraw buttons, `<base>` hijack, plugins, cross-origin form posts |
| `X-Frame-Options` | `DENY` | Legacy clickjacking protection |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Payment references are in URL paths; don't leak them cross-origin |
| `Permissions-Policy` | camera/mic/geo off, `payment=(self)` | Least privilege |

This is a deliberately safe **subset** of CSP. A full `script-src` needs per-request nonces (Next supports this via `proxy`/middleware) and will break dev/HMR if added naively. Add it as a separate hardening task. If you later embed a provider script or iframe, add that provider's origin to `script-src`/`frame-src`/`connect-src` at the same time.

## Packages

No new dependencies were added. Installed set is unchanged (`@tanstack/react-query`, `axios`, `zustand`, `react-hook-form`, `lucide-react`, shadcn/base-ui).

## Local run

```
cd frontend
npm install
npm run dev        # http://localhost:3000
npm run build      # run this locally; it needs internet for next/font Google fonts
```
