import { describe, expect, it } from "vitest";
import { sanitizeNextPath, withParam } from "@/lib/auth/safe-redirect";

describe("sanitizeNextPath", () => {
  it("allows same-origin relative paths", () => {
    expect(sanitizeNextPath("/set-password")).toBe("/set-password");
    expect(sanitizeNextPath("/proposals/123")).toBe("/proposals/123");
  });

  it("falls back to /dashboard for empty values", () => {
    expect(sanitizeNextPath(null)).toBe("/dashboard");
    expect(sanitizeNextPath(undefined)).toBe("/dashboard");
    expect(sanitizeNextPath("")).toBe("/dashboard");
  });

  it("rejects absolute URLs (open-redirect protection)", () => {
    expect(sanitizeNextPath("https://evil.com")).toBe("/dashboard");
    expect(sanitizeNextPath("http://evil.com/path")).toBe("/dashboard");
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeNextPath("//evil.com")).toBe("/dashboard");
    expect(sanitizeNextPath("//evil.com/set-password")).toBe("/dashboard");
  });

  it("rejects non-rooted paths", () => {
    expect(sanitizeNextPath("dashboard")).toBe("/dashboard");
    expect(sanitizeNextPath("javascript:alert(1)")).toBe("/dashboard");
  });
});

describe("withParam", () => {
  it("appends with ? when the path has no query string", () => {
    expect(withParam("/set-password", "mode", "recovery")).toBe(
      "/set-password?mode=recovery"
    );
  });

  it("appends with & when a query string already exists", () => {
    expect(withParam("/set-password?next=/x", "mode", "recovery")).toBe(
      "/set-password?next=/x&mode=recovery"
    );
  });

  it("keeps the fragment at the end", () => {
    expect(withParam("/set-password#form", "mode", "recovery")).toBe(
      "/set-password?mode=recovery#form"
    );
    expect(withParam("/set-password?a=1#form", "mode", "recovery")).toBe(
      "/set-password?a=1&mode=recovery#form"
    );
  });

  it("URL-encodes the key and value", () => {
    expect(withParam("/auth-error", "type", "email_change")).toBe(
      "/auth-error?type=email_change"
    );
    expect(withParam("/auth-error", "type", "a b&c=d")).toBe(
      "/auth-error?type=a%20b%26c%3Dd"
    );
  });
});
