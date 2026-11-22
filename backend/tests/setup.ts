// Safe dummy env so modules that import config/env.ts can load under test. No real secrets here.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/creatorvault_test";
process.env.JWT_SECRET ??= "x".repeat(40);
process.env.JWT_REFRESH_SECRET ??= "y".repeat(40);
process.env.PAYMENTS_MODE ??= "sandbox";
process.env.PAYAZA_API_KEY ??= "PZ78-PK-TEST-0000";
process.env.PAYAZA_SECRET_KEY ??= "PZ78-SK-TEST-secret";
process.env.PAYAZA_TRANSACTION_PIN ??= "482915";
process.env.PAYAZA_BASE_URL ??= "https://api.payaza.africa/live/";
process.env.PAYAZA_ACCOUNT_REFERENCE ??= "1010000000";
process.env.PAYOUT_MIN_AMOUNT ??= "100";
process.env.PAYOUT_COOLDOWN_HOURS ??= "0";
