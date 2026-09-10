/**
 * src/types/deals.ts
 * Shared types for the Deals feature.
 */

export type DealStatus =
  | "DRAFT"
  | "PENDING"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED";

export interface Deal {
  id: string;
  title: string;
  counterpartyName: string;
  status: DealStatus;
  value: number;
  createdAt: string;
  completedAt: string | null;
}