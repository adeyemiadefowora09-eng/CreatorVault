import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { config } from "../../config/env.js";
import { ApiError } from "../../utils/apiError.js";
import { getPaginationMeta } from "../../types/index.js";
import { createNotification } from "../notifications/notifications.service.js";

export async function initializePayment(userId: string, dealId: string, milestoneId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { brand: true },
  });
  if (!deal) throw ApiError.notFound("Deal");
  if (deal.brandId !== userId) throw ApiError.forbidden("Only the brand can pay");

  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
  if (!milestone) throw ApiError.notFound("Milestone");
  if (milestone.status !== "APPROVED") throw ApiError.badRequest("Milestone not approved yet");

  const existing = await prisma.payment.findFirst({
    where: { milestoneId, status: { in: ["COMPLETED", "PROCESSING"] } },
  });
  if (existing) throw ApiError.conflict("Payment already in progress or completed");

  const reference = `PV_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

  const payment = await prisma.payment.create({
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
    },
  });

  // Call Payaza initialize endpoint
  const payload = {
    service_type: "Account",
    service_payload: {
      request_application: "Payaza",
      application_module: "USER_MODULE",
      application_version: "1.0.0",
      request_class: "CheckoutRequest",
      connection_map: {
        amount: Number(milestone.amount),
        checkout_amount: Number(milestone.amount),
        currency_code: deal.currency,
        email_address: deal.brand.email,
        first_name: deal.brand.name.split(" ")[0],
        last_name: deal.brand.name.split(" ").slice(1).join(" ") || "Brand",
        phone_number: "0000000000",
        transaction_reference: reference,
        callback_url: `${config.CORS_ORIGIN}/payments/verify/${reference}`
      }
    }
  };

  try {
    const response = await fetch(`${config.PAYAZA_BASE_URL}/api/v1/applications/initialize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Payaza ${config.PAYAZA_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error("Payaza init failed");
    const data = (await response.json()) as { response_content: { checkout_url: string } };

    return {
      payment,
      checkoutUrl: data.response_content.checkout_url,
    };
  } catch (err) {
    throw ApiError.internal("Failed to initialize payment with Payaza");
  }
}

export async function verifyPayment(reference: string, userId: string) {
  const payment = await prisma.payment.findFirst({ where: { providerRef: reference } });
  if (!payment) throw ApiError.notFound("Payment not found");

  // Only the two parties on this payment may check its status — this
  // endpoint used to be callable by ANY authenticated user, and it used to
  // blindly mark the payment COMPLETED regardless of what Payaza actually
  // said. Both were serious bugs: anyone who knew/guessed a reference could
  // mark any payment as paid. This now (a) restricts who can call it and
  // (b) actually asks Payaza for the real transaction status instead of
  // assuming success. Final confirmation still happens via the signed
  // webhook in payments.webhook.ts — this endpoint is only a client-facing
  // "check where things stand" call, never the source of truth on its own.
  if (payment.payerId !== userId && payment.payeeId !== userId) {
    throw ApiError.forbidden("You are not a party to this payment");
  }

  if (payment.status === "COMPLETED") return payment;

  let providerStatus: "success" | "failed" | "pending";
  try {
    // NOTE: confirm this path/response shape against Payaza's actual API
    // docs for your integration mode — the exact verify endpoint wasn't
    // specified anywhere in the codebase. The point of this change is that
    // we ask the provider and branch on its answer, rather than assuming
    // success unconditionally.
    const response = await fetch(
      `${config.PAYAZA_BASE_URL}/api/v1/applications/transaction/verify/${reference}`,
      {
        method: "GET",
        headers: { Authorization: `Payaza ${config.PAYAZA_API_KEY}` },
      }
    );

    if (!response.ok) throw new Error("Payaza verify request failed");
    const data = await response.json();
    const status = data?.response_content?.status ?? data?.status;

    if (status === "success" || status === "successful" || status === "completed") {
      providerStatus = "success";
    } else if (status === "failed" || status === "declined") {
      providerStatus = "failed";
    } else {
      providerStatus = "pending";
    }
  } catch (err) {
    // If we can't reach Payaza, don't guess — report pending so the client
    // can retry, and let the webhook be the eventual source of truth.
    return { ...payment, status: payment.status };
  }

  if (providerStatus === "pending") {
    return payment;
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data:
      providerStatus === "success"
        ? { status: "COMPLETED", paidAt: new Date() }
        : { status: "FAILED" },
  });

  if (providerStatus === "success" && payment.milestoneId) {
    await prisma.milestone.update({
      where: { id: payment.milestoneId },
      data: { status: "PAID" },
    });
  }

  if (providerStatus === "success") {
    await createNotification({
      userId: payment.payeeId,
      type: "PAYMENT_COMPLETED",
      title: "Payment received",
      message: `A payment of ${payment.amount} ${payment.currency} has landed in your CreatorVault balance. You can request a payout from the Payments page.`,
      metadata: { dealId: payment.dealId, paymentId: payment.id },
    });
  }

  return updated;
}

