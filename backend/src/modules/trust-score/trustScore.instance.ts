/**
 * trustScore.instance.ts
 *
 * Single shared TrustScoreService instance, wired to the Prisma repository.
 * Other modules (deals, disputes, milestones, reviews) should import
 * `applyTrustScoreEvent` / `applyTrustScoreReview` from here rather than
 * constructing their own TrustScoreService — that's what keeps this the one
 * canonical trust score implementation instead of a fourth one.
 *
 * Example call sites (not yet wired — see each module's TODO):
 *   deals.service.ts, on a deal transitioning to COMPLETED with no open
 *     dispute: applyTrustScoreEvent({ type: "DEAL_COMPLETED_NO_DISPUTE", userId: deal.creatorId, sourceId: deal.id })
 *   disputes.service.ts, on a dispute being opened:
 *     applyTrustScoreEvent({ type: "DISPUTE_OPENED_OR_LOST", userId: respondentId, sourceId: dispute.id })
 *   milestones.service.ts, on an on-time APPROVED milestone:
 *     applyTrustScoreEvent({ type: "TIMELY_MILESTONE_DELIVERY", userId: milestone.deal.creatorId, sourceId: milestone.id })
 *   reviews.service.ts, after creating a review:
 *     applyTrustScoreReview(revieweeId, review.id, review.rating)
 */

import { TrustScoreService } from "@creatorvault/ai-engine";
import type { TrustScoreEvent } from "@creatorvault/ai-engine";
import { prismaTrustScoreRepository } from "./trustScore.repository.js";

export const trustScoreService = new TrustScoreService(prismaTrustScoreRepository);

export async function applyTrustScoreEvent(event: TrustScoreEvent) {
  return trustScoreService.applyEvent(event);
}

export async function applyTrustScoreReview(userId: string, sourceId: string, rating: number) {
  return trustScoreService.applyReview(userId, sourceId, rating);
}
