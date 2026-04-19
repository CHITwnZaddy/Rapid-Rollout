import { describe, it, expect } from "vitest";
import { generateReferenceCode } from "../reference-code";

describe("generateReferenceCode", () => {
  it("matches the expected format (BASE36-SUFFIX)", () => {
    const code = generateReferenceCode();
    expect(code).toMatch(/^[0-9A-Z]+-[0-9A-Z]{3}$/);
  });

  it("produces distinct codes on back-to-back calls", () => {
    const codes = new Set(
      Array.from({ length: 50 }, () => generateReferenceCode())
    );
    // Uniqueness isn't guaranteed (3-char suffix has 46k combos) but
    // 50 calls colliding would indicate a bug.
    expect(codes.size).toBeGreaterThan(40);
  });

  it("is short enough to read aloud (<= 15 chars)", () => {
    expect(generateReferenceCode().length).toBeLessThanOrEqual(15);
  });
});
