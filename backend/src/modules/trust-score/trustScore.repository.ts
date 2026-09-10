/**
 * trustScore.repository.ts
 *
 * Prisma-backed implementation of `TrustScoreRepository` from
 * `@creatorvault/ai-engine`. This is the ONE place that reads/writes trust
 * score data, backing the single canonical, event-sourced score:
 *
 *   - `User.trustScore` is the cached current value (fast reads elsewhere:
 *     deal listings, profile cards, etc. keep using this column directly).
 *   - `TrustScoreEvent` is the append-only history every score change is
 *     computed from.
 *
 * This replaces both of the other two implementations that used to exist:
 *   - `backend/src/utils/trustScore.ts` (ad hoc weighted formula) — retired,
 *     see users.service.ts.
 *   - the ai-engine package's own example in-memory repository — never wired
 *     up, superseded by this file.
 */

import { prisma } from "../../config/db.js";
import type {
  TrustScoreRepository,
  TrustScoreRecord,
  TrustScoreHistoryEntry,
  TrustEventType,
} from "@creatorvault/ai-engine";
import { TrustScoreService } from "@creatorvault/ai-engine";

async function loadRecord(userId: string): Promise<TrustScoreRecord | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, trustScore: true },
  });
  if (!user) return null;

  const events = await prisma.trustScoreEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  return {
    userId: user.id,
    score: user.trustScore,
    history: events.map(
      (e): TrustScoreHistoryEntry => ({
        type: e.type as TrustEventType,
        points: e.points,
        reason: e.reason,
        resultingScore: e.resultingScore,
        createdAt: e.createdAt,
      })
    ),
    updatedAt: events.at(-1)?.createdAt ?? new Date(),
  };
}

export const prismaTrustScoreRepository: TrustScoreRepository = {
  async getScore(userId) {
    return loadRecord(userId);
  },

  async createDefault(userId) {
    const defaultScore = TrustScoreService.defaultScore();
    await prisma.user.update({
      where: { id: userId },
      data: { trustScore: defaultScore },
    });
    return {
      userId,
      score: defaultScore,
      history: [],
      updatedAt: new Date(),
    };
  },

  async applyDelta(userId, newScore, entry) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { trustScore: newScore },
      }),
      prisma.trustScoreEvent.create({
        data: {
          userId,
          type: entry.type,
          points: entry.points,
          reason: entry.reason,
          resultingScore: entry.resultingScore,
          createdAt: entry.createdAt,
        },
      }),
    ]);
    const record = await loadRecord(userId);
    if (!record) throw new Error(`User ${userId} not found after applying trust score delta`);
    return record;
  },
};
