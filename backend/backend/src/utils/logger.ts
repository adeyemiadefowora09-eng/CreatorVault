import winston from "winston";
import { config } from "../config/env.js";

const format = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  config.NODE_ENV === "development"
    ? winston.format.combine(winston.format.colorize(), winston.format.simple())
    : winston.format.json()
);

export const logger = winston.createLogger({
  level: config.NODE_ENV === "development" ? "debug" : "info",
  format,
  transports: [new winston.transports.Console()],
});
