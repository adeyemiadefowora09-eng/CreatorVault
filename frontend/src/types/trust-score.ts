/**
 * src/types/trust-score.ts
 * Shared types for the Trust Score Engine feature.
 */

export type TrustEventType =
  | "DEAL_COMPLETED"
  | "DEAL_CANCELLED"
  | "PAYMENT_ON_TIME"
  | "PAYMENT_LATE"
  | "AI_FLAG_CRITICAL"
  | "AI_FLAG_HIGH"
  | "DISPUTE_RESOLVED"
  | "DISPUTE_LOST"
  | "PROFILE_VERIFIED";

export interface TrustScoreEvent {
  id: string;
  type: TrustEventType;
  label: string;
  pointsDelta: number; // positive or negative
  occurredAt: string; // ISO date string
}

export interface TrustScoreSummary {
  userId: string;
  currentScore: number; // 0–100, starts at 50
  previousScore: number;
  tier: "AT_RISK" | "BUILDING" | "TRUSTED" | "ELITE";
  recentEvents: TrustScoreEvent[];
}
