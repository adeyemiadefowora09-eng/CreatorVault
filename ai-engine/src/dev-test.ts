/**
 * dev-test.ts
 * Standalone smoke test — NOT part of the production router.
 * Lets you verify your OPENAI_API_KEY and the Deal Guardian service work
 * before the backend integration is wired up.
 *
 * Run with: npm run test:live
 */

import "dotenv/config";
import { DealGuardianService } from "./deal-guardian/dealGuardian.service";
import { TrustScoreService } from "./trust-score/trustScore.service";
import { TrustScoreRepository, TrustScoreRecord, TrustScoreHistoryEntry } from "./trust-score/trustScore.types";

const SAMPLE_CONTRACT = `
This agreement is between Brand Co. and Creator Jane Doe.
Creator agrees to produce 3 Instagram posts promoting Brand Co.'s product.
Brand Co. may terminate this agreement at any time without notice and
without any obligation to pay for work already completed.
Payment terms: to be determined at Brand Co.'s sole discretion.
`;

// A tiny in-memory repository so we can test Trust Score without a database.
class InMemoryTrustScoreRepository implements TrustScoreRepository {
  private store = new Map<string, TrustScoreRecord>();

  async getScore(userId: string) {
    return this.store.get(userId) ?? null;
  }

  async createDefault(userId: string): Promise<TrustScoreRecord> {
    const record: TrustScoreRecord = {
      userId,
      score: TrustScoreService.defaultScore(),
      history: [],
      updatedAt: new Date(),
    };
    this.store.set(userId, record);
    return record;
  }

  async applyDelta(userId: string, newScore: number, entry: TrustScoreHistoryEntry) {
    const existing = this.store.get(userId) ?? (await this.createDefault(userId));
    const updated: TrustScoreRecord = {
      ...existing,
      score: newScore,
      history: [...existing.history, entry],
      updatedAt: new Date(),
    };
    this.store.set(userId, updated);
    return updated;
  }
}

async function main() {
  console.log("--- 1. Testing Trust Score Engine (no API key needed) ---");
  const trustScoreService = new TrustScoreService(new InMemoryTrustScoreRepository());
  const result = await trustScoreService.applyEvent({
    type: "DEAL_COMPLETED_NO_DISPUTE",
    userId: "test-user-1",
    sourceId: "test-deal-1",
  });
  console.log("Trust Score result:", result);

  console.log("\n--- 2. Testing AI Deal Guardian (requires OPENAI_API_KEY) ---");
  if (!process.env.OPENAI_API_KEY) {
    console.log("Skipped: OPENAI_API_KEY not set in your .env file.");
    return;
  }

  const dealGuardian = new DealGuardianService();
  const analysis = await dealGuardian.analyzeContract(SAMPLE_CONTRACT);
  console.log("Contract analysis result:", JSON.stringify(analysis, null, 2));
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
