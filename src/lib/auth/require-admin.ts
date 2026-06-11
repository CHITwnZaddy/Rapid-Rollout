import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { isAdminRole, isManagerOrAdminRole } from "./roles";

// ─────────────────────────────────────────────────────────────
// Server-side authorization helpers for server actions
// ─────────────────────────────────────────────────────────────
// Server actions are directly-callable RPC endpoints. Route-level
// gates like app/(app)/admin/layout.tsx only hide the UI; they do
// not prevent a caller who knows the action's module path from
// invoking it. Every sensitive server action must re-verify the
// caller's identity and authorization here, *inside* the action.
//
// Role is read from the Supabase user's app_metadata.role, which
// matches the client-side useAuth() contract. app_metadata is
// tamper-proof from the client (only the service-role key can
// write to it), so a compromised session cannot self-promote.
// ─────────────────────────────────────────────────────────────

export class AuthError extends Error {
  readonly code: "UNAUTHENTICATED" | "FORBIDDEN";
  constructor(code: "UNAUTHENTICATED" | "FORBIDDEN", message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

/**
 * Assert the caller has a valid session. Throws AuthError otherwise.
 * Use in any server action that must run as an authenticated user.
 */
export async function assertAuthenticated(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthError("UNAUTHENTICATED", "You must be signed in.");
  }
  return user;
}

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

/**
 * Result-object variant of assertAuthenticated for server actions that
 * use the `{ ok, error }` contract. Never throws: AuthError becomes the
 * caller-supplied message, anything unexpected is logged and returned
 * as a generic failure instead of crashing the client component.
 */
export async function requireAuthenticatedResult(
  message: string
): Promise<AuthResult> {
  try {
    return { ok: true, user: await assertAuthenticated() };
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: message };
    }
    console.error("Unexpected error during auth check:", error);
    return {
      ok: false,
      error: "Something went wrong verifying your session. Please refresh and try again.",
    };
  }
}

/**
 * Assert the caller is an admin. Throws AuthError otherwise.
 * Use in any server action that performs an admin-only operation
 * (user management, rate card changes, etc.).
 */
export async function assertAdmin(): Promise<User> {
  const user = await assertAuthenticated();
  if (!isAdminRole(user.app_metadata?.role)) {
    throw new AuthError("FORBIDDEN", "Admin access required.");
  }
  return user;
}

/**
 * Result-object variant of assertManagerOrAdmin. Never throws; the
 * AuthError's own message ("You must be signed in." / "Manager or
 * admin access required.") is returned as the error string.
 */
export async function requireManagerOrAdminResult(): Promise<AuthResult> {
  try {
    return { ok: true, user: await assertManagerOrAdmin() };
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: error.message };
    }
    console.error("Unexpected error during auth check:", error);
    return {
      ok: false,
      error: "Something went wrong verifying your session. Please refresh and try again.",
    };
  }
}

/**
 * Assert the caller is a manager or admin. Throws AuthError otherwise.
 * Use for SE operations settings such as KPI targets, stale thresholds,
 * variance reasons, and manager-visible audit surfaces.
 */
export async function assertManagerOrAdmin(): Promise<User> {
  const user = await assertAuthenticated();
  if (!isManagerOrAdminRole(user.app_metadata?.role)) {
    throw new AuthError("FORBIDDEN", "Manager or admin access required.");
  }
  return user;
}
