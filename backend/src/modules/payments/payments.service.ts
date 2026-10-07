import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { config } from "../../config/env.js";
import { ApiError } from "../../utils/apiError.js";
import { getPaginationMeta } from "../../types/index.js";
import { createNotification } from "../notifications/notifications.service.js";

// This project doesn't ship with a live Payaza merchant account (real key +
// secret), so any call that hits Payaza's actual endpoints will fail with
// no real payment gateway wired up. Rather than leave the whole payment
// flow dead until someone has live production credentials, we fall back to
// a "demo escrow" mode: money doesn't move through a real bank, but every
// other part of the flow — a payment moving to PROCESSING, the brand
// confirming it, the milestone flipping to PAID, the creator's balance
// updating, and a payout landing as COMPLETED — behaves exactly like the
// real thing so the app is actually usable end to end. The moment real
// PAYAZA_API_KEY/PAYAZA_SECRET_KEY values are set in .env, this
// automatically switches to the real Payaza calls below.
export function isLivePaymentsMode() {
  return Boolean(config.PAYAZA_API_KEY && config.PAYAZA_SECRET_KEY);
}

export async function getPaymentMode() {
  return { live: isLivePaymentsMode() };
}

// Payaza's real, documented URL pattern is
// https://api.payaza.africa/{tenant}/<product>/<endpoint> where {tenant}
// is "test" or "live" — NOT a different key per environment. The checkout
// payload below (service_type/service_payload/connection_map) and the
// payout payload further down were written without access to Payaza's
// authenticated API reference and are UNVERIFIED — they're a best-effort
// placeholder, not something confirmed against Payaza's actual contract.
// Before flipping PAYAZA_ENV to "live", test each call with `test`
// credentials and Payaza's test tenant first, and correct the payload
// shape/field names against whatever your dashboard's API reference (or
// Postman collection from integrationsupport@payaza.africa) actually shows.
function payazaUrl(path: string) {
  return `${config.PAYAZA_BASE_URL}/${config.PAYAZA_ENV}/${path}`;
}

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

  if (!isLivePaymentsMode()) {
    // Demo escrow: there's no real gateway to redirect the brand to, so
    // the frontend shows an in-app "confirm payment" step in place of a
    // Payaza checkout page. The payment stays PENDING (nothing has
    // "reflected" yet) until the brand explicitly confirms it via
    // confirmMockPayment — see that function for what happens then.
    return { payment, checkoutUrl: null, mock: true, reference };
  }

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

  // UNVERIFIED endpoint path — "card/card_charge" is Payaza's confirmed
  // product namespace for card transactions, but the exact sub-path for
  // *initiating* a hosted checkout (vs. the confirmed
  // card/card_charge/transaction_status lookup) isn't something public
  // docs show. Confirm this path against your dashboard before relying on
  // it — see the comment on payazaUrl() above.
  try {
    const response = await fetch(payazaUrl("card/card_charge/initialize"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.PAYAZA_SECRET_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Payaza init failed (${response.status}): ${body}`);
    }
    const data = (await response.json()) as { response_content: { checkout_url: string } };

    return {
      payment,
      checkoutUrl: data.response_content.checkout_url,
    };
  } catch (err) {
    // Logged so you can see the actual status/body Payaza sent back, since
    // that's exactly what you need to correct the payload/path above.
    console.error("Payaza checkout initialize failed:", err);
    throw ApiError.internal(
      "Failed to initialize payment with Payaza — check the server logs for the exact error, " +
        "then compare the request shape in payments.service.ts against your Payaza dashboard's API reference."
    );
  }
}

/**
 * Shared "this payment actually succeeded" side effects: mark it
 * COMPLETED, flip the milestone to PAID, notify the creator that money has
 * landed in their CreatorVault balance. Used by the real verifyPayment
 * success path, the real Payaza webhook, and the demo confirmMockPayment
 * path below — the three ways a payment can be confirmed as paid.
 */
export async function markPaymentCompletedForWebhook(payment: {
  id: string;
  milestoneId: string | null;
  payeeId: string;
  amount: Prisma.Decimal | number;
  currency: string;
  dealId: string;
}) {
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "COMPLETED", paidAt: new Date() },
  });

  if (payment.milestoneId) {
    await prisma.milestone.update({
      where: { id: payment.milestoneId },
      data: { status: "PAID" },
    });
  }

  await createNotification({
    userId: payment.payeeId,
    type: "PAYMENT_COMPLETED",
    title: "Payment received",
    message: `A payment of ${payment.amount} ${payment.currency} has landed in your CreatorVault balance. You can request a payout from the Payments page.`,
    metadata: { dealId: payment.dealId, paymentId: payment.id },
  });

  return updated;
}

/**
 * Demo-mode equivalent of a Payaza webhook firing "charge.success" — used
 * only when isLivePaymentsMode() is false. Only the brand who owns the
 * payment can confirm it (mirrors "only the cardholder can complete their
 * own checkout"), and it's a no-op if this payment somehow reached a real
 * Payaza flow instead.
 */
export async function confirmMockPayment(reference: string, userId: string) {
  if (isLivePaymentsMode()) {
    throw ApiError.badRequest("Live payments are configured — use the real Payaza checkout instead");
  }

  const payment = await prisma.payment.findFirst({ where: { providerRef: reference } });
  if (!payment) throw ApiError.notFound("Payment");
  if (payment.payerId !== userId) {
    throw ApiError.forbidden("Only the brand who initiated this payment can confirm it");
  }
  if (payment.status === "COMPLETED") return payment;
  if (payment.status !== "PENDING") {
    throw ApiError.badRequest(`Payment is ${payment.status.toLowerCase()} and can't be confirmed`);
  }

  return markPaymentCompletedForWebhook(payment);
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
    // UNVERIFIED path (see payazaUrl() comment above) — confirmed real is
    // card/card_charge/transaction_status for a status lookup, but whether
    // that's the same thing as "verify by reference" here isn't something
    // public docs confirm. Check your dashboard before relying on this.
    const response = await fetch(
      payazaUrl(`card/card_charge/transaction_status?reference=${reference}`),
      {
        method: "GET",
        headers: { Authorization: `Bearer ${config.PAYAZA_SECRET_KEY}` },
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

  if (providerStatus === "success") {
    return markPaymentCompletedForWebhook(payment);
  }

  return prisma.payment.update({
    where: { id: payment.id },
    data: { status: "FAILED" },
  });
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

  if (!isLivePaymentsMode()) {
    // Demo mode: there's no real Payaza payout/transfer API to call, so we
    // simulate an instant, successful bank transfer instead of leaving the
    // payout stuck PENDING forever (which would make "get the money out"
    // look broken even though the rest of the flow is fine). This is a
    // simulation, not a real transfer — it's clearly labeled as such in
    // the UI (see the Payments page "demo mode" banner).
    const settled = await prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: "COMPLETED",
        providerRef: `DEMO_${payout.id}`,
        completedAt: new Date(),
      },
    });

    await createNotification({
      userId,
      type: "PAYOUT_COMPLETED",
      title: "Payout completed (demo)",
      message: `${amount} NGN was "sent" to ${profile.bankName} ••••${profile.bankAccountNumber.slice(-4)}. No real bank transfer occurred — this app isn't connected to a live payment provider yet.`,
      metadata: { payoutId: payout.id },
    });

    return settled;
  }

  // payout-receptor/payout is Payaza's CONFIRMED real payout endpoint path
  // (from Payaza's own published SDK), unlike the checkout path above — so
  // the URL here is trustworthy. The request body field names below are
  // still a best-effort guess, though: confirm bank_name/account_number/
  // account_name/amount/currency_code (and whether a bank *code* is
  // required alongside the name) against your dashboard before going live.
  // If the call fails we leave the Payout PENDING rather than guessing at
  // success, so an admin/ops process can retry or mark it FAILED explicitly.
  try {
    const response = await fetch(payazaUrl("payout-receptor/payout"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.PAYAZA_SECRET_KEY}`,
      },
      body: JSON.stringify({
        amount: Number(amount),
        currency_code: "NGN",
        bank_name: profile.bankName,
        account_number: profile.bankAccountNumber,
        account_name: profile.bankAccountName,
        transaction_reference: `PO_${payout.id}`,
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
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(`Payaza payout failed (${response.status}):`, body);
    }
    // A non-ok response: leave PENDING — don't mark FAILED on a network
    // hiccup, since the transfer may still have gone through on Payaza's
    // side. This should be reconciled via a payout webhook/admin panel
    // once Payaza's exact payout webhook shape is confirmed.
  } catch (err) {
    console.error("Payaza payout request failed:", err);
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
