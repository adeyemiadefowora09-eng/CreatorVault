import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validate, validateQuery } from "../../middleware/validate.middleware.js";
import {
  initializePaymentSchema,
  listPaymentsQuerySchema,
  requestPayoutSchema,
  bankEnquirySchema,
  saveBankSchema,
  refundEscrowSchema,
} from "./payments.validation.js";
import * as paymentsController from "./payments.controller.js";
import { handleWebhook } from "./payments.webhook.js";
import { config } from "../../config/env.js";
import { sendSuccess } from "../../utils/apiResponse.js";

const router = Router();

// Mode inquiry
router.get("/mode", authenticate, (req, res) => {
  sendSuccess(res, { mode: config.PAYMENTS_MODE }, "Payment mode retrieved");
});

// 1. Escrow Funding & Verification
router.post(
  "/initialize",
  authenticate,
  requireRole("BRAND"),
  validate(initializePaymentSchema),
  paymentsController.initialize
);
router.post("/verify/:reference", authenticate, paymentsController.verify);
router.get("/", authenticate, validateQuery(listPaymentsQuerySchema), paymentsController.list);
router.get("/stats", authenticate, paymentsController.stats);

// 2. Creator Payouts & Balances
router.get("/payouts/balance", authenticate, requireRole("CREATOR"), paymentsController.payoutBalance);
router.get("/payouts", authenticate, requireRole("CREATOR"), paymentsController.listPayouts);
router.post(
  "/payouts",
  authenticate,
  requireRole("CREATOR"),
  validate(requestPayoutSchema),
  paymentsController.requestPayout
);
router.post("/payouts/:id/sync", authenticate, paymentsController.syncPayout);

// 3. Bank Verification & Management
router.post("/bank/enquiry", authenticate, validate(bankEnquirySchema), paymentsController.resolveBank);
router.post(
  "/bank/save",
  authenticate,
  requireRole("CREATOR"),
  validate(saveBankSchema),
  paymentsController.saveBank
);

// 4. Refunds & Dispute Arbitrations
router.post("/refund", authenticate, validate(refundEscrowSchema), paymentsController.refund);

// 5. Payaza Webhooks (exempted from rate limiter, raw body HMAC verified)
router.post("/webhook/payaza", handleWebhook);

export default router;
