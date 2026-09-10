import jwt, { SignOptions } from "jsonwebtoken";
import { config } from "../config/env.js";

export interface JwtPayload {
  id: string;
  email: string;
  role: string;
}

export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    // config.JWT_EXPIRY is a plain `string` from env parsing (e.g. "7d"),
    // but @types/jsonwebtoken's `expiresIn` wants a narrower template-literal
    // type. The value itself is fine at runtime — this cast just satisfies
    // the stricter typing without changing behavior.
    expiresIn: config.JWT_EXPIRY as SignOptions["expiresIn"],
  });
}

export function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRY as SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, config.JWT_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, config.JWT_REFRESH_SECRET) as JwtPayload;
}
