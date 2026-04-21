import { describe, expect, it } from "vitest";
import {
  allocateAdjustedTotal,
  calculateBidSheetPricing,
} from "../bid-sheet-pricing";

describe("calculateBidSheetPricing", () => {
  it("applies credit first, then discount percent", () => {
    const result = calculateBidSheetPricing(1000, 100, 10);

    expect(result.subtotal).toBe(1000);
    expect(result.afterCredit).toBe(900);
    expect(result.finalTotal).toBe(810);
  });

  it("skips the credit effect when credit is zero", () => {
    const result = calculateBidSheetPricing(1000, 0, 10);

    expect(result.afterCredit).toBe(1000);
    expect(result.finalTotal).toBe(900);
  });

  it("never lets credit push the total below zero", () => {
    const result = calculateBidSheetPricing(1000, 2500, 10);

    expect(result.afterCredit).toBe(0);
    expect(result.finalTotal).toBe(0);
  });
});

describe("allocateAdjustedTotal", () => {
  it("allocates the adjusted subtotal proportionally across components", () => {
    expect(allocateAdjustedTotal(600, 1000, 720)).toBe(432);
    expect(allocateAdjustedTotal(400, 1000, 720)).toBe(288);
  });

  it("returns zero when subtotal or component is zero", () => {
    expect(allocateAdjustedTotal(0, 1000, 720)).toBe(0);
    expect(allocateAdjustedTotal(100, 0, 720)).toBe(0);
  });
});
