/**
 * src/hooks/useUsers.ts
 * Wraps GET /users?role=&search= (backend/src/modules/users) — this
 * endpoint already existed and already supports exactly this; it just
 * wasn't exposed anywhere in the UI yet.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { FullUser, UserRole } from "@/types/user";

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export function useUsers(filters: { role?: UserRole; search?: string }) {
  return useQuery({
    queryKey: ["users", "list", filters],
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<FullUser[]>>("/users", { params: filters });
      return data.data;
    },
  });
}
