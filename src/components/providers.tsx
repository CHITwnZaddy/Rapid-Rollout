"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      // Global default staleTime is 60s — a conservative mid-
      // point for per-user / per-proposal data. Per-class
      // overrides (lookup tables, dashboard counts, change log)
      // live in src/lib/query-keys.ts under `queryDefaults` and
      // should be spread into individual useQuery calls.
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
