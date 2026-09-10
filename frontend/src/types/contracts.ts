/**
 * src/types/contracts.ts
 * Matches backend/src/modules/contracts (contracts.service.ts).
 */

export type ContractStatus = "PENDING_REVIEW" | "ANALYZED" | "SIGNED";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ContractAnalysis {
  id: string;
  riskLevel: RiskLevel;
  riskScore: number;
  flaggedClauses: unknown;
  summary: string;
  recommendations: unknown;
  analyzedAt: string;
}

export interface Contract {
  id: string;
  dealId: string;
  fileUrl: string | null;
  rawText: string | null;
  status: ContractStatus;
  signedByCreator: boolean;
  signedByBrand: boolean;
  createdAt: string;
  updatedAt: string;
  analysis: ContractAnalysis | null;
  deal?: { id: string; title: string; status: string };
}

export interface UploadContractInput {
  dealId: string;
  rawText: string;
}
