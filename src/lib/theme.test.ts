import { describe, expect, it } from "vitest";
import { resolveSafeFont } from "@/lib/theme";

describe("resolveSafeFont", () => {
  it("returns null for empty, null, or undefined values", () => {
    expect(resolveSafeFont(undefined)).toBeNull();
    expect(resolveSafeFont(null)).toBeNull();
    expect(resolveSafeFont("")).toBeNull();
  });

  it("returns null for the 'default' sentinel (no custom font applied)", () => {
    expect(resolveSafeFont("default")).toBeNull();
  });

  it("returns the font value for an allowlisted option", () => {
    expect(resolveSafeFont("Inter")).toBe("Inter");
    expect(resolveSafeFont("Open Sans")).toBe("Open Sans");
    expect(resolveSafeFont("Plus Jakarta Sans")).toBe("Plus Jakarta Sans");
  });

  it("returns null for a value that is not in the allowlist", () => {
    expect(resolveSafeFont("Comic Sans")).toBeNull();
    expect(resolveSafeFont("inter")).toBeNull();
  });

  it("rejects style-injection payloads so they never reach the inline <style>", () => {
    const payload = 'Inter";}</style><script>alert(1)</script><style>';
    expect(resolveSafeFont(payload)).toBeNull();
    expect(resolveSafeFont('";}body{display:none}')).toBeNull();
  });
});
