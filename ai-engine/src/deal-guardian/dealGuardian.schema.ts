import { z } from "zod";

export const RiskLevelSchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const FlaggedClauseSchema = z.object({
  clause: z.string().min(1, "clause text is required"),
  explanation: z.string().min(1, "explanation is required"),
  severity: RiskLevelSchema,
});

export type FlaggedClause = z.infer<typeof FlaggedClauseSchema>;

/**
 * Raw response produced by the AI.
 *
 * The AI identifies risks and provides recommendations.
 * It does NOT calculate the overall score or risk level.
 */
export const AIContractAnalysisSchema = z.object({
  summary: z.string().min(1, "summary is required"),

  flaggedClauses: z
    .array(FlaggedClauseSchema)
    .min(1, "at least one flagged clause is required"),

  recommendations: z
    .array(z.string().min(1))
    .min(1, "at least one recommendation is required"),
});

export type AIContractAnalysis = z.infer<
  typeof AIContractAnalysisSchema
>;

/**
 * Final analysis returned by the backend.
 *
 * safetyScore is kept for compatibility with the existing backend/database.
 *
 * 0   = lowest risk
 * 100 = highest risk
 */
export const ContractAnalysisSchema = z.object({
  riskLevel: RiskLevelSchema,

  safetyScore: z.number().min(0).max(100),

  summary: z.string().min(1),

  flaggedClauses: z.array(FlaggedClauseSchema),

  recommendations: z.array(z.string().min(1)),
});

export type ContractAnalysis = z.infer<
  typeof ContractAnalysisSchema
>;

export const AnalyzeContractRequestSchema = z.object({
  contractId: z.string().min(1),
  dealId: z.string().min(1),
  contractText: z.string().min(1, "contractText must not be empty"),
});

export type AnalyzeContractRequest = z.infer<
  typeof AnalyzeContractRequestSchema
>;

/**
 * Parses and validates the raw JSON returned by the AI.
 */
export function parseAIContractAnalysis(
  rawJson: string
): AIContractAnalysis {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error(
      "AI Deal Guardian returned non-JSON output"
    );
  }

  const result = AIContractAnalysisSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(
      `AI Deal Guardian output failed schema validation: ${result.error.message}`
    );
  }

  return result.data;
}