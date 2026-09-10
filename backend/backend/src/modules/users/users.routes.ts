import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requireRole } from "../../middleware/role.middleware.js";
import { validate, validateQuery } from "../../middleware/validate.middleware.js";
import {
  updateProfileSchema,
  updateCreatorProfileSchema,
  updateBrandProfileSchema,
  listUsersQuerySchema,
} from "./users.validation.js";
import * as usersController from "./users.controller.js";

const router = Router();

router.get("/", authenticate, validateQuery(listUsersQuerySchema), usersController.listUsers);
router.get("/:id", authenticate, usersController.getUser);
router.patch("/profile", authenticate, validate(updateProfileSchema), usersController.updateProfile);
router.patch(
  "/profile/creator",
  authenticate,
  requireRole("CREATOR"),
  validate(updateCreatorProfileSchema),
  usersController.updateCreatorProfile
);
router.patch(
  "/profile/brand",
  authenticate,
  requireRole("BRAND"),
  validate(updateBrandProfileSchema),
  usersController.updateBrandProfile
);
router.get("/:id/trust-score", authenticate, usersController.getTrustScore);
router.get("/:id/reviews", authenticate, usersController.getReviews);

export default router;
