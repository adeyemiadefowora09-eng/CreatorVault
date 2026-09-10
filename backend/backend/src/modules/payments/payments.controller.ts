import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../../types/index.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import * as paymentsService from "./payments.service.js";

export async function initialize(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const { dealId, milestoneId } = req.body;
    const result = await paymentsService.initializePayment(user.id, dealId, milestoneId);
    sendSuccess(res, result, "Payment initialized");
  } catch (err) {
    next(err);
  }
}

export async function verify(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await paymentsService.verifyPayment(req.params.reference);
    sendSuccess(res, result, "Payment verified");
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await paymentsService.listPayments(user.id, req.query);
    sendSuccess(res, result.items, "Payments retrieved", 200, result.meta);
  } catch (err) {
    next(err);
  }
}

export async function stats(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await paymentsService.getPaymentStats(user.id);
    sendSuccess(res, result, "Stats retrieved");
  } catch (err) {
    next(err);
  }
}
