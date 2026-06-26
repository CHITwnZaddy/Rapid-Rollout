import { describe, expect, it } from "vitest";
import { formatMarginPercent } from "../helpers";

describe("formatMarginPercent", () => {
  it("renders a dash for null or undefined margin", () => {
    expect(formatMarginPercent(null)).toBe("—");
    expect(formatMarginPercent(undefined)).toBe("—");
  });

  it("formats to two decimals by default", () => {
    expect(formatMarginPercent(42.5)).toBe("42.50%");
  });

  it("respects a custom precision", () => {
    expect(formatMarginPercent(42.567, 1)).toBe("42.6%");
  });
});
