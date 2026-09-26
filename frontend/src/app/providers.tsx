"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Don't hammer an endpoint that's already rate-limited (429) or
            // unauthenticated (401, handled separately by the axios
            // refresh-and-retry interceptor) — retrying those immediately
            // just extends the problem instead of recovering from it.
            retry: (failureCount, error) => {
              const status = (error as { response?: { status?: number } })
                ?.response?.status;
              if (status === 429 || status === 401) return false;
              return failureCount < 2;
            },
            // Every window focus re-fetching every active query (on top of
            // notifications' own 15s poll) adds up fast — off by default,
            // turn back on per-query where it's actually needed.
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}