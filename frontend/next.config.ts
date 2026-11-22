import type { NextConfig } from "next";

/**
 * Security headers for a financial UI.
 *
 * Deliberately a SAFE SUBSET of a Content-Security-Policy: it blocks framing
 * (clickjacking on pay/withdraw buttons), plugin content, <base> hijacking and
 * cross-origin form posts, without a script-src policy that Next's dev/HMR and
 * inline hydration scripts would break. A strict nonce-based script-src can be
 * layered on later — see docs/frontend-payments/03_FRONTEND_ENV_AND_SDK_SETUP.md.
 *
 * The payment flow is a full-page redirect to the provider's hosted checkout
 * (no embedded SDK / iframe / third-party script), so no CSP allowances are
 * needed for the provider today.
 */
const securityHeaders = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Payment references live in URL paths; don't leak full URLs to other origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
