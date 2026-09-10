import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../../types/index.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import * as usersService from "./users.service.js";

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await usersService.listUsers(req.query as any);
    sendSuccess(res, result.items, "Users retrieved", 200, result.meta);
  } catch (err) {
    next(err);
  }
}

export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await usersService.getUserById(req.params.id);
    sendSuccess(res, result, "User retrieved");
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await usersService.updateProfile(user.id, req.body);
    sendSuccess(res, result, "Profile updated");
  } catch (err) {
    next(err);
  }
}

export async function updateCreatorProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await usersService.updateCreatorProfile(user.id, req.body);
    sendSuccess(res, result, "Creator profile updated");
  } catch (err) {
    next(err);
  }
}

export async function updateBrandProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await usersService.updateBrandProfile(user.id, req.body);
    sendSuccess(res, result, "Brand profile updated");
  } catch (err) {
    next(err);
  }
}

export async function getTrustScore(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await usersService.getUserTrustScore(req.params.id);
    sendSuccess(res, result, "Trust score retrieved");
  } catch (err) {
    next(err);
  }
}

export async function getReviews(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await usersService.getUserReviews(req.params.id, page, limit);
    sendSuccess(res, result.items, "Reviews retrieved", 200, result.meta);
  } catch (err) {
    next(err);
  }
}
