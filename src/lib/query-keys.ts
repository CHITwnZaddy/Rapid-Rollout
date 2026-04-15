// ─────────────────────────────────────────────────────────────
// TanStack Query keys + stale-time convention
// ─────────────────────────────────────────────────────────────
// Phase 2.6 — the global default staleTime in providers.tsx is
// 60 seconds, which is fine for per-proposal data but wasteful
// for lookup tables (rate_cards, service_hours, customers) that
// rarely change. Rather than touch the global default and break
// every callsite, this file:
//
//   1. Defines the canonical query-key factories so cache
//      invalidation stays consistent across the app.
//   2. Exports recommended staleTime values per data class.
//      Callers should spread these into their useQuery options:
//
//        useQuery({
//          queryKey: queryKeys.rateCards.list(),
//          queryFn: () => fetchRateCards(),
//          ...queryDefaults.lookup,
//        });
//
// NOTE: as of Phase 2.6 this file has no consumers — the app
// currently does raw Supabase calls without TanStack Query.
// When you migrate a page to useQuery, start by picking a key
// factory from here and applying the matching defaults.
// ─────────────────────────────────────────────────────────────

export const queryKeys = {
  // Lookup tables — change rarely, refreshed by admin action.
  rateCards: {
    all: ["rate_cards"] as const,
    list: () => [...queryKeys.rateCards.all, "list"] as const,
    byKey: (lookupKey: string) =>
      [...queryKeys.rateCards.all, "key", lookupKey] as const,
  },
  serviceHours: {
    all: ["service_hours"] as const,
    list: () => [...queryKeys.serviceHours.all, "list"] as const,
  },
  customers: {
    all: ["customers"] as const,
    list: () => [...queryKeys.customers.all, "list"] as const,
  },

  // Per-user / per-proposal data — changes frequently.
  proposals: {
    all: ["proposals"] as const,
    list: (filter?: string) =>
      [...queryKeys.proposals.all, "list", filter ?? "all"] as const,
    detail: (id: string) =>
      [...queryKeys.proposals.all, "detail", id] as const,
  },
  dashboard: {
    counts: () => ["dashboard", "counts"] as const,
  },
  changeLog: {
    all: ["change_log"] as const,
    list: () => [...queryKeys.changeLog.all, "list"] as const,
  },
} as const;

// Recommended staleTime per data class, in milliseconds.
// Spread these into useQuery options rather than hard-coding.
export const queryDefaults = {
  // Lookup tables: refresh every 5 minutes. Admins updating a
  // rate card can still force a refetch via invalidateQueries.
  lookup: {
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  },
  // User's own proposals: inherit the 60s global default, but
  // make the contract explicit so we don't silently change if
  // someone tweaks the global.
  proposals: {
    staleTime: 60 * 1000,
  },
  // Dashboard counts: refresh every 30 seconds so a newly
  // created proposal shows up promptly.
  dashboardCounts: {
    staleTime: 30 * 1000,
  },
  // Change log: very hot, refresh every 10 seconds.
  changeLog: {
    staleTime: 10 * 1000,
  },
} as const;
