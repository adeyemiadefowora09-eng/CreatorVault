import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { config } from "../../config/env.js";
import { prisma } from "../../config/db.js";
import { verifyPayment } from "./payments.service.js";
import { ledgerService } from "./ledger.service.js";
import { createNotification } from "../notifications/notifications.service.js";

export async function handleWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    // 1. Fail-closed safeguard: If secret key is not set, reject immediately
    if (!config.PAYAZA_SECRET_KEY || config.PAYAZA_SECRET_KEY.trim() === "") {
      console.error("Webhook rejected: PAYAZA_SECRET_KEY is not configured.");
      return res.status(500).json({ error: "Webhook verification unavailable" });
    }

    const signature = req.headers["x-payaza-signature"] as string;
    if (!signature) {
      return res.status(401).json({ error: "Missing x-payaza-signature header" });
    }

    // 2. Cryptographic signature check on raw body buffer (immune to JSON serialization variance)
    const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
    const hmac = crypto.createHmac("sha512", config.PAYAZA_SECRET_KEY);
    hmac.update(rawBody);
    const expectedHex = hmac.digest("hex");
    const expectedBase64 = hmac.digest("base64");

    // Timing-safe comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature);
    const hexBuffer = Buffer.from(expectedHex);
    const b64Buffer = Buffer.from(expectedBase64);

    const matchesHex = sigBuffer.length === hexBuffer.length && crypto.timingSafeEqual(sigBuffer, hexBuffer);
    const matchesB64 = sigBuffer.length === b64Buffer.length && crypto.timingSafeEqual(sigBuffer, b64Buffer);

    if (!matchesHex && !matchesB64) {
      console.warn("Invalid webhook signature received from IP:", req.ip);
      return res.status(401).json({ error: "Invalid signature" });
    }

    const payload = req.body;
    const event = String(payload.event || payload.transaction_status || "").toLowerCase();
    const data = payload.data || payload;
    const reference = data.transaction_reference || data.reference;

    if (!reference) {
      return res.status(400).json({ error: "Missing transaction reference in webhook" });
    }

    // 3. Idempotency Check: Prevent duplicate webhook processing
    const eventId = payload.event_id || `${event}_${reference}`;
    const alreadyProcessed = await prisma.webhookEvent.findUnique({
      where: { eventId },
    });

    if (alreadyProcessed) {
      return res.status(200).json({ status: "already_processed" });
    }

    // Save webhook event to history
    await prisma.webhookEvent.create({
      data: {
        eventId,
        eventType: String(event || "unknown"),
        payload,
      },
    });

    // 4. Handle Payout / Transfer Webhooks (Payout Failure & Success)
    if (
      event.includes("payout.failed") ||
      event.includes("transfer.failed") ||
      event === "failed" ||
      event === "rejected"
    ) {
      const payout = await prisma.payout.findFirst({
        where: { providerRef: reference },
      });

      if (payout && payout.status !== "FAILED") {
        await prisma.$transaction(async (tx) => {
          await tx.payout.update({
            where: { id: payout.id },
            data: {
              status: "FAILED",
              failureReason: data.message || data.reason || "Provider reported transfer failure",
            },
          });

          // Post ledger reversal so user balance is restored
          await ledgerService.recordPayoutFailureReversal(tx, {
            reference: payout.providerRef || payout.id,
            amount: payout.amount,
            creatorId: payout.userId,
            currency: payout.currency,
            reason: data.message || "Provider transfer failed",
          });

          await createNotification({
            userId: payout.userId,
            type: "PAYOUT_FAILED",
            title: "Withdrawal Failed",
            message: `Your withdrawal of ${payout.amount} ${payout.currency} failed and has been refunded to your CreatorVault balance.`,
            metadata: { payoutId: payout.id },
          });
        });
        return res.status(200).send("OK");
      }
    }

    if (
      event.includes("payout.success") ||
      event.includes("transfer.success")
    ) {
      const payout = await prisma.payout.findFirst({
        where: { providerRef: reference },
      });

      if (payout && payout.status !== "COMPLETED") {
        await prisma.payout.update({
          where: { id: payout.id },
          data: { status: "COMPLETED", completedAt: new Date() },
        });

        await createNotification({
          userId: payout.userId,
          type: "PAYMENT_COMPLETED",
          title: "Withdrawal Completed 💰",
          message: `Your withdrawal of ${payout.amount} ${payout.currency} was successfully processed to your bank account.`,
          metadata: { payoutId: payout.id },
        });

        return res.status(200).send("OK");
      }
    }

    // 5. Handle Successful Collection / Escrow Funding
    if (
      event === "charge.success" ||
      event === "completed" ||
      event === "successful"
    ) {
      const payment = await prisma.payment.findFirst({
        where: { providerRef: reference },
      });

      if (!payment) {
        console.warn(`Webhook: Payment with ref ${reference} not found in database.`);
        return res.status(200).send("OK");
      }

      // Amount verification: Validate provider reported amount against our database record
      const reportedAmount = Number(data.amount || data.checkout_amount || 0);
      if (reportedAmount > 0 && Math.abs(reportedAmount - Number(payment.amount)) > 0.01) {
        console.error(
          `SECURITY ALERT: Payment amount mismatch! Owed: ${payment.amount}, Reported: ${reportedAmount}`
        );
        return res.status(400).json({ error: "Amount mismatch detected" });
      }

      // Currency verification: Validate reported currency
      if (data.currency && data.currency.toUpperCase() !== payment.currency.toUpperCase()) {
        console.error(
          `SECURITY ALERT: Payment currency mismatch! Expected: ${payment.currency}, Reported: ${data.currency}`
        );
        return res.status(400).json({ error: "Currency mismatch detected" });
      }

      // Execute verified escrow settlement via atomic service
      await verifyPayment(reference);
    }

    return res.status(200).send("OK");
  } catch (err: any) {
    console.error("Webhook processing error:", err.message);
    next(err);
  }
}
