/**
 * trustScore.routes.ts
 *
 * Exposes the canonical trust score to the frontend at GET /trust-score/me,
 * in the exact shape `frontend/src/hooks/useTrustScore.ts` +
 * `frontend/src/types/trust-score.ts` already expect:
 *   { currentScore, previousScore, tier, recentEvents }
 * — not the raw { score, history } shape ai-engine's own /:userId route
 * returns, so this route calls the service directly and reshapes the result
 * rather than re-mounting ai-engine's trust-score sub-router as-is.
 */

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { trustScoreService } from "./trustScore.instance.js";

const router = Router();

type Tier = "EXCELLENT" | "GOOD" | "FAIR" | "AT_RISK";

function tierFor(score: number): Tier {
  if (score >= 85) return "EXCELLENT";
  if (score >= 65) return "GOOD";
  if (score >= 40) return "FAIR";
  return "AT_RISK";
}

/** GET /trust-score/me — current user's score, tier, and recent history. */
router.get("/me", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id as string;
    const record = await trustScoreService.getOrCreateScore(userId);

    const recentEvents = [...record.history]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);

    const previousScore =
      recentEvents[0] !== undefined
        ? recentEvents[0].resultingScore - recentEvents[0].points
        : record.score;

    return sendSuccess(
      res,
      {
        currentScore: record.score,
        previousScore,
        tier: tierFor(record.score),
        recentEvents,
      },
      "Trust score retrieved"
    );
  } catch (err) {
    next(err);
  }
});

export default router;
