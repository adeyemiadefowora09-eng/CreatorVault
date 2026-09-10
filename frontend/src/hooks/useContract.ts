/**
 * src/hooks/useContract.ts
 * Wraps backend/src/modules/contracts. There's no GET /contracts?dealId=
 * filter endpoint, so useContractForDeal pulls the user's full contract
 * list and finds the one for this deal — fine at hackathon scale (a user's
 * total contract count), and avoids adding a backend endpoint for this.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Contract, UploadContractInput } from "@/types/contracts";

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

const CONTRACTS_KEY = ["contracts"] as const;

/** GET /contracts — every contract for a deal the signed-in user is party to. */
export function useContracts() {
  return useQuery({
    queryKey: CONTRACTS_KEY,
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<Contract[]>>("/contracts");
      return data.data;
    },
  });
}

/** Finds this deal's contract (if any) from the user's contract list. */
export function useContractForDeal(dealId: string | undefined) {
  const query = useContracts();
  return {
    ...query,
    data: dealId ? query.data?.find((c) => c.dealId === dealId) ?? null : null,
  };
}

/** POST /contracts/upload — { dealId, rawText }. One contract per deal. */
export function useUploadContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UploadContractInput) => {
      const { data } = await api.post<ApiEnvelope<Contract>>("/contracts/upload", input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTRACTS_KEY });
    },
  });
}

/** POST /contracts/:id/sign */
export function useSignContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contractId: string) => {
      const { data } = await api.post<ApiEnvelope<Contract>>(`/contracts/${contractId}/sign`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTRACTS_KEY });
    },
  });
}

/**
 * POST /contracts/:id/analyze — runs AI Deal Guardian against this deal's
 * actual attached contract text and persists a ContractAnalysis on it.
 * Previously there was no way to do this at all; the only AI check
 * available was the standalone /deal-guardian flow, which never touched a
 * real deal's Contract row.
 */
export function useAnalyzeDealContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (contractId: string) => {
      const { data } = await api.post<ApiEnvelope<Contract>>(`/contracts/${contractId}/analyze`);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONTRACTS_KEY });
    },
  });
}
