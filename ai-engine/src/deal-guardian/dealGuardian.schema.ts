/**
 * dealGuardian.schema.ts
 * Zod schemas defining and validating the strict JSON contract analysis
 * shape returned by gpt-4o, per the implementation plan's
 * "AI Deal Guardian (Contract Risk Analysis)" spec.
 */

import { z } from "zod";

export const RiskLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const FlaggedClauseSchema = z.object({
  clause: z.string().min(1, "clause text is required"),
  explanation: z.string().min(1, "explanation is required"),
  severity: RiskLevelSchema,
});
export type FlaggedClause = z.infer<typeof FlaggedClauseSchema>;

export const ContractAnalysisSchema = z.object({
  riskLevel: RiskLevelSchema,
  /** 0-100, higher = safer. Distinct from Trust Score; scoped to this single contract. */
  safetyScore: z.number().min(0).max(100),
  summary: z.string().min(1),
  flaggedClauses: z.array(FlaggedClauseSchema).default([]),
  recommendations: z.array(z.string().min(1)).default([]),
});
export type ContractAnalysis = z.infer<typeof ContractAnalysisSchema>;

/** Request payload accepted by the analyze endpoint. */
export const AnalyzeContractRequestSchema = z.object({
  contractId: z.string().min(1),
  dealId: z.string().min(1),
  /** Raw extracted text of the uploaded contract file. Extraction happens upstream in backend/. */
  contractText: z.string().min(1, "contractText must not be empty"),
});
export type AnalyzeContractRequest = z.infer<typeof AnalyzeContractRequestSchema>;

/**
 * Attempts to parse gpt-4o's raw JSON string response into a validated
 * ContractAnalysis. Throws a descriptive error on malformed or non-conforming output
 * so the caller can decide whether to retry the completion.
 */
export function parseContractAnalysis(rawJson: string): ContractAnalysis {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("AI Deal Guardian returned non-JSON output");
  }

  const result = ContractAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `AI Deal Guardian output failed schema validation: ${result.error.message}`
    );
  }
  return result.data;
}
