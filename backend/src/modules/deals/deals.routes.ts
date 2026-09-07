import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validate, validateQuery } from "../../middleware/validate.middleware.js";
import { createDealSchema, updateDealSchema, listDealsQuerySchema } from "./deals.validation.js";
import * as dealsController from "./deals.controller.js";

const router = Router();

router.post("/", authenticate, requireRole("BRAND"), validate(createDealSchema), dealsController.create);
router.get("/", authenticate, validateQuery(listDealsQuerySchema), dealsController.list);
router.get("/:id", authenticate, dealsController.getById);
router.patch("/:id", authenticate, requireRole("BRAND"), validate(updateDealSchema), dealsController.update);
router.post("/:id/propose", authenticate, requireRole("BRAND"), dealsController.propose);
router.post("/:id/accept", authenticate, requireRole("CREATOR"), dealsController.accept);
router.post("/:id/decline", authenticate, requireRole("CREATOR"), dealsController.decline);
router.post("/:id/complete", authenticate, requireRole("BRAND"), dealsController.complete);
router.post("/:id/cancel", authenticate, dealsController.cancel);
router.delete("/:id", authenticate, requireRole("BRAND"), dealsController.remove);

export default router;
