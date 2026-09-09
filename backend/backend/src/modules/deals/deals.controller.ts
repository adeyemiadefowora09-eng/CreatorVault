import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../../types/index.js";
import { sendSuccess, sendCreated, sendNoContent } from "../../utils/apiResponse.js";
import * as dealsService from "./deals.service.js";

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await dealsService.createDeal(user.id, req.body);
    sendCreated(res, result, "Deal created");
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await dealsService.listDeals(user.id, req.query as any);
    sendSuccess(res, result.items, "Deals retrieved", 200, result.meta);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await dealsService.getDealById(req.params.id, user.id);
    sendSuccess(res, result, "Deal retrieved");
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await dealsService.updateDeal(req.params.id, user.id, req.body);
    sendSuccess(res, result, "Deal updated");
  } catch (err) {
    next(err);
  }
}

export async function propose(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await dealsService.proposeDeal(req.params.id, user.id);
    sendSuccess(res, result, "Deal proposed");
  } catch (err) {
    next(err);
  }
}

export async function accept(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await dealsService.acceptDeal(req.params.id, user.id);
    sendSuccess(res, result, "Deal accepted");
  } catch (err) {
    next(err);
  }
}

export async function decline(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await dealsService.declineDeal(req.params.id, user.id);
    sendSuccess(res, result, "Deal declined");
  } catch (err) {
    next(err);
  }
}

export async function complete(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await dealsService.completeDeal(req.params.id, user.id);
    sendSuccess(res, result, "Deal completed");
  } catch (err) {
    next(err);
  }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await dealsService.cancelDeal(req.params.id, user.id);
    sendSuccess(res, result, "Deal cancelled");
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    await dealsService.deleteDeal(req.params.id, user.id);
    sendNoContent(res);
  } catch (err) {
    next(err);
  }
}
