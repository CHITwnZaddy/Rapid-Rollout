"use client";

import { useAuth } from "./use-auth";

// ─────────────────────────────────────────────────────────────
// useRequireAdmin — loading-aware admin gate
// ─────────────────────────────────────────────────────────────
// Phase 1.7 — `useAuth()` starts with `loading: true` but exposes
// `isAdmin: false` immediately. If a component destructures
// `isAdmin` without also checking `loading`, the first paint
// treats every real admin as a non-admin until the auth check
// finishes. On the migration page this briefly hid the rate
// editor from admins and flashed "(admin only)" before settling.
//
// This hook forces consumers to handle the loading branch by
// returning a discriminated status rather than a naked boolean.
// Use it wherever an admin-only UI element lives inside a
// non-admin-gated page.
// ─────────────────────────────────────────────────────────────

export type RequireAdminStatus =
  | { status: "loading" }
  | { status: "admin" }
  | { status: "denied" };

export function useRequireAdmin(): RequireAdminStatus {
  const { loading, isAdmin } = useAuth();
  if (loading) return { status: "loading" };
  return isAdmin ? { status: "admin" } : { status: "denied" };
}
