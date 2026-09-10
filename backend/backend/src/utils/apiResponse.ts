import { Response } from "express";

interface ApiResponseOptions<T> {
  res: Response;
  data?: T;
  message: string;
  statusCode?: number;
  meta?: Record<string, unknown>;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message: string,
  statusCode = 200,
  meta?: Record<string, unknown>
) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    ...(meta && { meta }),
  });
}

export function sendCreated<T>(res: Response, data: T, message: string) {
  return sendSuccess(res, data, message, 201);
}

export function sendNoContent(res: Response) {
  return res.status(204).send();
}
