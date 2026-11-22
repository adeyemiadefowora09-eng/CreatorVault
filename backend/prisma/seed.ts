import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/utils/hash.js";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding CreatorVault database...");

  // 1. Seed System Admin
  const adminEmail = process.env.ADMIN_EMAIL || "admin@creatorvault.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "AdminSecret2026!#Secure";
  const passwordHash = await hashPassword(adminPassword);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: "CreatorVault System Admin",
      passwordHash,
      role: "ADMIN",
      emailVerified: true,
      trustScore: 100,
    },
  });

  console.log(`Admin user ready: ${admin.email}`);

  // 2. Seed System Ledger Accounts
  const ledgerAccounts = [
    { name: "SYSTEM_PAYAZA_VAULT", type: "ASSET", currency: "NGN" },
    { name: "SYSTEM_ESCROW_HOLDING", type: "LIABILITY", currency: "NGN" },
    { name: "SYSTEM_PLATFORM_REVENUE", type: "REVENUE", currency: "NGN" },
  ];

  for (const acc of ledgerAccounts) {
    await prisma.ledgerAccount.upsert({
      where: { name: acc.name },
      update: {},
      create: acc,
    });
  }

  console.log("System ledger accounts initialized.");
}

main()
  .catch((e) => {
    console.error("Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
