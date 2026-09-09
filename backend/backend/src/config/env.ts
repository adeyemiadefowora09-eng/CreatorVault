import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default("15m"),
  JWT_REFRESH_EXPIRY: z.string().default("7d"),

  PAYAZA_API_KEY: z.string().default(""),
  PAYAZA_SECRET_KEY: z.string().default(""),
  PAYAZA_BASE_URL: z.string().default("https://router-live.payaza.africa"),

  OPENAI_API_KEY: z.string().default(""),

  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  CLOUDINARY_API_KEY: z.string().default(""),
  CLOUDINARY_API_SECRET: z.string().default(""),

  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  RESEND_API_KEY: z.string().default(""),
  FROM_EMAIL: z.string().email().default("noreply@creatorvault.com"),

  API_VERSION: z.string().default("v1"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
