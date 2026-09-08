/**
 * trustScore.types.ts
 * Shared types for the Trust Score Engine.
 *
 * NOTE: This module is intentionally decoupled from Prisma's generated types
 * so the ai-engine package can be built/tested without a database connection.
 * The `backend/` bridge (modules/ai) is responsible for mapping Prisma models
 * onto these shapes before calling into the engine.
 */

export type TrustEventType =
  | "DEAL_COMPLETED_NO_DISPUTE"
  | "HIGH_REVIEW"
  | "TIMELY_MILESTONE_DELIVERY"
  | "DISPUTE_OPENED_OR_LOST"
  | "AI_GUARDIAN_CRITICAL_FLAG";

export interface TrustScoreEvent {
  type: TrustEventType;
  userId: string;
  /** Reference to the Deal / Milestone / Dispute / Review / Contract that triggered this event. */
  sourceId: string;
  /** Optional context, e.g. the star rating that caused a HIGH_REVIEW event. */
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

export interface TrustScoreDelta {
  type: TrustEventType;
  points: number;
  reason: string;
}

export interface TrustScoreResult {
  userId: string;
  previousScore: number;
  newScore: number;
  delta: TrustScoreDelta;
  clampedAt?: "MIN" | "MAX";
}

export interface TrustScoreRecord {
  userId: string;
  score: number;
  history: TrustScoreHistoryEntry[];
  updatedAt: Date;
}

export interface TrustScoreHistoryEntry {
  type: TrustEventType;
  points: number;
  reason: string;
  resultingScore: number;
  createdAt: Date;
}

/** Minimal persistence contract the service needs. Implement this against Prisma in backend/. */
export interface TrustScoreRepository {
  getScore(userId: string): Promise<TrustScoreRecord | null>;
  createDefault(userId: string): Promise<TrustScoreRecord>;
  applyDelta(
    userId: string,
    newScore: number,
    entry: TrustScoreHistoryEntry
  ): Promise<TrustScoreRecord>;
}

export const TRUST_SCORE_BASE = 50;
export const TRUST_SCORE_MIN = 0;
export const TRUST_SCORE_MAX = 100;

export const TRUST_SCORE_RULES: Record<TrustEventType, { points: number; reason: string }> = {
  DEAL_COMPLETED_NO_DISPUTE: { points: 10, reason: "Deal completed with no dispute" },
  HIGH_REVIEW: { points: 5, reason: "Received a review above 4.5 stars" },
  TIMELY_MILESTONE_DELIVERY: { points: 5, reason: "Milestone delivered on time" },
  DISPUTE_OPENED_OR_LOST: { points: -15, reason: "Dispute opened or lost" },
  AI_GUARDIAN_CRITICAL_FLAG: { points: -10, reason: "AI Deal Guardian flagged contract as CRITICAL" },
};
