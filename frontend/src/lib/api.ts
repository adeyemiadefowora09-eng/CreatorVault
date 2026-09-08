/**
 * src/lib/api.ts
 *
 * Central Axios instance for CreatorVault.
 *
 * Responsibilities:
 *  - Attaches the current JWT access token to every outgoing request.
 *  - Detects 401 responses caused by an expired access token and
 *    transparently refreshes it using the refresh token, then retries
 *    the original request exactly once.
 *  - Queues concurrent requests that fail while a refresh is already
 *    in flight, so we never fire multiple parallel refresh calls.
 *  - Logs the user out (clears the auth store) if the refresh itself fails.
 */

import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from "axios";
import { useAuthStore } from "@/stores/authStore";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

// A request config extended with a private retry flag so we don't
// attempt to refresh + retry the same request more than once.
interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

export const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ---------------------------------------------------------------------------
// Request interceptor — attach the current access token
// ---------------------------------------------------------------------------
api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// ---------------------------------------------------------------------------
// Refresh-token queueing
// ---------------------------------------------------------------------------
// While a refresh request is in flight, every other failed request waits
// on this promise instead of triggering its own refresh call.
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const { refreshToken, setTokens, logout } = useAuthStore.getState();

  if (!refreshToken) {
    logout();
    throw new Error("No refresh token available");
  }

  try {
    // Plain axios (not `api`) to avoid recursing through these interceptors.
    const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
      refreshToken,
    });

    setTokens(data.accessToken, data.refreshToken);
    return data.accessToken as string;
  } catch (err) {
    logout();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Response interceptor — refresh-and-retry on 401
// ---------------------------------------------------------------------------
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    const isUnauthorized = error.response?.status === 401;
    const alreadyRetried = originalRequest?._retry;
    const isAuthEndpoint = originalRequest?.url?.includes("/auth/");

    if (!isUnauthorized || alreadyRetried || !originalRequest || isAuthEndpoint) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      // Reuse an in-flight refresh if one is already happening.
      refreshPromise = refreshPromise ?? refreshAccessToken();
      const newAccessToken = await refreshPromise;
      refreshPromise = null;

      originalRequest.headers = originalRequest.headers ?? {};
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

      return api(originalRequest as AxiosRequestConfig);
    } catch (refreshError) {
      refreshPromise = null;
      return Promise.reject(refreshError);
    }
  }
);

export default api;
