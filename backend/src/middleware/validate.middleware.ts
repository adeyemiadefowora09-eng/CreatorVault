import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { ApiError } from "../utils/apiError.js";

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = formatZodErrors(result.error);
      return next(ApiError.badRequest("Validation failed", details));
    }

    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const details = formatZodErrors(result.error);
      return next(ApiError.badRequest("Invalid query parameters", details));
    }

    req.query = result.data;
    next();
  };
}

export function validateParams(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const details = formatZodErrors(result.error);
      return next(ApiError.badRequest("Invalid path parameters", details));
    }

    req.params = result.data;
    next();
  };
}

function formatZodErrors(error: ZodError) {
  return error.errors.map((e) => ({
    field: e.path.join("."),
    message: e.message,
  }));
}
