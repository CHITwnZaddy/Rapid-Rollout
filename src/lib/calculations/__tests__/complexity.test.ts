import { describe, it, expect } from "vitest";
import { applyComplexity } from "../complexity";

describe("applyComplexity", () => {
  it("multiplies value by factor", () => {
    expect(applyComplexity(1000, 1.15)).toBeCloseTo(1150, 6);
  });

  it("returns value unchanged when factor is 1", () => {
    expect(applyComplexity(1234.56, 1)).toBe(1234.56);
  });

  it("treats null factor as 1 (no adjustment)", () => {
    expect(applyComplexity(500, null)).toBe(500);
  });

  it("treats undefined factor as 1", () => {
    expect(applyComplexity(500, undefined)).toBe(500);
  });

  it("treats NaN value as 0", () => {
    expect(applyComplexity(NaN, 1.5)).toBe(0);
  });

  it("treats NaN factor as 1", () => {
    expect(applyComplexity(100, NaN)).toBe(100);
  });

  it("handles zero correctly", () => {
    expect(applyComplexity(0, 1.5)).toBe(0);
    expect(applyComplexity(100, 0.5)).toBe(50);
  });
});
