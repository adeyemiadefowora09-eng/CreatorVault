import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validate, validateQuery } from "../../middleware/validate.middleware.js";
import { initializePaymentSchema, listPaymentsQuerySchema } from "./payments.validation.js";
import * as paymentsController from "./payments.controller.js";
import { handleWebhook } from "./payments.webhook.js";

const router = Router();

router.post("/initialize", authenticate, requireRole("BRAND"), validate(initializePaymentSchema), paymentsController.initialize);
router.post("/verify/:reference", authenticate, paymentsController.verify);
router.get("/", authenticate, validateQuery(listPaymentsQuerySchema), paymentsController.list);
router.get("/stats", authenticate, paymentsController.stats);

// Webhook (no auth, uses signature verification)
router.post("/webhook/payaza", handleWebhook);

export default router;
