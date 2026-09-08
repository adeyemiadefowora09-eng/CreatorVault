/**
 * src/types/deal-guardian.ts
 * Shared types for the AI Deal Guardian contract-analysis feature.
 */

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface FlaggedClause {
  id: string;
  clauseTitle: string;
  excerpt: string;
  riskLevel: RiskLevel;
  explanation: string;
}

export interface DealGuardianReport {
  id: string;
  contractName: string;
  analyzedAt: string; // ISO date string
  riskLevel: RiskLevel;
  safetyScore: number; // 0–100, higher is safer
  summary: string;
  flaggedClauses: FlaggedClause[];
  recommendations: string[];
}

export interface AnalyzeContractPayload {
  file: File;
  dealTitle: string;
  counterpartyName: string;
}
