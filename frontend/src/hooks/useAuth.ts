/**
 * src/hooks/useAuth.ts
 * React Query hooks wrapping the Auth API endpoints (backend/src/modules/auth).
 *
 * Response shape from the backend is always { success, message, data }
 * (see backend/src/utils/apiResponse.ts), so every call here unwraps `.data`.
 */

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore, type AuthUser } from "@/stores/authStore";

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

interface AuthPayload {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  role: "CREATOR" | "BRAND";
}

/** POST /auth/login — on success, stores the user + tokens and redirects to the dashboard. */
export function useLogin() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const { data } = await api.post<ApiEnvelope<AuthPayload>>("/auth/login", input);
      return data.data;
    },
    onSuccess: (payload) => {
      login(payload.user, payload.accessToken, payload.refreshToken);
      router.push("/");
    },
  });
}

/** POST /auth/register — the backend returns the same { user, accessToken, refreshToken }
 * shape as login, so we log the user in directly from this response. */
export function useRegister() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  return useMutation({
    mutationFn: async (input: RegisterInput) => {
      const { data } = await api.post<ApiEnvelope<AuthPayload>>("/auth/register", input);
      return data.data;
    },
    onSuccess: (payload) => {
      login(payload.user, payload.accessToken, payload.refreshToken);
      router.push("/");
    },
  });
}

/** POST /auth/logout — clears local auth state regardless of whether the request succeeds. */
export function useLogout() {
  const router = useRouter();
  const { refreshToken, logout } = useAuthStore();

  return useMutation({
    mutationFn: async () => {
      if (refreshToken) {
        await api.post("/auth/logout", { refreshToken }).catch(() => {
          // Ignore failures — we're logging out locally regardless.
        });
      }
    },
    onSettled: () => {
      logout();
      router.push("/login");
    },
  });
}
