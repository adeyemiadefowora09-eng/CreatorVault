/**
 * Payaza webhook receiver.
 *  - Mounted with express.raw() BEFORE express.json(): the signature is computed over the exact bytes Payaza sent.
 *  - Exempt from the global rate limiter (Payaza retries come from a small set of IPs).
 *  - x-payaza-signature = HMAC-SHA512(rawBody, SECRET key). Payaza's docs show base64 output; some samples
 *    show hex, so both encodings are accepted — compared in constant time.
 *  - Every event is stored once (unique eventKey) => replays are acknowledged but never re-applied.
 *  - Money state only changes after confirmFunding()/applyTransferStatus(), which re-verify with the provider.
 */
import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { config, paymentsEnabled } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { audit } from "./audit.js";
import { confirmFunding } from "./escrow.service.js";
import { fromProvider } from "./money.js";
import { applyTransferStatus } from "./payouts.service.js";
import * as payaza from "./payaza.client.js";

export function signaturesMatch(rawBody: Buffer, header: string | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  const mac = crypto.createHmac("sha512", secret).update(rawBody);
  const digest = mac.digest();
  const candidates = [digest.toString("base64"), digest.toString("hex")];
  const given = Buffer.from(header.trim());
  return candidates.some((c) => {
    const exp = Buffer.from(c);
    return exp.length === given.length && crypto.timingSafeEqual(exp, given);
  });
}

export function classify(body: any): "payout" | "collection" | "unknown" {
  if (body && typeof body === "object") {
    if (body.sent_to || body.transaction_type === "DEBIT" || /^NIP_/.test(String(body.transaction_status ?? ""))) return "payout";
    if (body.merchant_reference !== undefined || body.channel || body.received_from || body.virtual_account_number !== undefined || body.amount_validation) return "collection";
  }
  return "unknown";
}

export async function handleWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    if (!paymentsEnabled() || !config.PAYAZA_SECRET_KEY) return res.status(503).send("Payments disabled");

    const raw = req.body as Buffer;
    if (!Buffer.isBuffer(raw) || raw.length === 0) return res.status(400).send("Empty body");

    if (!signaturesMatch(raw, req.headers["x-payaza-signature"] as string | undefined, config.PAYAZA_SECRET_KEY)) {
      logger.warn("payaza webhook rejected: bad signature");
      return res.status(401).send("Invalid signature");
    }

    let body: any;
    try { body = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).send("Invalid JSON"); }

    const kind = classify(body);
    const reference: string | null = String(body.merchant_reference || body.transaction_reference || "") || null;
    const statusPart = String(body.transaction_status ?? "") + "|" + String(body.status ?? "");
    const eventKey = `${kind}:${body.transaction_reference ?? ""}:${statusPart}:${body.session_id ?? ""}`;

    let eventId: string;
    try {
      const ev = await prisma.providerEvent.create({ data: { eventKey, kind, reference, payload: body as Prisma.InputJsonValue } });
      eventId = ev.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const prior = await prisma.providerEvent.findUnique({ where: { eventKey } });
        if (prior && prior.status !== "FAILED" && prior.status !== "RECEIVED") return res.status(200).send("Duplicate");
        eventId = prior!.id; // previous attempt failed mid-way: process again
      } else throw e;
    }

    try {
      let outcome = "IGNORED";
      if (kind === "collection") {
        const payment = await prisma.payment.findFirst({ where: { providerRef: { in: [String(body.merchant_reference ?? ""), String(body.transaction_reference ?? "")].filter(Boolean) } } });
        if (payment) {
          const r = await confirmFunding(payment.id, { status: body.status ?? body.transaction_status ?? null, amount: fromProvider(body.amount_received), currency: body.currency_code ?? null }, "webhook");
          outcome = `PROCESSED:${r.status}`;
        }
      } else if (kind === "payout") {
        const payout = await prisma.payout.findUnique({ where: { providerRef: String(body.transaction_reference ?? "") } });
        if (payout) {
          // verify with the provider where possible; fall back to the signed webhook content
          let status = String(body.transaction_status);
          try { const s = await payaza.queryTransferStatus(payout.providerRef!); if (s.found) status = s.status; } catch { /* use webhook status */ }
          await applyTransferStatus(payout.id, status, body.response_message ?? null);
          outcome = `PROCESSED:${status}`;
        }
      }
      await prisma.providerEvent.update({ where: { id: eventId }, data: { status: outcome.startsWith("PROCESSED") ? "PROCESSED" : "IGNORED", processedAt: new Date(), error: null } });
      return res.status(200).send("OK");
    } catch (err) {
      await prisma.providerEvent.update({ where: { id: eventId }, data: { status: "FAILED", error: (err as Error).message.slice(0, 300) } });
      await audit("WEBHOOK_PROCESSING_FAILED", "provider_event", eventId, { kind, error: (err as Error).message.slice(0, 200) });
      logger.error(`webhook processing failed: ${(err as Error).message}`);
      return res.status(500).send("Processing failed"); // Payaza will retry
    }
  } catch (err) {
    next(err);
  }
}
