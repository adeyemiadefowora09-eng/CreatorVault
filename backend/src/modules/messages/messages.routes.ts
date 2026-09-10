import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { validate, validateQuery } from "../../middleware/validate.middleware.js";
import { sendMessageSchema, listMessagesQuerySchema } from "./messages.validation.js";
import * as messagesController from "./messages.controller.js";

// Mounted at /api/v1/deals/:dealId/messages
const router = Router({ mergeParams: true });

router.get("/", authenticate, validateQuery(listMessagesQuerySchema), messagesController.list);
router.post("/", authenticate, validate(sendMessageSchema), messagesController.send);

export default router;
