/**
 * src/types/deals.ts
 * Matches backend/src/modules/deals and modules/milestones response shapes
 * (see deals.service.ts's `dealInclude` and milestones.service.ts).
 */

export type DealStatus =
  | "DRAFT"
  | "PROPOSED"
  | "NEGOTIATING"
  | "ACTIVE"
  | "COMPLETED"
  | "DISPUTED"
  | "CANCELLED";

export type MilestoneStatus = "PENDING" | "IN_PROGRESS" | "SUBMITTED" | "APPROVED" | "PAID";

export interface DealParty {
  id: string;
  name: string;
  avatarUrl: string | null;
  trustScore: number;
}

export interface Deliverable {
  title: string;
  description?: string;
}

export interface Milestone {
  id: string;
  dealId: string;
  title: string;
  description: string | null;
  amount: string;
  status: MilestoneStatus;
  orderIndex: number;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  submissionNote: string | null;
  submissionUrl: string | null;
  submittedAt: string | null;
}

export interface Deal {
  id: string;
  creatorId: string;
  brandId: string;
  title: string;
  description: string;
  amount: string;
  currency: string;
  status: DealStatus;
  deliverables: Deliverable[];
  deadline: string;
  createdAt: string;
  updatedAt: string;
  creator: DealParty;
  brand: DealParty;
  milestones: Milestone[];
  contract: { id: string; status: string; analysis: unknown } | null;
  _count: { payments: number; reviews: number; disputes: number };
  payments?: unknown[];
}

export interface CreateDealInput {
  creatorId: string;
  title: string;
  description: string;
  amount: number;
  currency?: string;
  deliverables: Deliverable[];
  deadline: string;
}

export interface CreateMilestoneInput {
  title: string;
  description?: string;
  amount: number;
  orderIndex: number;
  dueDate: string;
}
