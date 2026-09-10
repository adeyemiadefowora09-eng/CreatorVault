/**
 * trustScore.controller.ts
 * Express routes exposing the Trust Score Engine to the backend's `ai` bridge module.
 *
 * These routes are mounted by `ai-engine/src/index.ts` and re-exported through
 * `backend/src/modules/ai`, so they inherit whatever auth middleware the
 * backend applies upstream. No auth is implemented here directly.
 */

import { Router, Request, Response, NextFunction } from "express";
import { TrustScoreService } from "./trustScore.service";
import { TrustScoreRepository, TrustEventType } from "./trustScore.types";

const VALID_EVENT_TYPES: TrustEventType[] = [
  "DEAL_COMPLETED_NO_DISPUTE",
  "HIGH_REVIEW",
  "TIMELY_MILESTONE_DELIVERY",
  "DISPUTE_OPENED_OR_LOST",
  "AI_GUARDIAN_CRITICAL_FLAG",
];

export function createTrustScoreRouter(repository: TrustScoreRepository): Router {
  const router = Router();
  const service = new TrustScoreService(repository);

  /** GET /trust-score/:userId — current score + history */
  router.get("/:userId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const record = await service.getOrCreateScore(userId);
      return res.status(200).json({ success: true, data: record });
    } catch (err) {
      next(err);
      return;
    }
  });

  /** POST /trust-score/:userId/events — apply a trust event (deal/review/dispute/guardian) */
  router.post("/:userId/events", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const { type, sourceId, metadata } = req.body ?? {};

      if (!type || !VALID_EVENT_TYPES.includes(type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid or missing event type. Expected one of: ${VALID_EVENT_TYPES.join(", ")}`,
        });
      }
      if (!sourceId) {
        return res.status(400).json({ success: false, error: "sourceId is required" });
      }

      const result = await service.applyEvent({ type, userId, sourceId, metadata });
      return res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
      return;
    }
  });

  /** POST /trust-score/:userId/review — convenience endpoint applying the >4.5-star rule */
  router.post("/:userId/review", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const { sourceId, rating } = req.body ?? {};

      if (!sourceId || typeof rating !== "number") {
        return res.status(400).json({
          success: false,
          error: "sourceId and numeric rating are required",
        });
      }

      const result = await service.applyReview(userId, sourceId, rating);
      return res.status(200).json({
        success: true,
        data: result,
        applied: result !== null,
      });
    } catch (err) {
      next(err);
      return;
    }
  });

  return router;
}
