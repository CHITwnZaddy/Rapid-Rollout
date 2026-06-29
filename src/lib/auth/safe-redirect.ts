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
