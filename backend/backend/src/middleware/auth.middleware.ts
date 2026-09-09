import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.js";
import { ApiError } from "../utils/apiError.js";

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next(ApiError.unauthorized("Missing or invalid authorization header"));
  }

  const token = header.split(" ")[1];

  try {
    const payload = verifyAccessToken(token);
    (req as any).user = payload;
    next();
  } catch {
    next(ApiError.unauthorized("Invalid or expired token"));
  }
}
