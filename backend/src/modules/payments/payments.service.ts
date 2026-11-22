import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "../../config/db.js";
import { config, paymentsEnabled, paymentsEnvironment } from "../../config/env.js";
import { ApiError } from "../../utils/apiError.js";
import { getPaginationMeta } from "../../types/index.js";
<<<<<<< HEAD
import { Decimal } from "./money.js";
import { confirmFunding, requireEnabled, toPublicPayment } from "./escrow.service.js";
import { balanceOf, Accounts } from "./ledger.js";

export { initializePayment } from "./escrow.service.js";
export { getPayoutBalance, requestPayout, listPayouts } from "./payouts.service.js";

export async function getPaymentMode() {
  return {
    mode: config.PAYMENTS_MODE,
    enabled: paymentsEnabled(),
    sandbox: paymentsEnvironment() === "sandbox",
    live: config.PAYMENTS_MODE === "live",
    escrowRequired: config.REQUIRE_FUNDED_ESCROW,
    platformFeeBps: config.PLATFORM_FEE_BPS,
    payoutMinAmount: config.PAYOUT_MIN_AMOUNT,
  };
}

/**
 * Client-triggered "check where my payment stands". It never trusts the client: it asks Payaza,
 * and only a provider-confirmed, amount-matched payment moves money into escrow.
 */
export async function verifyPayment(reference: string, userId: string) {
  requireEnabled();
  const payment = await prisma.payment.findUnique({ where: { providerRef: reference } });
  if (!payment) throw ApiError.notFound("Payment");
  if (payment.payerId !== userId && payment.payeeId !== userId) throw ApiError.forbidden("You are not a party to this payment");
  const r = await confirmFunding(payment.id, undefined, "verify");
  const pub = toPublicPayment(r.payment!);
  return userId === payment.payerId ? pub : { ...pub, virtualAccount: null };
}

