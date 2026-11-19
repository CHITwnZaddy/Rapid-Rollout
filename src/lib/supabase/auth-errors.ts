import { isAuthSessionMissingError } from "@supabase/supabase-js";

/**
 * Whether an error from `supabase.auth.getUser()` is worth logging.
 *
 * A visitor with no session cookie gets `AuthSessionMissingError` ("Auth
 * session missing!"). That is the normal signed-out state, handled by the
 * redirect to /login, so logging it only buries real auth failures in the
 * runtime error feed. Every other auth error is still logged.
 */
export function shouldLogAuthError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  return !isAuthSessionMissingError(error);
}
