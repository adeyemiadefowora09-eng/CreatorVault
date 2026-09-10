/**
 * dealGuardian.controller.ts
 * Express routes exposing AI Deal Guardian contract analysis to the
 * backend's `ai` bridge module.
 *
 * This module optionally accepts a hook to persist the resulting
 * ContractAnalysis (linked 1:1 with a Contract, per the Prisma schema) and
 * to trigger a Trust Score AI_GUARDIAN_CRITICAL_FLAG event when applicable —
 * both are injected so this package has no direct Prisma dependency.
 */

import { Router, Request, Response, NextFunction } from "express";
import { DealGuardianService } from "./dealGuardian.service";
import { AnalyzeContractRequestSchema, ContractAnalysis } from "./dealGuardian.schema";

export interface DealGuardianControllerHooks {
  /** Persist the analysis result, e.g. upsert ContractAnalysis row keyed by contractId. */
  onAnalysisComplete?: (params: {
    contractId: string;
    dealId: string;
    analysis: ContractAnalysis;
  }) => Promise<void>;
  /** Called when riskLevel === "CRITICAL" so the caller can apply the -10 Trust Score rule. */
  onCriticalFlag?: (params: { dealId: string; contractId: string }) => Promise<void>;
}

export function createDealGuardianRouter(
  service: DealGuardianService,
  hooks: DealGuardianControllerHooks = {}
): Router {
  const router = Router();

  /** POST /deal-guardian/analyze — run contract risk analysis */
  router.post("/analyze", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsedBody = AnalyzeContractRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          success: false,
          error: parsedBody.error.flatten(),
        });
      }

      const { contractId, dealId, contractText } = parsedBody.data;
      const analysis = await service.analyzeContract(contractText);

      if (hooks.onAnalysisComplete) {
        await hooks.onAnalysisComplete({ contractId, dealId, analysis });
      }

      if (analysis.riskLevel === "CRITICAL" && hooks.onCriticalFlag) {
        await hooks.onCriticalFlag({ dealId, contractId });
      }

      return res.status(200).json({ success: true, data: analysis });
    } catch (err) {
      next(err);
      return;
    }
  });

  return router;
}
