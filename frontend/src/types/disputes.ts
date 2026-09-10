/**
 * src/types/disputes.ts
 * Matches backend/src/modules/disputes (disputes.service.ts's listDisputes,
 * which includes the related `deal`).
 */

// Matches Prisma's DisputeStatus enum exactly — this used to list "DISMISSED"
// as a status, but that's actually an outcome once a dispute is RESOLVED,
// not a status of its own. ESCALATED was also missing.
export type DisputeStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "ESCALATED";
export type DisputeOutcome = "UPHELD" | "DISMISSED";

export interface Dispute {
  id: string;
  dealId: string;
  raisedById: string;
  reason: string;
  status: DisputeStatus;
  outcome: DisputeOutcome | null;
  resolution: string | null;
  evidence: unknown;
  createdAt: string;
  resolvedAt: string | null;
  deal: {
    id: string;
    title: string;
    creatorId: string;
    brandId: string;
    status: string;
  };
}

export interface CreateDisputeInput {
  dealId: string;
  reason: string;
}

export interface ResolveDisputeInput {
  outcome: DisputeOutcome;
  resolution: string;
}
