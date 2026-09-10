import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { createDisputeSchema } from "./disputes.validation.js";
import * as disputesController from "./disputes.controller.js";

const router = Router();
router.post("/", authenticate, validate(createDisputeSchema), disputesController.create);
router.get("/", authenticate, disputesController.list);

export default router;
