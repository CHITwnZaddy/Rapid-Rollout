// Route classification for the Next 16 proxy (src/proxy.ts -> updateSession).
//
// Deliberately free of imports and module state: the proxy is invoked
// separately from render code and may be deployed to a CDN, so it must not
// rely on shared or mutable globals.
//
// These are EXACT matches, not prefixes. The previous inline check used
// `pathname.startsWith("/auth")`, which left /auth-error public only by
// accident and would have exempted any future path starting with the literal
// "auth" (e.g. /authors/1). Exact matching makes the public surface explicit
// and means new routes are protected by default. Next normalizes trailing
// slashes before the proxy runs, so "/login/" arrives here as "/login".

// Reachable without a session.
//   /                a redirect shim that routes to /dashboard or /login
//   /login           credentials sign-in
//   /forgot-password requests a recovery email
//   /auth/confirm    verifies invite/recovery OTPs; the user has no session
//                    until verifyOtp runs, so it cannot require one
//   /auth-error      reports a failed verification
//
// /set-password is intentionally NOT here. It is reached only after
// /auth/confirm has established a session, and keeping it protected means a
// session-less visitor is bounced to /login rather than shown a dead form.
export const PUBLIC_PATHS = [
  "/",
  "/login",
  "/forgot-password",
  "/auth/confirm",
  "/auth-error",
] as const;

// Signed-in users are sent to the dashboard instead of seeing these.
//
// NEVER add "/auth/confirm" — or any /auth path — to this list. A user who is
// already signed in on this browser and clicks a recovery or invite link (the
// common case, not an edge case) would be redirected away before verifyOtp
// could run, and the single-use token would burn on their next click.
export const AUTHENTICATED_REDIRECT_PATHS = [
  "/login",
  "/forgot-password",
] as const;

export function isPublicPath(pathname: string): boolean {
  return (PUBLIC_PATHS as readonly string[]).includes(pathname);
}

export function isAuthenticatedRedirectPath(pathname: string): boolean {
  return (AUTHENTICATED_REDIRECT_PATHS as readonly string[]).includes(pathname);
}
