/**
 * src/hooks/useDisputes.ts
 * React Query hooks wrapping the Disputes API (backend/src/modules/disputes).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CreateDisputeInput, Dispute, ResolveDisputeInput } from "@/types/disputes";

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

const DISPUTES_KEY = ["disputes"] as const;

/** GET /disputes — every dispute on a deal the signed-in user is party to. */
export function useDisputes() {
  return useQuery({
    queryKey: DISPUTES_KEY,
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<Dispute[]>>("/disputes");
      return data.data;
    },
  });
}

/** POST /disputes — raise a new dispute on a deal. */
export function useCreateDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDisputeInput) => {
      const { data } = await api.post<ApiEnvelope<Dispute>>("/disputes", input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DISPUTES_KEY });
    },
  });
}

/**
 * PATCH /disputes/:id/resolve — ADMIN only (enforced server-side). Decides
 * a dispute UPHELD (docks the respondent's trust score) or DISMISSED (deal
 * returns to ACTIVE). This didn't exist before — a dispute, once opened,
 * had no way to ever be closed.
 */
export function useResolveDispute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ResolveDisputeInput & { id: string }) => {
      const { data } = await api.patch<ApiEnvelope<Dispute>>(`/disputes/${id}/resolve`, input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DISPUTES_KEY });
    },
  });
}
