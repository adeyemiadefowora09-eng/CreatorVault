import { Request } from "express";

export interface AuthRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

export interface PaginationQuery {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function getPaginationMeta(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
