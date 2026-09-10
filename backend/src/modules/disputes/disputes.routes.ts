import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { createDisputeSchema, resolveDisputeSchema } from "./disputes.validation.js";
import * as disputesController from "./disputes.controller.js";

const router = Router();
router.post("/", authenticate, validate(createDisputeSchema), disputesController.create);
router.get("/", authenticate, disputesController.list);
// Resolution is a platform decision, not something either party to the deal
// can do for themselves — restricted to ADMIN.
router.patch(
  "/:id/resolve",
  authenticate,
  requireRole("ADMIN"),
  validate(resolveDisputeSchema),
  disputesController.resolve
);

export default router;
