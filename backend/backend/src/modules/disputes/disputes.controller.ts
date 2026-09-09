import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../../types/index.js";
import { sendSuccess, sendCreated } from "../../utils/apiResponse.js";
import * as disputesService from "./disputes.service.js";

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await disputesService.createDispute(user.id, req.body);
    sendCreated(res, result, "Dispute created");
  } catch (err) { next(err); }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await disputesService.listDisputes(user.id);
    sendSuccess(res, result, "Disputes retrieved");
  } catch (err) { next(err); }
}
