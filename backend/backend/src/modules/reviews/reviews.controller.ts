import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../../types/index.js";
import { sendSuccess, sendCreated } from "../../utils/apiResponse.js";
import * as reviewsService from "./reviews.service.js";

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await reviewsService.createReview(user.id, req.body);
    sendCreated(res, result, "Review created");
  } catch (err) { next(err); }
}

export async function getForDeal(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await reviewsService.getReviewsForDeal(req.params.dealId);
    sendSuccess(res, result, "Reviews retrieved");
  } catch (err) { next(err); }
}
