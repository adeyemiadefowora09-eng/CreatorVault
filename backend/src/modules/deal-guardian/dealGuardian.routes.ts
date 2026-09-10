/**
 * dealGuardian.routes.ts
 *
 * Bridges the frontend's standalone "check a contract before you sign it"
 * flow (multipart upload, no dealId — see useAnalyzeContract in
 * frontend/src/hooks/useDealGuardian.ts) to ai-engine's DealGuardianService.
 *
 * Deliberately does NOT go through ai-engine's own createDealGuardianRouter
 * (mounted at /deal-guardian by createAiEngineRouter): that sub-router's
 * POST /analyze requires a real contractId + dealId, which doesn't exist yet
 * for this ad hoc check. Instead this calls DealGuardianService directly and
 * owns persistence itself via the new DealGuardianReport table, per the
 * handoff doc's recommendation to keep ai-engine free of a Prisma dependency.
 *
 * Deliberate product call (flagged, not yet confirmed with the team): a
 * CRITICAL result from THIS standalone endpoint does not dock trust score.
 * There's no real deal attached, and penalizing someone for checking a
 * risky contract before signing is a bad incentive — it would teach people
 * to skip the check. The AI_GUARDIAN_CRITICAL_FLAG rule stays reserved for
 * a real analysis tied to an actual Deal/Contract (see contracts module).
 */

import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { DealGuardianService } from "@creatorvault/ai-engine";
import { authenticate } from "../../middleware/auth.middleware.js";
import { sendSuccess, sendCreated } from "../../utils/apiResponse.js";
import { ApiError } from "../../utils/apiError.js";
import { prisma } from "../../config/db.js";
import { extractContractText } from "./extractText.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

const dealGuardianService = new DealGuardianService();

function toFrontendShape(report: {
  id: string;
  dealTitle: string;
  analyzedAt: Date;
  riskLevel: string;
  safetyScore: number;
  summary: string;
  flaggedClauses: unknown;
  recommendations: unknown;
}) {
  const flaggedClauses = Array.isArray(report.flaggedClauses) ? report.flaggedClauses : [];
  return {
    id: report.id,
    contractName: report.dealTitle,
    analyzedAt: report.analyzedAt.toISOString(),
    riskLevel: report.riskLevel,
    safetyScore: report.safetyScore,
    summary: report.summary,
    flaggedClauses: flaggedClauses.map((c: any, i: number) => ({
      id: `${report.id}-clause-${i}`,
      clauseTitle: typeof c.clause === "string" ? c.clause.slice(0, 60) : "Flagged clause",
      excerpt: c.clause,
      riskLevel: c.severity,
      explanation: c.explanation,
    })),
    recommendations: Array.isArray(report.recommendations) ? report.recommendations : [],
  };
}

/** GET /deal-guardian/reports — the signed-in user's analysis history. */
router.get("/reports", authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user.id as string;
    const reports = await prisma.dealGuardianReport.findMany({
      where: { userId },
      orderBy: { analyzedAt: "desc" },
    });
    return sendSuccess(res, reports.map(toFrontendShape), "Deal Guardian reports retrieved");
  } catch (err) {
    next(err);
  }
});

/** GET /deal-guardian/reports/:reportId — a single report by id. */
router.get(
  "/reports/:reportId",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id as string;
      const report = await prisma.dealGuardianReport.findFirst({
        where: { id: req.params.reportId, userId },
      });
      if (!report) throw ApiError.notFound("Deal Guardian report");
      return sendSuccess(res, toFrontendShape(report), "Deal Guardian report retrieved");
    } catch (err) {
      next(err);
    }
  }
);

/** POST /deal-guardian/analyze — upload a contract file for AI risk analysis. */
router.post(
  "/analyze",
  authenticate,
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id as string;
      const { dealTitle, counterpartyName } = req.body ?? {};
      if (!req.file) throw ApiError.badRequest("A contract file is required");
      if (!dealTitle || !counterpartyName) {
        throw ApiError.badRequest("dealTitle and counterpartyName are required");
      }

      const contractText = await extractContractText(req.file);
      const analysis = await dealGuardianService.analyzeContract(contractText);

      const report = await prisma.dealGuardianReport.create({
        data: {
          userId,
          dealTitle,
          counterpartyName,
          fileName: req.file.originalname,
          riskLevel: analysis.riskLevel,
          safetyScore: analysis.safetyScore,
          summary: analysis.summary,
          flaggedClauses: analysis.flaggedClauses,
          recommendations: analysis.recommendations,
        },
      });

      return sendCreated(res, toFrontendShape(report), "Contract analyzed");
    } catch (err) {
      next(err);
    }
  }
);

export default router;
