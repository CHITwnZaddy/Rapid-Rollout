"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

/**
 * useAuth — client-side session hook.
 *
 * Returns the current user, a loading flag, an `isAdmin` convenience boolean
 * (derived from `user.app_metadata.role === "admin"`), and a `signOut` helper.
 *
 * ⚠️ SECURITY CONTRACT — read before using `isAdmin`.
 *
 * `isAdmin` is **NOT a security boundary**. It is UI-only, derived from the
 * client-held JWT's `app_metadata` and is:
 *   - `false` while `loading` is `true` (first paint treats every admin as
 *     a non-admin until the session resolves).
 *   - potentially stale — a JWT minted before a role change still reports
 *     the old role until the token refreshes.
 *
 * Client components that gate admin-only UI **MUST** go through
 * `useRequireAdmin()` instead of reading this `isAdmin` directly. That hook
 * returns a discriminated `{ status: "loading" | "admin" | "denied" }` so
 * consumers cannot accidentally treat "loading" as "denied" (flashing the
 * non-admin UI to a real admin) or as "admin" (briefly rendering admin UI
 * to a non-admin).
 *
 * The real admin boundary lives on the server: the `(app)/admin` route
 * layout calls `supabase.auth.getUser()` + role check, and every admin
 * server action calls `assertAuthenticatedAdmin()`. The client `isAdmin`
 * exists only so top-level nav can decide whether to render the "Admin"
 * section link — an attacker who forges it sees UI, not data.
 *
 * If you only need to show/hide a nav item or similar cosmetic element,
 * prefer `useRequireAdmin()` anyway for the loading-state handling.
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // createClient() returns @supabase/ssr's browser-client singleton, but the
  // local reference is new each render — useMemo pins it so effects with
  // `[supabase.auth]` in their deps don't re-subscribe on every render.
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const isAdmin = user?.app_metadata?.role === "admin";

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return { user, loading, isAdmin, signOut };
}
