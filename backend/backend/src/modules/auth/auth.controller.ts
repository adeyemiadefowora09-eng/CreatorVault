import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../../types/index.js";
import { sendSuccess, sendCreated } from "../../utils/apiResponse.js";
import * as authService from "./auth.service.js";

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(req.body);
    sendCreated(res, result, "Account created successfully");
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.login(req.body);
    sendSuccess(res, result, "Login successful");
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.refresh(req.body.refreshToken);
    sendSuccess(res, result, "Token refreshed");
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    await authService.logout(user.id, req.body.refreshToken);
    sendSuccess(res, null, "Logged out");
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as AuthRequest).user;
    const result = await authService.getMe(user.id);
    sendSuccess(res, result, "User retrieved");
  } catch (err) {
    next(err);
  }
}
