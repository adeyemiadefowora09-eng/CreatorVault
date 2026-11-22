import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validate, validateQuery } from "../../middleware/validate.middleware.js";
import * as v from "./payments.validation.js";
import * as c from "./payments.controller.js";

// NOTE: the Payaza webhook is mounted separately in app.ts (raw body, no rate limit).
const router = Router();

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

export default router;
