import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../../types/index.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import * as notificationsService from "./notifications.service.js";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await notificationsService.listNotifications(user.id);
    sendSuccess(res, result, "Notifications retrieved");
  } catch (err) { next(err); }
}

export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await notificationsService.markAsRead(req.params.id);
    sendSuccess(res, result, "Notification marked as read");
  } catch (err) { next(err); }
}
