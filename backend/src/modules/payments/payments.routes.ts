import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validate, validateQuery } from "../../middleware/validate.middleware.js";
<<<<<<< HEAD
import * as v from "./payments.validation.js";
import * as c from "./payments.controller.js";
=======
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
>>>>>>> 9c15709e71866d0d287652bd5fa6ab5f84e07faf

// NOTE: the Payaza webhook is mounted separately in app.ts (raw body, no rate limit).
const router = Router();

<<<<<<< HEAD
const moneyLimiter = rateLimit({ windowMs: 15 * 60_000, max: 30, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many requests", error: { code: "RATE_LIMITED" } } });

router.get("/mode", authenticate, c.mode);
router.get("/", authenticate, validateQuery(v.listPaymentsQuerySchema), c.list);
router.get("/stats", authenticate, c.stats);

// Brand funding (escrow)
router.post("/initialize", authenticate, requireRole("BRAND"), moneyLimiter, validate(v.initializePaymentSchema), c.initialize);
router.post("/verify/:reference", authenticate, moneyLimiter, c.verify);
router.post("/sandbox/:reference/simulate", authenticate, requireRole("BRAND"), moneyLimiter, c.simulate);

// Creator payout account + withdrawals
router.get("/banks", authenticate, requireRole("CREATOR"), c.banks);
router.post("/bank/resolve", authenticate, requireRole("CREATOR"), moneyLimiter, validate(v.resolveBankSchema), c.resolveBank);
router.put("/bank", authenticate, requireRole("CREATOR"), moneyLimiter, validate(v.saveBankSchema), c.saveBank);
router.get("/payouts/balance", authenticate, requireRole("CREATOR"), c.payoutBalance);
router.get("/payouts", authenticate, requireRole("CREATOR"), c.listPayouts);
router.post("/payouts", authenticate, requireRole("CREATOR"), moneyLimiter, validate(v.requestPayoutSchema), c.requestPayout);

// Admin
router.get("/admin/integrity", authenticate, requireRole("ADMIN"), c.adminIntegrity);
router.get("/admin/review", authenticate, requireRole("ADMIN"), c.adminReview);
router.post("/admin/reconcile", authenticate, requireRole("ADMIN"), c.adminReconcile);
router.post("/admin/escrow/:milestoneId/resolve", authenticate, requireRole("ADMIN"), validate(v.adminResolveEscrowSchema), c.adminResolveEscrow);
router.post("/admin/brand-refunds/settle", authenticate, requireRole("ADMIN"), validate(v.adminSettleRefundSchema), c.adminSettleRefund);
=======
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
>>>>>>> 9c15709e71866d0d287652bd5fa6ab5f84e07faf

export default router;
