/**
 * src/hooks/useReviews.ts
 * Wraps backend/src/modules/reviews.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CreateReviewInput, Review } from "@/types/reviews";

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

const dealReviewsKey = (dealId: string) => ["reviews", "deal", dealId] as const;

/** GET /reviews/deal/:dealId */
export function useDealReviews(dealId: string | undefined) {
  return useQuery({
    queryKey: dealReviewsKey(dealId ?? ""),
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<Review[]>>(`/reviews/deal/${dealId}`);
      return data.data;
    },
    enabled: Boolean(dealId),
  });
}

/** POST /reviews — deal must be COMPLETED; one review per direction per deal (backend doesn't enforce uniqueness, but only makes sense once). */
export function useCreateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateReviewInput) => {
      const { data } = await api.post<ApiEnvelope<Review>>("/reviews", input);
      return data.data;
    },
    onSuccess: (review) => {
      queryClient.invalidateQueries({ queryKey: dealReviewsKey(review.dealId) });
    },
  });
}
