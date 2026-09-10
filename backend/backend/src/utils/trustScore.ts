interface TrustScoreInput {
  completedDeals: number;
  totalDeals: number;
  onTimeRate: number; // 0 to 1
  avgRating: number; // 0 to 5
  disputeCount: number;
  accountAgeDays: number;
}

const WEIGHTS = {
  completion: 0.3,
  onTime: 0.25,
  rating: 0.25,
  disputes: 0.15,
  accountAge: 0.05,
};

export function calculateTrustScore(input: TrustScoreInput): number {
  const completionScore =
    input.totalDeals > 0 ? (input.completedDeals / input.totalDeals) * 100 : 50;

  const onTimeScore = input.onTimeRate * 100;

  const ratingScore = (input.avgRating / 5) * 100;

  // More disputes = lower score. Cap penalty at 10 disputes.
  const disputePenalty = Math.min(input.disputeCount, 10) / 10;
  const disputeScore = (1 - disputePenalty) * 100;

  // Account age bonus maxes out at 365 days.
  const ageScore = Math.min(input.accountAgeDays / 365, 1) * 100;

  const raw =
    completionScore * WEIGHTS.completion +
    onTimeScore * WEIGHTS.onTime +
    ratingScore * WEIGHTS.rating +
    disputeScore * WEIGHTS.disputes +
    ageScore * WEIGHTS.accountAge;

  return Math.round(Math.max(0, Math.min(100, raw)));
}
