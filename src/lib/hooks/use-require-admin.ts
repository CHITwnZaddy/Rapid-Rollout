"use client";

import { useAuth } from "./use-auth";

/**
 * useRequireAdmin — the canonical client-side admin gate.
 *
 * Returns a discriminated union of `{ status: "loading" | "admin" | "denied" }`.
 *
 * ⚠️ SECURITY CONTRACT — read before using this hook.
 *
 * This hook is **NOT a security boundary**. It reads `useAuth().isAdmin`,
 * which is derived from the client-held JWT's `app_metadata.role` — a value
 * the client cannot be trusted to report honestly. The server is the only
 * trust boundary:
 *
 *   1. `/app/(app)/admin/layout.tsx` calls `supabase.auth.getUser()` and
 *      redirects non-admins before any admin page renders.
 *   2. Every admin server action calls `assertAuthenticatedAdmin()` (or
 *      relies on RLS policies that check the role claim).
 *
 * What this hook IS: the right way to gate admin-only UI inside a page that
 * is NOT itself admin-gated (e.g. a "Rate Cards" button on a shared page,
 * or the "Admin" section in the main nav sidebar). It prevents two bugs:
 *
 *   - flashing non-admin UI to a real admin while `loading` is true
 *     (the `"loading"` branch lets you render a skeleton instead).
 *   - treating a naked `isAdmin: false` during loading as "denied" and
 *     committing to the wrong UI before the session resolves.
 *
 * **All client components that render admin-only UI MUST use this hook
 * instead of reading `useAuth().isAdmin` directly.** The underlying boolean
 * is kept on `useAuth` only because removing it would be a breaking change;
 * treat it as an implementation detail of this hook.
 */

export type RequireAdminStatus =
  | { status: "loading" }
  | { status: "admin" }
  | { status: "denied" };

export function useRequireAdmin(): RequireAdminStatus {
  const { loading, isAdmin } = useAuth();
  if (loading) return { status: "loading" };
  return isAdmin ? { status: "admin" } : { status: "denied" };
}

export type RequireManagerOrAdminStatus =
  | { status: "loading" }
  | { status: "manager" | "admin" }
  | { status: "denied" };

export function useRequireManagerOrAdmin(): RequireManagerOrAdminStatus {
  const { loading, role, isManagerOrAdmin } = useAuth();
  if (loading) return { status: "loading" };
  if (!isManagerOrAdmin) return { status: "denied" };
  return { status: role === "admin" ? "admin" : "manager" };
}
