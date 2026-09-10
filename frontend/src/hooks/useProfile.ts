/**
 * src/hooks/useProfile.ts
 * React Query hooks wrapping GET /auth/me and the profile update endpoints
 * (backend/src/modules/users). Keeps authStore's cached `user` in sync so
 * the Sidebar/Topbar reflect a name or avatar change immediately.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import type {
  FullUser,
  UpdateBrandProfileInput,
  UpdateCreatorProfileInput,
  UpdateProfileInput,
} from "@/types/user";

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

const ME_KEY = ["profile", "me"] as const;

/** GET /auth/me — the signed-in user's full profile, including role-specific profile. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<FullUser>>("/auth/me");
      return data.data;
    },
  });
}

function useSyncAuthUser() {
  const setUser = useAuthStore((s) => s.setUser);
  const currentUser = useAuthStore((s) => s.user);
  return (user: FullUser) => {
    if (!currentUser) return;
    setUser({
      ...currentUser,
      name: user.name,
      avatarUrl: user.avatarUrl ?? undefined,
      trustScore: user.trustScore,
    });
  };
}

/** PATCH /users/profile — name/bio/country/avatarUrl, common to every role. */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const syncAuthUser = useSyncAuthUser();
  return useMutation({
    mutationFn: async (input: UpdateProfileInput) => {
      const { data } = await api.patch<ApiEnvelope<FullUser>>("/users/profile", input);
      return data.data;
    },
    onSuccess: (user) => {
      syncAuthUser(user);
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

/** PATCH /users/profile/creator — categories/portfolioUrl/socialLinks (CREATOR only). */
export function useUpdateCreatorProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateCreatorProfileInput) => {
      const { data } = await api.patch<ApiEnvelope<FullUser>>("/users/profile/creator", input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

/** PATCH /users/profile/brand — companyName/industry/website (BRAND only). */
export function useUpdateBrandProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateBrandProfileInput) => {
      const { data } = await api.patch<ApiEnvelope<FullUser>>("/users/profile/brand", input);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}
