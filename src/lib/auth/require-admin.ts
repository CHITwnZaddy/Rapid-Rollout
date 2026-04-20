import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

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

/**
 * Assert the caller is an admin. Throws AuthError otherwise.
 * Use in any server action that performs an admin-only operation
 * (user management, rate card changes, etc.).
 */
export async function assertAdmin(): Promise<User> {
  const user = await assertAuthenticated();
  if (user.app_metadata?.role !== "admin") {
    throw new AuthError("FORBIDDEN", "Admin access required.");
  }
  return user;
}
