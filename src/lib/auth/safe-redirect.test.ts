import { describe, expect, it } from "vitest";
import { sanitizeNextPath } from "@/lib/auth/safe-redirect";

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
