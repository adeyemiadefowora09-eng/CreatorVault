/**
 * Creator payout destination. Bank details can ONLY be set through this verified path
 * (Payaza Account Name Enquiry, then the creator confirms the resolved name). The old
 * free-text bank fields on PATCH /users/profile/creator are no longer accepted.
 */
import { prisma } from "../../config/db.js";
import { config } from "../../config/env.js";
import { ApiError } from "../../utils/apiError.js";
import { createNotification } from "../notifications/notifications.service.js";
import { audit } from "./audit.js";
import { requireEnabled } from "./escrow.service.js";
import * as payaza from "./payaza.client.js";

let bankCache: { at: number; banks: { code: string; name: string }[] } | null = null;

export async function listBanks() {
  requireEnabled();
  if (bankCache && Date.now() - bankCache.at < 6 * 3600_000) return bankCache.banks;
  try {
    const banks = (await payaza.listNigerianBanks()).sort((a, b) => a.name.localeCompare(b.name));
    bankCache = { at: Date.now(), banks };
    return banks;
  } catch {
    throw new ApiError(502, "Could not load the bank list from the payment provider", "PROVIDER_ERROR");
  }
}

export const normaliseName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

async function assertCreator(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { creatorProfile: true } });
  if (!user || user.role !== "CREATOR" || !user.creatorProfile) throw ApiError.forbidden("Only creators have a payout account");
  return user;
}

function validate(bankCode: string, accountNumber: string) {
  if (!/^\d{10}$/.test(accountNumber)) throw ApiError.badRequest("Account number must be exactly 10 digits (NUBAN)");
  if (!/^[A-Za-z0-9]{2,12}$/.test(bankCode)) throw ApiError.badRequest("Invalid bank code");
}

export async function resolveBankAccount(userId: string, bankCode: string, accountNumber: string) {
  requireEnabled();
  await assertCreator(userId);
  validate(bankCode, accountNumber);
  try {
    const r = await payaza.accountNameEnquiry(bankCode, accountNumber);
    return { accountName: r.accountName, accountNumber: r.accountNumber, bankCode: r.bankCode };
  } catch (err) {
    await audit("BANK_ENQUIRY_FAILED", "user", userId, { bankCode, last4: accountNumber.slice(-4) }, userId);
    throw ApiError.badRequest("We couldn't verify that account. Check the bank and account number.");
  }
}

export async function saveBankAccount(userId: string, input: { bankCode: string; accountNumber: string; confirmedAccountName: string }) {
  requireEnabled();
  const user = await assertCreator(userId);
  validate(input.bankCode, input.accountNumber);

  const inflight = await prisma.payout.count({ where: { userId, status: { in: ["PENDING", "PROCESSING"] } } });
  if (inflight > 0) throw ApiError.conflict("You can't change bank details while a payout is in progress");

  // Re-resolve on the server: never trust a name supplied by the client.
  const resolved = await payaza.accountNameEnquiry(input.bankCode, input.accountNumber).catch(() => {
    throw ApiError.badRequest("We couldn't verify that account. Check the bank and account number.");
  });
  if (normaliseName(resolved.accountName) !== normaliseName(input.confirmedAccountName)) {
    throw ApiError.badRequest("The confirmed name does not match the bank's record for this account");
  }
  const bank = (await listBanks()).find((b) => b.code === input.bankCode);
  if (!bank) throw ApiError.badRequest("Unknown bank code");

  const profile = await prisma.creatorProfile.update({
    where: { userId },
    data: {
      bankCode: bank.code, bankName: bank.name, bankAccountNumber: input.accountNumber,
      bankAccountName: resolved.accountName, bankVerifiedAt: new Date(), bankChangedAt: new Date(),
    },
  });
  await audit("BANK_DETAILS_CHANGED", "user", userId, { bankCode: bank.code, last4: input.accountNumber.slice(-4) }, userId);
  await createNotification({
    userId: user.id, type: "BANK_DETAILS_CHANGED", title: "Payout bank account updated",
    message: `Your payout account is now ${bank.name} ••••${input.accountNumber.slice(-4)}. Withdrawals are paused for ${config.PAYOUT_COOLDOWN_HOURS}h as a security measure. If this wasn't you, contact support immediately.`,
    metadata: {},
  }).catch(() => undefined);

  return {
    bankName: profile.bankName, bankCode: profile.bankCode, bankAccountName: profile.bankAccountName,
    bankAccountNumber: `••••${input.accountNumber.slice(-4)}`, bankVerifiedAt: profile.bankVerifiedAt,
    withdrawalsAvailableAt: new Date(Date.now() + config.PAYOUT_COOLDOWN_HOURS * 3600_000),
  };
}
