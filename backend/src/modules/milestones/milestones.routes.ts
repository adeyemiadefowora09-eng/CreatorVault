import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createMilestoneSchema,
  updateMilestoneSchema,
  rejectMilestoneSchema,
  submitMilestoneSchema,
} from "./milestones.validation.js";
import * as milestonesController from "./milestones.controller.js";

// Mounted at /api/v1/deals/:dealId/milestones
const router = Router({ mergeParams: true });

router.post("/", authenticate, requireRole("BRAND"), validate(createMilestoneSchema), milestonesController.add);
router.get("/", authenticate, milestonesController.list);
router.patch("/:milestoneId", authenticate, requireRole("BRAND"), validate(updateMilestoneSchema), milestonesController.update);
router.post("/:milestoneId/submit", authenticate, requireRole("CREATOR"), validate(submitMilestoneSchema), milestonesController.submit);
router.post("/:milestoneId/approve", authenticate, requireRole("BRAND"), milestonesController.approve);
router.post("/:milestoneId/reject", authenticate, requireRole("BRAND"), validate(rejectMilestoneSchema), milestonesController.reject);
router.delete("/:milestoneId", authenticate, requireRole("BRAND"), milestonesController.remove);

export default router;
