/**
 * index.ts
 * Main export router for the AI Deal Guardian & Trust Score modules.
 *
 * `backend/src/modules/ai` should import `createAiEngineRouter` and mount it,
 * supplying a Prisma-backed TrustScoreRepository and (optionally) hooks for
 * persisting contract analyses and wiring the CRITICAL-flag Trust Score event.
 *
 * Example (in backend/):
 *
 *   import { createAiEngineRouter } from "../../../ai-engine/src";
 *   import { prismaTrustScoreRepository } from "./trustScore.prisma";
 *
 *   app.use(
 *     "/api/v1/ai",
 *     createAiEngineRouter({
 *       trustScoreRepository: prismaTrustScoreRepository,
 *       dealGuardianHooks: {
 *         onAnalysisComplete: async ({ contractId, analysis }) => {
 *           await prisma.contractAnalysis.upsert({ ... });
 *         },
 *         onCriticalFlag: async ({ dealId, contractId }) => {
 *           const deal = await prisma.deal.findUniqueOrThrow({ where: { id: dealId } });
 *           await trustScoreService.applyEvent({
 *             type: "AI_GUARDIAN_CRITICAL_FLAG",
 *             userId: deal.creatorId,
 *             sourceId: contractId,
 *           });
 *         },
 *       },
 *     })
 *   );
 */

import { Router } from "express";
import { DealGuardianService, DealGuardianServiceOptions } from "./deal-guardian/dealGuardian.service";
import { createDealGuardianRouter, DealGuardianControllerHooks } from "./deal-guardian/dealGuardian.controller";
import { createTrustScoreRouter } from "./trust-score/trustScore.controller";
import { TrustScoreRepository } from "./trust-score/trustScore.types";

export interface AiEngineRouterOptions {
  trustScoreRepository: TrustScoreRepository;
  dealGuardianOptions?: DealGuardianServiceOptions;
  dealGuardianHooks?: DealGuardianControllerHooks;
}

export function createAiEngineRouter(options: AiEngineRouterOptions): Router {
  const router = Router();

  const dealGuardianService = new DealGuardianService(options.dealGuardianOptions);

  router.use("/deal-guardian", createDealGuardianRouter(dealGuardianService, options.dealGuardianHooks));
  router.use("/trust-score", createTrustScoreRouter(options.trustScoreRepository));

  return router;
}

// Re-export building blocks for direct use/testing from backend/ or elsewhere.
export { DealGuardianService } from "./deal-guardian/dealGuardian.service";
export { TrustScoreService } from "./trust-score/trustScore.service";
export * from "./deal-guardian/dealGuardian.schema";
export * from "./trust-score/trustScore.types";
