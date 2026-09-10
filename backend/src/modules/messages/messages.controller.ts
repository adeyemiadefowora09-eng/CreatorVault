import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../../types/index.js";
import { sendSuccess, sendCreated } from "../../utils/apiResponse.js";
import * as messagesService from "./messages.service.js";

export async function send(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await messagesService.sendMessage(req.params.dealId, user.id, req.body);
    sendCreated(res, result, "Message sent");
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await messagesService.listMessages(req.params.dealId, user.id, req.query as any);
    sendSuccess(res, result.items, "Messages retrieved", 200, result.meta);
  } catch (err) {
    next(err);
  }
}
