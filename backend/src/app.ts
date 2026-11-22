import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config/env.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { defaultLimiter } from "./middleware/rateLimiter.middleware.js";

// Routes
import authRoutes from "./modules/auth/auth.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import dealsRoutes from "./modules/deals/deals.routes.js";
import milestonesRoutes from "./modules/milestones/milestones.routes.js";
import messagesRoutes from "./modules/messages/messages.routes.js";
import contractsRoutes from "./modules/contracts/contracts.routes.js";
import dealGuardianRoutes from "./modules/deal-guardian/dealGuardian.routes.js";
import trustScoreRoutes from "./modules/trust-score/trustScore.routes.js";
import paymentsRoutes from "./modules/payments/payments.routes.js";
import { handleWebhook } from "./modules/payments/webhook.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
app.use(cookieParser());
// Payaza webhook: RAW body (signature is over the exact bytes), mounted BEFORE express.json()
// and BEFORE the global rate limiter so provider retries are never throttled.
app.post("/api/v1/payments/webhook/payaza", express.raw({ type: "*/*", limit: "1mb" }), handleWebhook);

app.use(express.json());
app.use(defaultLimiter);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

import reviewsRoutes from "./modules/reviews/reviews.routes.js";
import disputesRoutes from "./modules/disputes/disputes.routes.js";
import notificationsRoutes from "./modules/notifications/notifications.routes.js";

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", usersRoutes);
app.use("/api/v1/deals", dealsRoutes);
app.use("/api/v1/deals/:dealId/milestones", milestonesRoutes);
app.use("/api/v1/deals/:dealId/messages", messagesRoutes);
app.use("/api/v1/contracts", contractsRoutes);
app.use("/api/v1/deal-guardian", dealGuardianRoutes);
app.use("/api/v1/trust-score", trustScoreRoutes);
app.use("/api/v1/payments", paymentsRoutes);
app.use("/api/v1/reviews", reviewsRoutes);
app.use("/api/v1/disputes", disputesRoutes);
app.use("/api/v1/notifications", notificationsRoutes);

// Global Error Handler
app.use(errorHandler);

export default app;
