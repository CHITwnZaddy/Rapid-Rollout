import { describe, expect, it } from "vitest";
import { calculateProposalPricingSummary } from "../proposal-pricing";

describe("calculateProposalPricingSummary", () => {
  it("includes scenario, migration, and scoped totals before applying credit and discount", () => {
    const result = calculateProposalPricingSummary({
      scenarios: [
        {
          summary_total_cost: 1000,
          summary_total_hours: 10,
          complexity_factor: 1.5,
        },
        {
          summary_total_cost: 500,
          summary_total_hours: 5,
          complexity_factor: 1,
        },
      ],
      migrationTotal: 400,
      scopedTotal: 100,
      credit: 200,
      discountPercent: 10,
    });

    expect(result.scenarioSubtotal).toBe(2000);
    expect(result.totalHours).toBe(20);
    expect(result.proposalSubtotal).toBe(2500);
    expect(result.pricing.afterCredit).toBe(2300);
    expect(result.pricing.finalTotal).toBe(2070);
  });

  it("skips directly to discount math when credit is zero", () => {
    const result = calculateProposalPricingSummary({
      scenarios: [
        {
          summary_total_cost: 800,
          summary_total_hours: 8,
          complexity_factor: 1,
        },
      ],
      migrationTotal: 200,
      scopedTotal: 0,
      credit: 0,
      discountPercent: 25,
    });

    expect(result.proposalSubtotal).toBe(1000);
    expect(result.pricing.afterCredit).toBe(1000);
    expect(result.pricing.finalTotal).toBe(750);
  });

  it("never returns negative totals when credit exceeds the full proposal subtotal", () => {
    const result = calculateProposalPricingSummary({
      scenarios: [
        {
          summary_total_cost: 200,
          summary_total_hours: 2,
          complexity_factor: 1,
        },
      ],
      migrationTotal: 50,
      scopedTotal: 25,
      credit: 500,
      discountPercent: 15,
    });

    expect(result.proposalSubtotal).toBe(275);
    expect(result.pricing.afterCredit).toBe(0);
    expect(result.pricing.finalTotal).toBe(0);
  });
});
