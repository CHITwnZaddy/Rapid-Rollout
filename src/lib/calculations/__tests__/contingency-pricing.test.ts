import { describe, expect, it } from "vitest";
import {
  allocateDiscountedMarginPercent,
  calculateRolePricingBreakouts,
  sumContingencyBreakouts,
} from "../contingency-pricing";

describe("contingency pricing", () => {
  it("CF 1.00 produces zero contingency and keeps client price at base cost", () => {
    const rows = calculateRolePricingBreakouts(
      [{ role: "srIm", label: "Sr. IM", baseHours: 100, rate: 200 }],
      1,
      135
    );
    const summary = sumContingencyBreakouts(rows);

    expect(summary.baseHours).toBe(100);
    expect(summary.contingencyHours).toBe(0);
    expect(summary.clientPrice).toBe(20000);
    expect(summary.internalCost).toBe(13500);
  });

  it("CF 1.25 increases client price while internal cost stays on base hours", () => {
    const rows = calculateRolePricingBreakouts(
      [
        { role: "srIm", label: "Sr. IM", baseHours: 400, rate: 200 },
        { role: "pm", label: "PM", baseHours: 30, rate: 200 },
      ],
      1.25,
      135
    );
    const summary = sumContingencyBreakouts(rows);

    expect(summary.baseHours).toBe(430);
    expect(summary.contingencyHours).toBe(107.5);
    expect(summary.baseCost).toBe(86000);
    expect(summary.contingencyCost).toBe(21500);
    expect(summary.clientPrice).toBe(107500);
    expect(summary.internalCost).toBe(58050);
    expect(summary.marginPercent).toBeCloseTo(46, 0);
  });

  it("discounted margin uses final allocated revenue, not list client price", () => {
    expect(allocateDiscountedMarginPercent(90000, 58050)).toBeCloseTo(
      35.5,
      1
    );
  });
});
