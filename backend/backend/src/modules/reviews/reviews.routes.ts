import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { createReviewSchema } from "./reviews.validation.js";
import * as reviewsController from "./reviews.controller.js";

const router = Router();
router.post("/", authenticate, validate(createReviewSchema), reviewsController.create);
router.get("/deal/:dealId", authenticate, reviewsController.getForDeal);

export default router;
