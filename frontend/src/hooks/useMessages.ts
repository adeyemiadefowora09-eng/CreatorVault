/**
 * src/hooks/useMessages.ts
 * React Query hooks wrapping backend/src/modules/messages, mounted at
 * /api/v1/deals/:dealId/messages.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Message } from "@/types/messages";

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: { page: number; limit: number; total: number; totalPages: number };
}

const messagesKey = (dealId: string) => ["deals", dealId, "messages"] as const;

/** GET /deals/:dealId/messages — the thread for this deal, oldest first. */
export function useMessages(dealId: string | undefined) {
  return useQuery({
    queryKey: messagesKey(dealId ?? ""),
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<Message[]>>(`/deals/${dealId}/messages`, {
        params: { limit: 100 },
      });
      return data.data;
    },
    enabled: Boolean(dealId),
    refetchInterval: 8000,
  });
}

/** POST /deals/:dealId/messages — send a message to the other party on this deal. */
export function useSendMessage(dealId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { data } = await api.post<ApiEnvelope<Message>>(`/deals/${dealId}/messages`, { body });
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messagesKey(dealId) });
    },
  });
}