export async function listPayments(userId: string, query: any) {
  const { page, limit, status, dealId } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.PaymentWhereInput = {
    OR: [{ payerId: userId }, { payeeId: userId }],
    ...(status && { status }),
    ...(dealId && { dealId }),
  };

  const [items, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        deal: { select: { title: true } },
        milestone: { select: { title: true } },
      },
    }),
    prisma.payment.count({ where }),
  ]);

  return { items, meta: getPaginationMeta(page, limit, total) };
}

export async function getPaymentStats(userId: string) {
  const isCreator = await prisma.user.findUnique({ where: { id: userId } }).then(u => u?.role === "CREATOR");

  if (isCreator) {
    const earned = await prisma.payment.aggregate({
      where: { payeeId: userId, status: "COMPLETED" },
      _sum: { amount: true },
    });
    const pending = await prisma.payment.aggregate({
      where: { payeeId: userId, status: "PENDING" },
      _sum: { amount: true },
    });
    return {
      earned: earned._sum.amount || 0,
      pending: pending._sum.amount || 0,
    };
  } else {
    const spent = await prisma.payment.aggregate({
      where: { payerId: userId, status: "COMPLETED" },
      _sum: { amount: true },
    });
    return { spent: spent._sum.amount || 0 };
  }
}

// --- Payouts ---------------------------------------------------------------
// A COMPLETED Payment only ever meant money landed in the platform's own
// Payaza account. These functions are what actually let a creator get that
// money into their own bank account.

export async function getPayoutBalance(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("User");
  if (user.role !== "CREATOR") {
    throw ApiError.forbidden("Only creators have a payout balance");
  }

  const [earned, paidOut, pendingPayouts] = await Promise.all([
    prisma.payment.aggregate({
      where: { payeeId: userId, status: "COMPLETED" },
      _sum: { amount: true },
    }),
    prisma.payout.aggregate({
      where: { userId, status: "COMPLETED" },
      _sum: { amount: true },
    }),
    prisma.payout.aggregate({
      where: { userId, status: { in: ["PENDING", "PROCESSING"] } },
      _sum: { amount: true },
    }),
  ]);

  const totalEarned = Number(earned._sum.amount || 0);
  const totalPaidOut = Number(paidOut._sum.amount || 0);
  const totalPending = Number(pendingPayouts._sum.amount || 0);

  // Available = everything ever paid out to us, minus what's already been
  // withdrawn or is currently mid-withdrawal (so you can't double-request).
  const available = Math.max(0, totalEarned - totalPaidOut - totalPending);

  return {
    totalEarned,
    totalPaidOut,
    pendingPayouts: totalPending,
    availableBalance: available,
    currency: "NGN",
  };
}

export async function requestPayout(userId: string, amount: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { creatorProfile: true },
  });

  if (!user || user.role !== "CREATOR") {
    throw ApiError.forbidden("Only creators can request a payout");
  }

  const profile = user.creatorProfile;
  if (!profile?.bankAccountNumber || !profile?.bankName || !profile?.bankAccountName) {
    throw ApiError.badRequest(
      "Add your bank details on your profile before requesting a payout"
    );
  }

  const balance = await getPayoutBalance(userId);
  if (amount <= 0) throw ApiError.badRequest("Amount must be positive");
  if (amount > balance.availableBalance) {
    throw ApiError.badRequest("Amount exceeds your available balance");
  }

  const payout = await prisma.payout.create({
    data: {
      userId,
      amount,
      currency: "NGN",
      status: "PENDING",
      bankAccountNumber: profile.bankAccountNumber,
      bankName: profile.bankName,
    },
  });

  await createNotification({
    userId,
    type: "PAYOUT_REQUESTED",
    title: "Payout requested",
    message: `Your payout request for ${amount} NGN has been received and is being processed.`,
    metadata: { payoutId: payout.id },
  });

  // Fire off the actual transfer. This is marked as best-effort/async —
  // Payaza's payout/transfer endpoint and exact payload weren't specified
  // anywhere in the codebase, so this shape should be confirmed against
  // real Payaza docs for your integration before going live. If the call
  // fails we leave the Payout PENDING rather than guessing at success, so
  // an admin/ops process can retry or mark it FAILED explicitly.
  try {
    const response = await fetch(`${config.PAYAZA_BASE_URL}/api/v1/applications/transaction/disburse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Payaza ${config.PAYAZA_API_KEY}`,
      },
      body: JSON.stringify({
        service_type: "Transfer",
        service_payload: {
          amount: Number(amount),
          currency_code: "NGN",
          bank_name: profile.bankName,
          account_number: profile.bankAccountNumber,
          account_name: profile.bankAccountName,
          transaction_reference: `PO_${payout.id}`,
        },
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as { response_content?: { transaction_reference?: string } };
      await prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: "PROCESSING",
          providerRef: data?.response_content?.transaction_reference ?? `PO_${payout.id}`,
        },
      });
    }
    // A non-ok response: leave PENDING — don't mark FAILED on a network
    // hiccup, since the transfer may still have gone through on Payaza's
    // side. This should be reconciled via a payout webhook/admin panel
    // once Payaza's exact payout webhook shape is confirmed.
  } catch (err) {
    // Network failure — leave PENDING, same reasoning as above.
  }

  return payout;
}

export async function listPayouts(userId: string) {
  return prisma.payout.findMany({
    where: { userId },
    orderBy: { requestedAt: "desc" },
  });
}
