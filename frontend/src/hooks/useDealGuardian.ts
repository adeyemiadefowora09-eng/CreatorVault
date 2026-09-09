/**
 * src/hooks/useDealGuardian.ts
 * React Query hooks wrapping the Deal Guardian API endpoints.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  AnalyzeContractPayload,
  DealGuardianReport,
} from "@/types/deal-guardian";

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

const DEAL_GUARDIAN_KEY = ["deal-guardian", "reports"] as const;

/** Fetches the signed-in user's contract analysis history. */
export function useDealGuardianReports() {
  return useQuery({
    queryKey: DEAL_GUARDIAN_KEY,
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<DealGuardianReport[]>>(
        "/deal-guardian/reports"
      );
      return data.data;
    },
  });
}

/** Fetches a single report by id (used by a detail dialog/page). */
export function useDealGuardianReport(reportId: string | null) {
  return useQuery({
    queryKey: [...DEAL_GUARDIAN_KEY, reportId],
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<DealGuardianReport>>(
        `/deal-guardian/reports/${reportId}`
      );
      return data.data;
    },
    enabled: Boolean(reportId),
  });
}

/** Uploads a contract file for AI risk analysis. */
export function useAnalyzeContract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: AnalyzeContractPayload) => {
      const formData = new FormData();
      formData.append("file", payload.file);
      formData.append("dealTitle", payload.dealTitle);
      formData.append("counterpartyName", payload.counterpartyName);

      const { data } = await api.post<ApiEnvelope<DealGuardianReport>>(
        "/deal-guardian/analyze",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DEAL_GUARDIAN_KEY });
    },
  });
}
