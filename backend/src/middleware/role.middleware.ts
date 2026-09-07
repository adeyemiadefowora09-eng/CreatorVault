import { Request, Response, NextFunction } from "express";
import { UserRole } from "@prisma/client";
import { ApiError } from "../utils/apiError.js";

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user) {
      return next(ApiError.unauthorized());
    }

    if (!roles.includes(user.role)) {
      return next(ApiError.forbidden("You do not have permission for this action"));
    }

    next();
  };
}
