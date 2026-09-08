/**
 * trustScore.service.ts
 * Dynamic Trust Score Engine.
 *
 * Pure calculation logic is separated from persistence so it can be unit
 * tested without a database. `TrustScoreRepository` is injected — the
 * backend team wires a Prisma-backed implementation in `backend/src/modules/ai`.
 */

import {
  TRUST_SCORE_BASE,
  TRUST_SCORE_MIN,
  TRUST_SCORE_MAX,
  TRUST_SCORE_RULES,
  TrustScoreEvent,
  TrustScoreResult,
  TrustScoreRecord,
  TrustScoreRepository,
  TrustScoreHistoryEntry,
} from "./trustScore.types";

export class TrustScoreService {
  constructor(private readonly repository: TrustScoreRepository) {}

  /** Clamp any raw score into the [0, 100] boundary defined by the plan. */
  static clamp(score: number): number {
    return Math.min(TRUST_SCORE_MAX, Math.max(TRUST_SCORE_MIN, score));
  }

  /** Fetch a user's current score, creating the default 50-point record if none exists. */
  async getOrCreateScore(userId: string): Promise<TrustScoreRecord> {
    const existing = await this.repository.getScore(userId);
    if (existing) return existing;
    return this.repository.createDefault(userId);
  }

  /**
   * Apply a single trust event to a user's score.
   * This is the only entry point that should mutate a score — deal completion,
   * review submission, dispute resolution, and AI Guardian CRITICAL flags all
   * route through here so the boundary and history rules stay consistent.
   */
  async applyEvent(event: TrustScoreEvent): Promise<TrustScoreResult> {
    const rule = TRUST_SCORE_RULES[event.type];
    if (!rule) {
      throw new Error(`Unknown trust score event type: ${event.type}`);
    }

    const record = await this.getOrCreateScore(event.userId);
    const rawScore = record.score + rule.points;
    const newScore = TrustScoreService.clamp(rawScore);

    let clampedAt: "MIN" | "MAX" | undefined;
    if (rawScore > TRUST_SCORE_MAX) clampedAt = "MAX";
    if (rawScore < TRUST_SCORE_MIN) clampedAt = "MIN";

    const historyEntry: TrustScoreHistoryEntry = {
      type: event.type,
      points: rule.points,
      reason: rule.reason,
      resultingScore: newScore,
      createdAt: event.occurredAt ?? new Date(),
    };

    await this.repository.applyDelta(event.userId, newScore, historyEntry);

    return {
      userId: event.userId,
      previousScore: record.score,
      newScore,
      delta: { type: event.type, points: rule.points, reason: rule.reason },
      clampedAt,
    };
  }

  /**
   * Convenience helper for a "high review" event — the plan only awards points
   * above 4.5 stars, so the threshold check lives here rather than at call sites.
   */
  async applyReview(userId: string, sourceId: string, rating: number): Promise<TrustScoreResult | null> {
    if (rating <= 4.5) return null;
    return this.applyEvent({
      type: "HIGH_REVIEW",
      userId,
      sourceId,
      metadata: { rating },
    });
  }

  /** Seed value used whenever a new user's TrustScore row is first created. */
  static defaultScore(): number {
    return TRUST_SCORE_BASE;
  }
}
