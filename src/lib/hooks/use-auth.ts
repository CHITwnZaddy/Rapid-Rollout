"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  isAdminRole,
  isManagerOrAdminRole,
  isManagerRole,
} from "@/lib/auth/roles";
import type { User } from "@supabase/supabase-js";

/**
 * useAuth — client-side session hook.
 *
 * Returns the current user, a loading flag, role convenience booleans, and a
 * `signOut` helper.
 *
 * ⚠️ SECURITY CONTRACT — read before using `isAdmin`.
 *
 * Role booleans are **NOT a security boundary**. They are UI-only, derived from the
 * client-held JWT's `app_metadata` and is:
 *   - `false` while `loading` is `true` (first paint treats every admin as
 *     a non-admin until the session resolves).
 *   - potentially stale — a JWT minted before a role change still reports
 *     the old role until the token refreshes.
 *
 * Client components that gate role-specific UI **MUST** go through
 * `useRequireAdmin()` or `useRequireManagerOrAdmin()` instead of reading these
 * booleans directly.
 *
 * The real admin boundary lives on the server: the `(app)/admin` route
 * layout calls `supabase.auth.getUser()` + role check, and every sensitive
 * server action re-checks authorization. The client booleans exist only so
 * top-level nav can decide whether to render role-specific links.
 *
 * If you only need to show/hide a nav item or similar cosmetic element,
 * prefer the role gate hooks anyway for the loading-state handling.
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

  const role = user?.app_metadata?.role;
  const isAdmin = isAdminRole(role);
  const isManager = isManagerRole(role);
  const isManagerOrAdmin = isManagerOrAdminRole(role);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return { user, loading, role, isAdmin, isManager, isManagerOrAdmin, signOut };
}
