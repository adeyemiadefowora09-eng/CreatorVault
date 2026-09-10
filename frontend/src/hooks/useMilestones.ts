/**
 * src/hooks/useMilestones.ts
 * React Query hooks wrapping backend/src/modules/milestones, mounted at
 * /api/v1/deals/:dealId/milestones.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CreateMilestoneInput, Milestone } from "@/types/deals";

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

const milestonesKey = (dealId: string) => ["deals", dealId, "milestones"] as const;

/** GET /deals/:dealId/milestones */
export function useMilestones(dealId: string | undefined) {
  return useQuery({
    queryKey: milestonesKey(dealId ?? ""),
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<Milestone[]>>(`/deals/${dealId}/milestones`);
      return data.data;
    },
    enabled: Boolean(dealId),
  });
}

/** POST /deals/:dealId/milestones — add a milestone (BRAND, DRAFT/NEGOTIATING deals only). */
export function useAddMilestone(dealId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMilestoneInput) => {
      const { data } = await api.post<ApiEnvelope<Milestone>>(
        `/deals/${dealId}/milestones`,
        input
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: milestonesKey(dealId) });
    },
  });
}

function useMilestoneAction(
  dealId: string,
  action: "approve" | "remove",
  method: "post" | "delete" = "post"
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (milestoneId: string) => {
      const path =
        action === "remove"
          ? `/deals/${dealId}/milestones/${milestoneId}`
          : `/deals/${dealId}/milestones/${milestoneId}/${action}`;
      if (method === "delete") {
        await api.delete(path);
        return milestoneId;
      }
      const { data } = await api.post<ApiEnvelope<Milestone>>(path);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: milestonesKey(dealId) });
    },
  });
}

export const useApproveMilestone = (dealId: string) => useMilestoneAction(dealId, "approve");
export const useDeleteMilestone = (dealId: string) =>
  useMilestoneAction(dealId, "remove", "delete");

/**
 * POST /deals/:dealId/milestones/:milestoneId/submit — requires a note
 * and/or a link to what's being submitted (backend enforces at least one).
 */
export function useSubmitMilestone(dealId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      milestoneId,
      submissionNote,
      submissionUrl,
    }: {
      milestoneId: string;
      submissionNote?: string;
      submissionUrl?: string;
    }) => {
      const { data } = await api.post<ApiEnvelope<Milestone>>(
        `/deals/${dealId}/milestones/${milestoneId}/submit`,
        { submissionNote, submissionUrl }
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: milestonesKey(dealId) });
    },
  });
}

/** POST /deals/:dealId/milestones/:milestoneId/reject — requires a reason (10+ chars). */
export function useRejectMilestone(dealId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ milestoneId, reason }: { milestoneId: string; reason: string }) => {
      const { data } = await api.post<ApiEnvelope<Milestone>>(
        `/deals/${dealId}/milestones/${milestoneId}/reject`,
        { reason }
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: milestonesKey(dealId) });
    },
  });
}
