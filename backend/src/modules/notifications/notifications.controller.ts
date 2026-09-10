import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../../types/index.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import * as notificationsService from "./notifications.service.js";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const [items, unread] = await Promise.all([
      notificationsService.listNotifications(user.id),
      notificationsService.unreadCount(user.id),
    ]);
    sendSuccess(res, { items, unreadCount: unread }, "Notifications retrieved");
  } catch (err) { next(err); }
}

export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await notificationsService.markAsRead(req.params.id, user.id);
    sendSuccess(res, result, "Notification marked as read");
  } catch (err) { next(err); }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    await notificationsService.markAllAsRead(user.id);
    sendSuccess(res, null, "All notifications marked as read");
  } catch (err) { next(err); }
}
