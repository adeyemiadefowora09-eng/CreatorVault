/**
 * src/hooks/useTrustScore.ts
 * React Query hook wrapping the Trust Score Engine API endpoint.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TrustScoreSummary } from "@/types/trust-score";

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

/** Fetches the signed-in user's current trust score + recent contributing events. */
export function useTrustScore() {
  return useQuery({
    queryKey: ["trust-score", "summary"],
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<TrustScoreSummary>>("/trust-score/me");
      return data.data;
    },
  });
}
