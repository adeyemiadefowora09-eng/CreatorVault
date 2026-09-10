/**
 * src/hooks/useDeals.ts
 * React Query hooks wrapping the Deals API endpoints.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Deal } from "@/types/deals";

/** Fetches all deals for the signed-in user. */
export function useDeals() {
  return useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      const { data } = await api.get<Deal[]>("/deals");
      return data;
    },
  });
}

/** Fetches a single deal by id. */
export function useDeal(dealId: string) {
  return useQuery({
    queryKey: ["deals", dealId],
    queryFn: async () => {
      const { data } = await api.get<Deal>(`/deals/${dealId}`);
      return data;
    },
    enabled: Boolean(dealId),
  });
}