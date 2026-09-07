interface TrustScoreInput {
  completedDeals: number;
  totalDeals: number;
  onTimeRate: number; // 0 to 1
  avgRating: number; // 0 to 5
  disputeCount: number;
  hasCriticalFlags: boolean;
}

export function calculateTrustScore(input: TrustScoreInput): number {
  let score = 50; // Base Score

  // Rule 1: Completed Deal (No Dispute)
  // Approximating this as completed deals * 10 up to a certain max, or just calculating purely from base.
  // The plan says "+10 pts" for completed deal, meaning it builds over time. 
  // Let's implement it as a cumulative function from the 50 base.
  
  // +10 per completed deal
  score += (input.completedDeals * 10);
  
  // +5 for high review (average > 4.5)
  if (input.avgRating > 4.5) {
    score += 5;
  }
  
  // +5 for timely milestone delivery (using onTimeRate > 0.8 as a proxy for this snapshot)
  if (input.onTimeRate > 0.8) {
    score += 5;
  }

  // -15 for open/lost disputes
  score -= (input.disputeCount * 15);

  // -10 for AI Deal Guardian CRITICAL flags
  if (input.hasCriticalFlags) {
    score -= 10;
  }

  // Score Boundary: 0 to 100
  return Math.round(Math.max(0, Math.min(100, score)));
}
