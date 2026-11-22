import { Prisma } from "@prisma/client";
import { ApiError } from "../../utils/apiError.js";

export const Decimal = Prisma.Decimal;
export type Dec = Prisma.Decimal;

export const ZERO = new Decimal(0);

/** Parse a user supplied amount into an exact Decimal (max 2dp). Rejects float artefacts such as 0.1+0.2. */
export function parseMoney(input: unknown, label = "Amount"): Dec {
  if (typeof input !== "string" && typeof input !== "number") {
    throw ApiError.badRequest(`${label} is required`);
  }
  const s = String(input).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    throw ApiError.badRequest(`${label} must be a positive number with at most 2 decimal places`);
  }
  const d = new Decimal(s);
  if (d.lte(0)) throw ApiError.badRequest(`${label} must be greater than zero`);
  return d;
}

/** Provider amounts arrive as JSON numbers/strings; normalise to 2dp for comparison. */
export function fromProvider(v: unknown): Dec | null {
  if (v === null || v === undefined || v === "") return null;
  try {
    const d = new Decimal(String(v));
    return d.isFinite() ? d.toDecimalPlaces(2) : null;
  } catch {
    return null;
  }
}

export function sameAmount(a: Dec | null, b: Dec | null): boolean {
  return a !== null && b !== null && a.toDecimalPlaces(2).equals(b.toDecimalPlaces(2));
}

/** JSON number for Payaza request bodies (2dp via toFixed, so no float drift). */
export function toProviderNumber(d: Dec): number {
  return Number(d.toFixed(2));
}

/** Platform commission, rounded DOWN to the kobo so the creator is never short-changed by rounding. */
export function computeFee(amount: Dec, bps: number): Dec {
  if (bps <= 0) return ZERO;
  return amount.mul(bps).div(10000).toDecimalPlaces(2, Decimal.ROUND_DOWN);
}
