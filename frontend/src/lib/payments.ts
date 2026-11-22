/**
 * src/lib/payments.ts
 *
 * Small, dependency-free helpers shared by the payment UI. Everything here
 * treats browser-supplied values (URL params, provider redirects, storage) as
 * untrusted input. None of it decides whether money moved — only the backend
 * (signed webhook / provider verification) does that.
 */

import axios from "axios";

// ---------------------------------------------------------------------------
// Payment reference (comes back from the provider in the return URL)
// ---------------------------------------------------------------------------

/**
 * Provider/payment references are opaque ids minted by the backend. We don't
 * depend on their exact shape (it changed when the payment engine was rebuilt);
 * we only require a conservative charset and length so a crafted URL segment
 * can never carry slashes, dots, query strings, markup or whitespace into an
 * API path.
 */
const REFERENCE_PATTERN = /^[A-Za-z0-9_-]{6,100}$/;

export function isValidPaymentReference(value: unknown): value is string {
  return typeof value === "string" && REFERENCE_PATTERN.test(value);
}

// ---------------------------------------------------------------------------
// Checkout redirect safety
// ---------------------------------------------------------------------------

/**
 * Hosts we are willing to send a brand to for card entry. The backend returns
 * the checkout URL, so this guards against a tampered/compromised response
 * turning "Pay" into a phishing redirect.
 *
 * Override/extend with NEXT_PUBLIC_CHECKOUT_HOST_ALLOWLIST="payaza.africa,example.com"
 * (a host matches itself and any subdomain).
 */
function allowedCheckoutHosts(): string[] {
  const fromEnv = (process.env.NEXT_PUBLIC_CHECKOUT_HOST_ALLOWLIST ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : ["payaza.africa"];
}

export function isSafeCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return allowedCheckoutHosts().some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

// ---------------------------------------------------------------------------
// Error messages
// ---------------------------------------------------------------------------

/**
 * Turn any thrown value into a message that is safe and useful to show a user.
 * Server `message` fields are shown (they are written for end users); raw
 * stack/config details never are.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return "We couldn't reach the server. Check your connection and try again — if you already paid, don't pay again; check your payment history first.";
    }
    const serverMessage = (error.response.data as { message?: unknown } | undefined)?.message;
    if (typeof serverMessage === "string" && serverMessage.trim()) return serverMessage;
    if (error.response.status === 429) return "Too many attempts. Please wait a moment and try again.";
    if (error.response.status >= 500) return "Something went wrong on our side. Please try again shortly.";
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

/**
 * One key per user *intent* (create it when a form opens / a button is first
 * clicked, reuse it for retries of that same intent, discard it on success).
 * Sent as an `Idempotency-Key` header. NOTE: the current backend does not read
 * this header yet — see docs/frontend-payments/02_*.md. The client-side submit
 * lock is what actually prevents double-submits today.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for very old browsers; uniqueness is all that matters here.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

// ---------------------------------------------------------------------------
// Pending-payment recovery (survives a closed tab / dropped network mid-checkout)
// ---------------------------------------------------------------------------

const PENDING_KEY = "cv:pending-payment";
const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface PendingPayment {
  reference: string;
  startedAt: number;
}

/** Remember which reference we sent the user to pay, so we can offer to re-check it. Reference only — no PII, no amounts. */
export function rememberPendingPayment(reference: string): void {
  try {
    const value: PendingPayment = { reference, startedAt: Date.now() };
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode, quota) — recovery is a nicety, not a requirement */
  }
}

export function readPendingPayment(): PendingPayment | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingPayment>;
    if (!isValidPaymentReference(parsed.reference) || typeof parsed.startedAt !== "number") return null;
    if (Date.now() - parsed.startedAt > PENDING_MAX_AGE_MS) {
      window.sessionStorage.removeItem(PENDING_KEY);
      return null;
    }
    return { reference: parsed.reference, startedAt: parsed.startedAt };
  } catch {
    return null;
  }
}

export function clearPendingPayment(): void {
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}
