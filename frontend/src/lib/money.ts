/**
 * src/lib/money.ts
 *
 * Money helpers that never do arithmetic on floating-point "major unit"
 * numbers. Amounts are parsed into integer MINOR units (kobo / cents) as
 * `bigint`, compared and summed there, and only formatted for display at the
 * very end.
 *
 * Why: `0.1 + 0.2 !== 0.3` in JS. The backend serialises Prisma Decimals as
 * strings ("5000.00") and a few balance endpoints as numbers, so both shapes
 * are accepted here.
 *
 * The server stays the authority on every amount — this file only makes the
 * client-side validation and display exact.
 */

/** NGN / USD / etc. all use 2 decimal places for the currencies CreatorVault supports. */
const MINOR_DIGITS = 2;
const MINOR_FACTOR = BigInt(10 ** MINOR_DIGITS);

/**
 * Parse a user-typed or server-sent amount into integer minor units.
 * Returns `null` for anything that isn't a plain non-negative decimal with
 * at most 2 decimal places (so "1e3", "-5", "12.345" and "" are all rejected).
 */
export function toMinor(input: string | number | null | undefined): bigint | null {
  if (input === null || input === undefined) return null;

  // Numbers coming from the API (e.g. availableBalance) are already rounded
  // to 2dp server-side; stringify with fixed precision to avoid exponent forms.
  const raw = typeof input === "number" ? (Number.isFinite(input) ? input.toFixed(MINOR_DIGITS) : "") : input.trim();

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? "").padEnd(MINOR_DIGITS, "0") || "0");
  return whole * MINOR_FACTOR + fraction;
}

/** Same as `toMinor` but treats unparseable values as 0 (for display-only paths). */
export function toMinorOrZero(input: string | number | null | undefined): bigint {
  return toMinor(input) ?? BigInt(0);
}

/** Integer minor units -> the exact decimal string the backend expects ("1250.50"). */
export function minorToDecimalString(minor: bigint): string {
  const negative = minor < BigInt(0);
  const abs = negative ? -minor : minor;
  const whole = abs / MINOR_FACTOR;
  const fraction = (abs % MINOR_FACTOR).toString().padStart(MINOR_DIGITS, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

/** Integer minor units -> a JS number safe to send in JSON (always exactly 2dp-representable here). */
export function minorToNumber(minor: bigint): number {
  return Number(minorToDecimalString(minor));
}

/**
 * Format an amount for display. Uses the record's own currency code — never a
 * hardcoded "NGN" — and falls back gracefully if the code is unknown to Intl.
 */
export function formatMoney(amount: string | number | null | undefined, currency: string = "NGN"): string {
  const minor = toMinorOrZero(amount);
  const decimal = minorToDecimalString(minor);
  try {
    // Intl accepts a numeric string at runtime for formatting; Number() here
    // is display-only and the value has at most 2 decimals, so it is exact
    // for every realistic balance.
    return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(Number(decimal));
  } catch {
    return `${currency} ${decimal}`;
  }
}

/** Exact comparison helpers on raw inputs. */
export function isGreaterThan(a: string | number, b: string | number): boolean {
  return toMinorOrZero(a) > toMinorOrZero(b);
}
