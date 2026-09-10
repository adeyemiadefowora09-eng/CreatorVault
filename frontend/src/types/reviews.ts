/**
 * src/types/reviews.ts
 * Matches backend/src/modules/reviews.
 */

export interface Review {
  id: string;
  dealId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface CreateReviewInput {
  dealId: string;
  rating: number;
  comment: string;
}
