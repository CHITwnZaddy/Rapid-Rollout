// Guards the `next` query param on the auth confirm route against
// open-redirect abuse. Only same-origin, non-protocol-relative paths are
// allowed; anything else (absolute URLs, protocol-relative "//evil.com",
// missing values) falls back to the dashboard.
const DEFAULT_DESTINATION = "/dashboard";

export function sanitizeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_DESTINATION;
  }
  return value;
}

// Appends a query parameter to an internal path, preserving any existing query
// string and fragment. Used by the auth confirm action to carry the OTP type
// through to the destination (e.g. /set-password?mode=recovery) so the landing
// page's copy matches the journey the user is actually on.
export function withParam(path: string, key: string, value: string): string {
  const hashIndex = path.indexOf("#");
  const base = hashIndex === -1 ? path : path.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : path.slice(hashIndex);
  const separator = base.includes("?") ? "&" : "?";
  const param = `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;

  return `${base}${separator}${param}${hash}`;
}
