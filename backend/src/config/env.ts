import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

/**
 * Payaza's real base URL is https://api.payaza.africa/live — the "/live"
 * segment is a FIXED path prefix (sandbox vs live is chosen by the
 * X-TenantID header, not the URL). Older .env files in this repo put
 * ".../live/" or ".../test" here, which produced malformed URLs, so we
 * normalise whatever is supplied down to "<origin>/live".
 */
export function normalizePayazaBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "").replace(/\/(live|test)$/i, "");
  return `${trimmed}/live`;
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(5000),

    DATABASE_URL: z.string().url(),

<<<<<<< HEAD
    JWT_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_EXPIRY: z.string().default("15m"),
    JWT_REFRESH_EXPIRY: z.string().default("7d"),
=======
  PAYAZA_API_KEY: z.string().default(""),
  PAYAZA_PUBLIC_KEY: z.string().default(""),
  PAYAZA_SECRET_KEY: z.string().default(""),
  PAYAZA_BASE_URL: z.string().default("https://api.payaza.africa/live/"),
  PAYAZA_TENANT: z.enum(["test", "live"]).default("test"),
  PAYAZA_TRANSACTION_PIN: z.string().default(""),
  PAYAZA_ACCOUNT_REFERENCE: z.string().default(""),
  PAYMENTS_MODE: z.enum(["live", "sandbox", "test"]).default("sandbox"),
>>>>>>> 9c15709e71866d0d287652bd5fa6ab5f84e07faf

    // ---- Payments -------------------------------------------------------
    // disabled = fail closed (default). sandbox = Payaza TEST tenant.
    // live = real money (needs PAYMENTS_LIVE_CONFIRM as a second lock).
    PAYMENTS_MODE: z.enum(["disabled", "sandbox", "live"]).default("disabled"),
    PAYMENTS_LIVE_CONFIRM: z.string().default(""),

    // Payaza PUBLIC key (raw or already base64). Sent as `Authorization: Payaza <base64>`.
    PAYAZA_API_KEY: z.string().default(""),
    // Payaza SECRET key. Used ONLY to verify webhook signatures. Never sent anywhere.
    PAYAZA_SECRET_KEY: z.string().default(""),
    PAYAZA_BASE_URL: z.string().default("https://api.payaza.africa/live"),
    // 6-digit transaction PIN set on the Payaza dashboard (required for every payout).
    PAYAZA_TRANSACTION_PIN: z.string().default(""),
    // Optional. If blank the NGN payazaAccountReference is fetched from Payaza.
    PAYAZA_ACCOUNT_REFERENCE: z.string().default(""),
    // Virtual-account provider bank. 140 = Globus (supports exact-amount validation).
    PAYAZA_VA_BANK_CODE: z.string().default("140"),
    PAYAZA_VA_EXPIRY_MINUTES: z.coerce.number().int().min(15).max(480).default(30),
    PAYAZA_CUSTOMER_PHONE: z.string().default("07000000000"),

    // Platform commission in basis points (100 = 1%). 0 = no fee.
    PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(5000).default(0),
    PAYOUT_MIN_AMOUNT: z.coerce.number().positive().default(1000),
    PAYOUT_MAX_AMOUNT: z.coerce.number().positive().default(5_000_000),
    // After a creator changes bank details they cannot withdraw for this long.
    PAYOUT_COOLDOWN_HOURS: z.coerce.number().min(0).default(24),
    // Creators can't submit work until the brand has funded the milestone escrow.
    REQUIRE_FUNDED_ESCROW: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),

    ENABLE_RECONCILER: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    RECONCILE_INTERVAL_SECONDS: z.coerce.number().int().min(15).default(60),

    OPENAI_API_KEY: z.string().default(""),

    CLOUDINARY_CLOUD_NAME: z.string().default(""),
    CLOUDINARY_API_KEY: z.string().default(""),
    CLOUDINARY_API_SECRET: z.string().default(""),

    CORS_ORIGIN: z.string().default("http://localhost:3000"),

    RESEND_API_KEY: z.string().default(""),
    FROM_EMAIL: z.string().email().default("noreply@creatorvault.com"),

    API_VERSION: z.string().default("v1"),
  })
  .superRefine((env, ctx) => {
    if (env.PAYMENTS_MODE === "disabled") return;
    const need = (key: "PAYAZA_API_KEY" | "PAYAZA_SECRET_KEY" | "PAYAZA_TRANSACTION_PIN") => {
      if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when PAYMENTS_MODE=${env.PAYMENTS_MODE}` });
    };
    need("PAYAZA_API_KEY");
    need("PAYAZA_SECRET_KEY");
    need("PAYAZA_TRANSACTION_PIN");
    if (env.PAYAZA_TRANSACTION_PIN && !/^\d{6}$/.test(env.PAYAZA_TRANSACTION_PIN)) {
      ctx.addIssue({ code: "custom", path: ["PAYAZA_TRANSACTION_PIN"], message: "must be exactly 6 digits" });
    }
    if (env.PAYMENTS_MODE === "live" && env.PAYMENTS_LIVE_CONFIRM !== "I_UNDERSTAND_THIS_MOVES_REAL_MONEY") {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENTS_LIVE_CONFIRM"],
        message: "Set PAYMENTS_LIVE_CONFIRM=I_UNDERSTAND_THIS_MOVES_REAL_MONEY to enable live mode",
      });
    }
    if (env.PAYMENTS_MODE === "live" && env.NODE_ENV !== "production") {
      ctx.addIssue({ code: "custom", path: ["NODE_ENV"], message: "live payments require NODE_ENV=production" });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  PAYAZA_BASE_URL: normalizePayazaBaseUrl(parsed.data.PAYAZA_BASE_URL),
};

/** "sandbox" | "live" — which ledger/payment environment is active. */
export function paymentsEnvironment(): "sandbox" | "live" {
  return config.PAYMENTS_MODE === "live" ? "live" : "sandbox";
}
export function paymentsEnabled(): boolean {
  return config.PAYMENTS_MODE !== "disabled";
}
