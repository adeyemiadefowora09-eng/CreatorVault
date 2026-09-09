import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { config } from "../../config/env.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { prisma } from "../../config/db.js";

// Payaza webhook handler
export async function handleWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const signature = req.headers["x-payaza-signature"] as string;
    
    // Compute expected signature (depends on Payaza's exact HMAC scheme, usually SHA512)
    const expected = crypto.createHmac("sha512", config.PAYAZA_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (signature !== expected) {
      return res.status(401).send("Invalid signature");
    }

    const event = req.body.event;
    const data = req.body.data;

    if (event === "charge.success") {
      const reference = data.transaction_reference;
      
      const payment = await prisma.payment.findFirst({ where: { providerRef: reference } });
      if (payment && payment.status !== "COMPLETED") {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: "COMPLETED", paidAt: new Date() }
        });

        if (payment.milestoneId) {
          await prisma.milestone.update({
            where: { id: payment.milestoneId },
            data: { status: "PAID" }
          });
        }
      }
    }

    res.status(200).send("OK");
  } catch (err) {
    next(err);
  }
}
