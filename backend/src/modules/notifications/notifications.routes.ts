import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import * as notificationsController from "./notifications.controller.js";

const router = Router();
router.get("/", authenticate, notificationsController.list);
router.patch("/read-all", authenticate, notificationsController.markAllRead);
router.patch("/:id/read", authenticate, notificationsController.markRead);

export default router;
