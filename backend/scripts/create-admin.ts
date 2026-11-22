/**
 * Creates (or promotes) an ADMIN user. Admins resolve disputes, review mismatched payments and settle brand refunds.
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-passphrase' npm run create-admin
 */
import { prisma } from "../src/config/db.js";
import { hashPassword } from "../src/utils/hash.js";

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (min 12 chars).");
    process.exit(1);
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { role: "ADMIN" } });
    console.log(`Promoted existing user ${email} to ADMIN.`);
  } else {
    await prisma.user.create({ data: { email, name: "Platform Admin", role: "ADMIN", passwordHash: await hashPassword(password), emailVerified: true } });
    console.log(`Created ADMIN ${email}.`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
