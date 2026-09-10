/**
 * src/hooks/useNotifications.ts
 * React Query hooks wrapping backend/src/modules/notifications.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const NOTIFICATIONS_KEY = ["notifications"] as const;

/** GET /notifications — recent notifications + unread count, polled. */
export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<{ items: AppNotification[]; unreadCount: number }>>(
        "/notifications"
      );
      return data.data;
    },
    refetchInterval: 15000,
  });
}

/** PATCH /notifications/:id/read */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/notifications/${id}/read`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}

/** PATCH /notifications/read-all */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.patch("/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}