export async function listPayments(userId: string, query: { page: number; limit: number; status?: string; dealId?: string }) {
  const { page, limit, status, dealId } = query;
=======
import { createNotification } from "../notifications/notifications.service.js";
import { payazaClient } from "./payaza.client.js";
import { ledgerService } from "./ledger.service.js";

const PLATFORM_FEE = 100; // Flat 100 NGN retained platform revenue per milestone

function checkPaymentsMode() {
  if (config.PAYMENTS_MODE === "test" && config.NODE_ENV !== "test" && config.NODE_ENV !== "development") {
    // Demo mode only allowed in test/dev
    throw ApiError.internal("Demo payment mode cannot be executed in production");
  }
}

// 1. ESCROW INITIATION: Brand funds milestone upfront into CreatorVault escrow
export async function initializePayment(
  userId: string,
  dealId: string,
  milestoneId: string,
  idempotencyKey?: string
) {
  checkPaymentsMode();

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { brand: true, creator: true },
  });
  if (!deal) throw ApiError.notFound("Deal");
  if (deal.brandId !== userId) throw ApiError.forbidden("Only the brand can fund milestones");

  // Dispute check: Cannot fund disputed deals
  if (deal.status === "DISPUTED") {
    throw ApiError.badRequest("Cannot fund milestones while this deal is in an active dispute.");
  }

  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    include: { payment: true },
  });
  if (!milestone) throw ApiError.notFound("Milestone");
  if (milestone.dealId !== dealId) throw ApiError.badRequest("Milestone does not belong to this deal");

  if (milestone.payment && milestone.payment.status === "COMPLETED") {
    throw ApiError.badRequest("This milestone has already been funded in escrow.");
  }

  // Idempotency check: Reuse existing pending payment if within last 24h
  if (milestone.payment && milestone.payment.status === "PENDING" && milestone.payment.providerRef) {
    const hoursOld = (Date.now() - new Date(milestone.payment.createdAt).getTime()) / (1000 * 60 * 60);
    if (hoursOld < 24) {
      return {
        payment: milestone.payment,
        checkoutUrl: `${config.CORS_ORIGIN}/payments/verify/${milestone.payment.providerRef}`,
      };
    }
  }

  const reference = idempotencyKey || `ESCROW_HOLD_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const isDemoMode = config.PAYMENTS_MODE === "test";

  let payment;
  if (milestone.payment) {
    payment = await prisma.payment.update({
      where: { id: milestone.payment.id },
      data: {
        providerRef: reference,
        amount: milestone.amount,
        status: "PENDING",
        isDemo: isDemoMode,
      },
    });
  } else {
    payment = await prisma.payment.create({
      data: {
        dealId,
        milestoneId,
        payerId: deal.brandId,
        payeeId: deal.creatorId,
        amount: milestone.amount,
        currency: deal.currency,
        status: "PENDING",
        providerRef: reference,
        provider: "PAYAZA",
        isDemo: isDemoMode,
      },
    });
  }

  // Record audit log
  await prisma.auditLog.create({
    data: {
      action: "ESCROW_INITIATED",
      entityType: "PAYMENT",
      entityId: payment.id,
      userId,
      metadata: { dealId, milestoneId, amount: payment.amount, reference },
    },
  });

  const nameParts = deal.brand.name.trim().split(" ");
  const firstName = nameParts[0] || "Brand";
  const lastName = nameParts.slice(1).join(" ") || "User";

  const { checkoutUrl } = await payazaClient.initializeCheckout({
    amount: Number(milestone.amount),
    currency: deal.currency,
    email: deal.brand.email,
    firstName,
    lastName,
    reference,
    callbackUrl: `${config.CORS_ORIGIN}/payments/verify/${reference}`,
  });

  return { payment, checkoutUrl };
}

// 2. ESCROW VERIFICATION: Confirm transaction, post to Ledger, and mark Escrow as SECURED
export async function verifyPayment(reference: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { providerRef: reference },
      include: { deal: true, milestone: true },
    });

    if (!payment) throw ApiError.notFound("Payment with this reference not found.");

    if (payment.status !== "COMPLETED") {
      if (Number(payment.amount) <= 0) {
        throw ApiError.badRequest("Invalid milestone payment amount.");
      }

      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: { status: "COMPLETED", paidAt: new Date() },
      });

      // Post double-entry ledger entry atomically: Asset Debit & Liability Credit
      await ledgerService.recordEscrowHold(tx, {
        reference: payment.providerRef || payment.id,
        amount: payment.amount,
        currency: payment.currency,
        dealId: payment.dealId,
        milestoneId: payment.milestoneId || undefined,
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: "ESCROW_SECURED",
          entityType: "PAYMENT",
          entityId: payment.id,
          userId: payment.payerId,
          metadata: { amount: payment.amount, reference },
        },
      });

      // Advance milestone to IN_PROGRESS so creator knows escrow is funded
      if (payment.milestoneId) {
        await tx.milestone.update({
          where: { id: payment.milestoneId },
          data: { status: "IN_PROGRESS" },
        });

        const milestoneTitle = payment.milestone?.title || "Deliverable";
        await createNotification({
          userId: payment.payeeId,
          type: "PAYMENT_COMPLETED",
          title: "Escrow Funded 🛡️",
          message: `Milestone "${milestoneTitle}" was funded with ${payment.amount} ${payment.currency}. Funds are secured in Escrow. You may now start work!`,
          metadata: { dealId: payment.dealId, milestoneId: payment.milestoneId, paymentId: payment.id },
        });
      }

      return updatedPayment;
    }

    return payment;
  });
}

// 3. ESCROW RELEASE: Triggered when brand approves submitted milestone deliverables
export async function releaseEscrowPayout(milestoneId: string) {
  return prisma.$transaction(async (tx) => {
    const milestone = await tx.milestone.findUnique({
      where: { id: milestoneId },
      include: {
        deal: {
          include: {
            creator: {
              include: { creatorProfile: true, bankAccount: true },
            },
            disputes: {
              where: { status: { in: ["OPEN", "UNDER_REVIEW", "ESCALATED"] } },
            },
          },
        },
        payment: true,
      },
    });

    if (!milestone) throw ApiError.notFound("Milestone");

    // Dispute Freeze Safeguard
    if (milestone.deal.disputes.length > 0 || milestone.deal.status === "DISPUTED") {
      throw ApiError.badRequest("Escrow release is frozen due to an active dispute on this deal.");
    }

    if (!milestone.payment || milestone.payment.status !== "COMPLETED") {
      return {
        success: true,
        released: false,
        message: "Milestone approved, but escrow was not funded in advance.",
      };
    }

    const creator = milestone.deal.creator;
    const grossAmount = Number(milestone.amount);
    const payoutAmount = Math.max(0, grossAmount - PLATFORM_FEE);

    // Record double-entry ledger release:
    // Debit Escrow Holding -> Credit Creator Payable + Credit Platform Fee Revenue
    await ledgerService.recordEscrowRelease(tx, {
      reference: milestone.payment.providerRef || milestone.id,
      grossAmount,
      feeAmount: PLATFORM_FEE,
      netPayoutAmount: payoutAmount,
      creatorId: creator.id,
      currency: milestone.deal.currency,
      milestoneId: milestone.id,
    });

    const accountNumber = creator.bankAccount?.accountNumber || creator.creatorProfile?.bankAccountNumber;
    const bankCode = creator.bankAccount?.bankCode || creator.creatorProfile?.bankCode;
    const bankName = creator.bankAccount?.accountName || creator.creatorProfile?.bankName || "Bank";

    // Case A: Creator has linked bank details -> Disburse automatically via Payaza
    if (accountNumber && bankCode) {
      const payoutRef = `ESCROW_REL_${Date.now()}_${randomUUID().slice(0, 8)}`;

      // Execute Payout via Payaza
      await payazaClient.disbursePayout({
        payout_amount: payoutAmount,
        currency: milestone.deal.currency,
        country: "NGA",
        narration: `CreatorVault Escrow Release: ${milestone.deal.title}`,
        beneficiaries: [
          {
            credit_amount: payoutAmount,
            account_number: accountNumber,
            account_name: bankName,
            bank_code: bankCode,
          },
        ],
      });

      // Record completed payout
      await tx.payout.create({
        data: {
          userId: creator.id,
          amount: payoutAmount,
          currency: milestone.deal.currency,
          status: "COMPLETED",
          providerRef: payoutRef,
          bankAccountNumber: accountNumber,
          bankCode,
          bankName,
          completedAt: new Date(),
          isDemo: milestone.payment.isDemo,
        },
      });

      // Ledger entry for payout disbursement
      await ledgerService.recordPayoutDisbursement(tx, {
        reference: payoutRef,
        amount: payoutAmount,
        creatorId: creator.id,
        currency: milestone.deal.currency,
      });

      await tx.milestone.update({
        where: { id: milestoneId },
        data: { status: "PAID" },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          action: "ESCROW_RELEASED_AUTO_PAYOUT",
          entityType: "PAYOUT",
          entityId: payoutRef,
          userId: creator.id,
          metadata: { amount: payoutAmount, platformFee: PLATFORM_FEE, milestoneId },
        },
      });

      await createNotification({
        userId: creator.id,
        type: "PAYMENT_COMPLETED",
        title: "Escrow Released! 💰",
        message: `Your work was approved! ${payoutAmount} ${milestone.deal.currency} has been paid to your ${bankName} account (less ${PLATFORM_FEE} NGN platform fee).`,
        metadata: { dealId: milestone.dealId, milestoneId: milestone.id },
      });

      return {
        success: true,
        released: true,
        payoutAmount,
        platformFee: PLATFORM_FEE,
      };
    }

    // Case B: Creator DOES NOT have bank details yet -> Hold in available balance
    await tx.milestone.update({
      where: { id: milestoneId },
      data: { status: "APPROVED" },
    });

    await tx.auditLog.create({
      data: {
        action: "ESCROW_RELEASED_TO_BALANCE",
        entityType: "MILESTONE",
        entityId: milestoneId,
        userId: creator.id,
        metadata: { amount: payoutAmount, platformFee: PLATFORM_FEE },
      },
    });

    await createNotification({
      userId: creator.id,
      type: "MILESTONE_APPROVED",
      title: "Milestone Approved! Funds Ready 🛡️",
      message: `Your milestone was approved! ${payoutAmount} ${milestone.deal.currency} is waiting in your balance. Add your bank details in Settings to withdraw anytime.`,
      metadata: { dealId: milestone.dealId, milestoneId: milestone.id },
    });

    return {
      success: true,
      released: false,
      pendingWithdrawal: true,
      payoutAmount,
      platformFee: PLATFORM_FEE,
    };
  });
}

// 4. CREATOR BALANCE: Compute available earnings ready for withdrawal using Double-Entry Ledger
export async function getPayoutBalance(userId: string) {
  // Query ledger balance (immune to race conditions, deficits detected)
  const ledgerBalance = await ledgerService.getCreatorLedgerBalance(userId);

  const pendingPayouts = await prisma.payout.aggregate({
    where: {
      userId,
      status: { in: ["PENDING", "PROCESSING"] },
    },
    _sum: { amount: true },
  });

  const pendingAmount = Number(pendingPayouts._sum.amount || 0);
  const availableBalance = ledgerBalance - pendingAmount;

  return {
    availableBalance: Math.max(0, availableBalance),
    totalEarned: ledgerBalance,
    pendingPayouts: pendingAmount,
    currency: "NGN",
  };
}

// 5. WITHDRAWAL REQUEST: Creator triggers manual payout of their balance
export async function requestPayout(userId: string, amount: number, idempotencyKey?: string) {
  if (amount <= 0) throw ApiError.badRequest("Amount must be greater than zero.");
  checkPaymentsMode();

  return prisma.$transaction(async (tx) => {
    // 1. Check ledger balance inside transaction
    const balance = await ledgerService.getCreatorLedgerBalance(userId);

    const pendingPayouts = await tx.payout.aggregate({
      where: {
        userId,
        status: { in: ["PENDING", "PROCESSING"] },
      },
      _sum: { amount: true },
    });

    const pendingAmount = Number(pendingPayouts._sum.amount || 0);
    const available = balance - pendingAmount;

    if (amount > available) {
      throw ApiError.badRequest(`Insufficient available balance. You have ${Math.max(0, available)} NGN available.`);
    }

    const creator = await tx.user.findUnique({
      where: { id: userId },
      include: { creatorProfile: true, bankAccount: true },
    });

    const accountNumber = creator?.bankAccount?.accountNumber || creator?.creatorProfile?.bankAccountNumber;
    const bankCode = creator?.bankAccount?.bankCode || creator?.creatorProfile?.bankCode;
    const bankName = creator?.bankAccount?.accountName || creator?.creatorProfile?.bankName || "Bank";

    if (!accountNumber || !bankCode) {
      throw ApiError.badRequest("Please add your bank account in Settings before requesting a payout.");
    }

    // Cooling-off security check: 24h wait after bank account change
    if (creator?.bankAccount?.lastChangedAt) {
      const hoursSinceChange =
        (Date.now() - new Date(creator.bankAccount.lastChangedAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceChange < 24) {
        throw ApiError.badRequest(
          "Bank details were recently updated. For account security, payouts are locked for 24 hours after updating bank details."
        );
      }
    }

    const payoutRef = idempotencyKey || `PO_${Date.now()}_${randomUUID().slice(0, 8)}`;

    // Create payout record with PROCESSING status
    const payout = await tx.payout.create({
      data: {
        userId,
        amount,
        currency: "NGN",
        status: "PROCESSING",
        providerRef: payoutRef,
        bankAccountNumber: accountNumber,
        bankCode,
        bankName,
        isDemo: config.PAYMENTS_MODE === "test",
      },
    });

    // Debit creator payable in ledger
    await ledgerService.recordPayoutDisbursement(tx, {
      reference: payoutRef,
      amount,
      creatorId: userId,
      currency: "NGN",
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        action: "PAYOUT_REQUESTED",
        entityType: "PAYOUT",
        entityId: payout.id,
        userId,
        metadata: { amount, bankAccountNumber: accountNumber, bankCode, reference: payoutRef },
      },
    });

    // Disburse via Payaza Payout Receptor API
    const result = await payazaClient.disbursePayout({
      payout_amount: amount,
      currency: "NGN",
      country: "NGA",
      narration: `CreatorVault Withdrawal: ${creator?.name || "Creator"}`,
      beneficiaries: [
        {
          credit_amount: amount,
          account_number: accountNumber,
          account_name: bankName,
          bank_code: bankCode,
        },
      ],
    });

    if (!result.success) {
      // Reversal: Immediately fail and post ledger reversal
      await tx.payout.update({
        where: { id: payout.id },
        data: {
          status: "FAILED",
          failureReason: String(result.data || "Payaza rejected transfer request"),
        },
      });

      await ledgerService.recordPayoutFailureReversal(tx, {
        reference: payoutRef,
        amount,
        creatorId: userId,
        currency: "NGN",
        reason: String(result.data),
      });

      await tx.auditLog.create({
        data: {
          action: "PAYOUT_FAILED_REVERSED",
          entityType: "PAYOUT",
          entityId: payout.id,
          userId,
          metadata: { reason: result.data, amount },
        },
      });

      throw ApiError.badRequest(`Transfer failed with provider: ${result.data || "Request rejected"}`);
    }

    return payout;
  });
}

// 6. STATUS POLLING & RECONCILIATION: Check provider status for pending payouts
export async function syncPayoutStatus(payoutId: string, userId?: string) {
  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
  });
  if (!payout) throw ApiError.notFound("Payout not found");
  if (userId && payout.userId !== userId) throw ApiError.forbidden("Access denied");

  if (payout.status === "COMPLETED" || payout.status === "FAILED") {
    return payout;
  }

  if (!payout.providerRef) return payout;

  const statusResponse = await payazaClient.getTransferStatus(payout.providerRef);
  if (!statusResponse) return payout;

  const statusString = String(statusResponse.transaction_status || statusResponse.status || "").toLowerCase();

  if (statusString === "completed" || statusString === "successful") {
    return prisma.payout.update({
      where: { id: payout.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  } else if (statusString === "failed" || statusString === "rejected") {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.payout.update({
        where: { id: payout.id },
        data: {
          status: "FAILED",
          failureReason: statusResponse.message || "Provider confirmed failed transfer",
        },
      });

      // Post ledger reversal so user balance is restored
      await ledgerService.recordPayoutFailureReversal(tx, {
        reference: payout.providerRef!,
        amount: payout.amount,
        creatorId: payout.userId,
        currency: payout.currency,
        reason: statusResponse.message,
      });

      await createNotification({
        userId: payout.userId,
        type: "PAYOUT_FAILED",
        title: "Withdrawal Failed",
        message: `Your withdrawal of ${payout.amount} ${payout.currency} failed and has been refunded to your CreatorVault balance.`,
        metadata: { payoutId: payout.id },
      });

      return updated;
    });
  }

  return payout;
}

// 7. BANK ACCOUNT ENQUIRY & VERIFICATION
export async function resolveBankDetails(bankCode: string, accountNumber: string) {
  const result = await payazaClient.resolveAccount({
    currency: "NGN",
    bank_code: bankCode,
    account_number: accountNumber,
  });

  if (!result.success || !result.account_name) {
    throw ApiError.badRequest("Could not verify bank account with provider. Please check your bank code and account number.");
  }

  return {
    bankCode,
    accountNumber,
    accountName: result.account_name,
  };
}

export async function saveVerifiedBankAccount(
  userId: string,
  data: { bankCode: string; accountNumber: string; bankName?: string }
) {
  const resolved = await resolveBankDetails(data.bankCode, data.accountNumber);

  const bankAccount = await prisma.bankAccount.upsert({
    where: { creatorId: userId },
    update: {
      bankCode: data.bankCode,
      accountNumber: data.accountNumber,
      accountName: resolved.accountName,
      isVerified: true,
      verifiedAt: new Date(),
      lastChangedAt: new Date(),
    },
    create: {
      creatorId: userId,
      bankCode: data.bankCode,
      accountNumber: data.accountNumber,
      accountName: resolved.accountName,
      isVerified: true,
      verifiedAt: new Date(),
      lastChangedAt: new Date(),
    },
  });

  await prisma.creatorProfile.updateMany({
    where: { userId },
    data: {
      bankCode: data.bankCode,
      bankAccountNumber: data.accountNumber,
      bankAccountName: resolved.accountName,
      bankName: data.bankName || resolved.accountName,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "BANK_ACCOUNT_VERIFIED_AND_SAVED",
      entityType: "BANK_ACCOUNT",
      entityId: bankAccount.id,
      userId,
      metadata: { bankCode: data.bankCode, accountName: resolved.accountName },
    },
  });

  return bankAccount;
}

// 8. ESCROW REFUND (Dispute Resolution / Cancellation)
export async function refundEscrow(dealId: string, milestoneId: string, reason: string, adminUserId?: string) {
  return prisma.$transaction(async (tx) => {
    const milestone = await tx.milestone.findUnique({
      where: { id: milestoneId },
      include: { payment: true, deal: true },
    });

    if (!milestone) throw ApiError.notFound("Milestone not found");
    if (!milestone.payment || milestone.payment.status !== "COMPLETED") {
      throw ApiError.badRequest("No completed escrow payment exists to refund for this milestone.");
    }

    const refundRef = `REFUND_${Date.now()}_${randomUUID().slice(0, 8)}`;

    await tx.payment.update({
      where: { id: milestone.payment.id },
      data: { status: "REFUNDED" },
    });

    await tx.milestone.update({
      where: { id: milestoneId },
      data: { status: "PENDING" },
    });

    await ledgerService.recordEscrowRefund(tx, {
      reference: refundRef,
      amount: milestone.payment.amount,
      dealId,
      milestoneId,
      currency: milestone.payment.currency,
      reason,
    });

    await tx.auditLog.create({
      data: {
        action: "ESCROW_REFUNDED",
        entityType: "PAYMENT",
        entityId: milestone.payment.id,
        userId: adminUserId || milestone.deal.brandId,
        metadata: { reason, amount: milestone.payment.amount, dealId, milestoneId },
      },
    });

    await createNotification({
      userId: milestone.deal.brandId,
      type: "DISPUTE_RESOLVED",
      title: "Escrow Refunded",
      message: `Your payment of ${milestone.payment.amount} ${milestone.payment.currency} for milestone "${milestone.title}" has been refunded. Reason: ${reason}`,
      metadata: { dealId, milestoneId },
    });

    return { success: true, refundReference: refundRef };
  });
}

export async function listPayouts(userId: string) {
  return prisma.payout.findMany({
    where: { userId },
    orderBy: { requestedAt: "desc" },
  });
}

export async function listPayments(userId: string, query: any) {
  const { page = 1, limit = 20, status, dealId } = query;
  const skip = (Number(page) - 1) * Number(limit);

>>>>>>> 9c15709e71866d0d287652bd5fa6ab5f84e07faf
  const where: Prisma.PaymentWhereInput = {
    OR: [{ payerId: userId }, { payeeId: userId }],
    isDemo: false,
    environment: paymentsEnvironment(),
    ...(status && { status: status as Prisma.PaymentWhereInput["status"] }),
    ...(dealId && { dealId }),
  };
  const [items, total] = await Promise.all([
    prisma.payment.findMany({
<<<<<<< HEAD
      where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: "desc" },
      include: { deal: { select: { title: true } }, milestone: { select: { title: true, escrowStatus: true } } },
    }),
    prisma.payment.count({ where }),
  ]);
  const mapped = items.map((p) => {
    const pub = toPublicPayment(p);
    return { ...pub, payerId: p.payerId, payeeId: p.payeeId, provider: p.provider, virtualAccount: p.payerId === userId ? pub.virtualAccount : null, deal: p.deal, milestone: p.milestone };
  });
  return { items: mapped, meta: getPaginationMeta(page, limit, total) };
}

export async function getPaymentStats(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("User");
  const env = paymentsEnvironment();
  const base = { environment: env, isDemo: false };

  if (user.role === "CREATOR") {
    const available = await balanceOf(prisma, Accounts.userAvailable(userId));
    const [released, inEscrow] = await Promise.all([
      prisma.milestone.aggregate({ where: { deal: { creatorId: userId }, escrowStatus: "RELEASED", payments: { some: { ...base, status: "COMPLETED" } } }, _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { payeeId: userId, ...base, status: "COMPLETED", milestone: { escrowStatus: "FUNDED" } }, _sum: { amountReceived: true } }),
    ]);
    return {
      earned: new Decimal(released._sum.amount ?? 0).toString(),
      pending: new Decimal(inEscrow._sum.amountReceived ?? 0).toString(), // funded, awaiting brand approval
      available: available.toString(),
    };
  }
  const [funded, inEscrow, refundable] = await Promise.all([
    prisma.payment.aggregate({ where: { payerId: userId, ...base, status: "COMPLETED" }, _sum: { amountReceived: true } }),
    prisma.payment.aggregate({ where: { payerId: userId, ...base, status: "COMPLETED", milestone: { escrowStatus: "FUNDED" } }, _sum: { amountReceived: true } }),
    balanceOf(prisma, Accounts.brandRefundable(userId)),
  ]);
  return {
    spent: new Decimal(funded._sum.amountReceived ?? 0).toString(),
    inEscrow: new Decimal(inEscrow._sum.amountReceived ?? 0).toString(),
    refundable: refundable.toString(),
  };
}

/** SANDBOX ONLY: asks Payaza to simulate the brand's bank transfer. Payaza then fires a real webhook at us. */
export async function simulateSandboxPayment(reference: string, userId: string) {
  requireEnabled();
  if (paymentsEnvironment() !== "sandbox") throw ApiError.forbidden("Only available in sandbox mode");
  const p = await prisma.payment.findUnique({ where: { providerRef: reference } });
  if (!p || p.payerId !== userId) throw ApiError.notFound("Payment");
  if (p.status !== "PENDING" || !p.vaAccountNumber) throw ApiError.badRequest("Payment is not awaiting funds");
  const { fundTestVirtualAccount } = await import("./payaza.client.js");
  try {
    await fundTestVirtualAccount({ accountNumber: p.vaAccountNumber, accountName: p.vaAccountName ?? "", reference, amount: new Decimal(p.amount).toString() });
  } catch {
    throw new ApiError(502, "Sandbox funding request failed", "PROVIDER_ERROR");
  }
  return { requested: true, note: "Payaza will now send a webhook; you can also press 'Check payment status'." };
}
=======
      where,
      skip,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
      include: {
        deal: { select: { id: true, title: true } },
        milestone: { select: { id: true, title: true, status: true } },
      },
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    items,
    meta: getPaginationMeta(Number(page), Number(limit), total),
  };
}

export async function getPaymentStats(userId: string) {
  const [totalSpent, totalReceived, escrowSecured] = await Promise.all([
    prisma.payment.aggregate({
      where: { payerId: userId, status: "COMPLETED" },
      _sum: { amount: true },
    }),
    prisma.payout.aggregate({
      where: { userId, status: "COMPLETED" },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: {
        payeeId: userId,
        status: "COMPLETED",
        milestone: { status: { in: ["PENDING", "IN_PROGRESS", "SUBMITTED"] } },
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    totalSpent: Number(totalSpent._sum.amount || 0),
    totalReceived: Number(totalReceived._sum.amount || 0),
    escrowSecured: Number(escrowSecured._sum.amount || 0),
  };
}
>>>>>>> 9c15709e71866d0d287652bd5fa6ab5f84e07faf
