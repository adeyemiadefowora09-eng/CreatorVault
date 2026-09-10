/**
 * src/hooks/useDeals.ts
 * React Query hooks wrapping the Deals API (backend/src/modules/deals).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CreateDealInput, Deal, DealStatus } from "@/types/deals";

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

const DEALS_KEY = ["deals"] as const;
const dealKey = (id: string) => [...DEALS_KEY, id] as const;

/** GET /deals — deals the signed-in user is a party to (either side). */
export function useDeals(filters?: { status?: DealStatus; role?: "as_creator" | "as_brand" }) {
  return useQuery({
    queryKey: [...DEALS_KEY, "list", filters ?? {}],
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<Deal[]>>("/deals", { params: filters });
      return data.data;
    },
  });
}

/** GET /deals/:id — a single deal's full detail. */
export function useDeal(dealId: string | undefined) {
  return useQuery({
    queryKey: dealKey(dealId ?? ""),
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<Deal>>(`/deals/${dealId}`);
      return data.data;
    },
    enabled: Boolean(dealId),
  });
}

/** POST /deals — create a new DRAFT deal (BRAND only). */
export function useCreateDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDealInput) => {
      const { data } = await api.post<ApiEnvelope<Deal>>("/deals", input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEALS_KEY });
    },
  });
}

function useDealAction(action: "propose" | "accept" | "decline" | "complete" | "cancel") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dealId: string) => {
      const { data } = await api.post<ApiEnvelope<Deal>>(`/deals/${dealId}/${action}`);
      return data.data;
    },
    onSuccess: (deal) => {
      queryClient.invalidateQueries({ queryKey: DEALS_KEY });
      queryClient.setQueryData(dealKey(deal.id), deal);
    },
  });
}

export const useProposeDeal = () => useDealAction("propose");
export const useAcceptDeal = () => useDealAction("accept");
export const useDeclineDeal = () => useDealAction("decline");
export const useCompleteDeal = () => useDealAction("complete");
export const useCancelDeal = () => useDealAction("cancel");

/** DELETE /deals/:id — remove a DRAFT deal (BRAND only). */
export function useDeleteDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dealId: string) => {
      await api.delete(`/deals/${dealId}`);
      return dealId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEALS_KEY });
    },
  });
}
