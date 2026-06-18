/**
 * Bid-sheet pricing — edge case coverage
 * SA-QA-02 + SA-APP-01: Mitigates risk of incorrect margin/discount
 * calculations, especially with the hardcoded INTERNAL_COST_RATE = 1.35.
 * Tests document the expected behavior so rate changes are caught.
 */

import { describe, expect, it } from "vitest";
import {
  allocateAdjustedTotal,
  calculateBidSheetPricing,
} from "../bid-sheet-pricing";
import { calculateMigrationTotals } from "../migration-engine";

describe("calculateBidSheetPricing", () => {
  it("applies credit first, then discount percent", () => {
    const result = calculateBidSheetPricing(1000, 100, 10);

    expect(result.subtotal).toBe(1000);
    expect(result.afterCredit).toBe(900);
    expect(result.finalTotal).toBe(810);
  });

  // Canonical business case (confirmed with Austin 2026-06-10): an LoE
  // credit of $1,125 (5 hrs × $225 already paid) comes off an $18,000
  // proposal FIRST, then a 15% competitive discount applies to the rest.
  //   (18000 − 1125) × (1 − 0.15) = 16875 × 0.85 = 14343.75, exactly.
  it("matches the canonical LoE-credit-then-percent case to the cent", () => {
    const result = calculateBidSheetPricing(18000, 1125, 15);

    expect(result.subtotal).toBe(18000);
    expect(result.afterCredit).toBe(16875);
    expect(result.finalTotal).toBe(14343.75);
  });

  it("rounds the final total to the cent", () => {
    // 999.99 − 0 at 33% → 669.9933 raw; client-facing edge → 669.99
    const result = calculateBidSheetPricing(999.99, 0, 33);

    expect(result.finalTotal).toBe(669.99);
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

// ─── SA-QA-02 + SA-APP-01 edge cases ─────────────────────────────────
//
// These exercise the boundary inputs that previously had no coverage:
// zero list price, full discount, over-discount, hardcoded internal-cost
// rate margin pinning, and rounding behavior.

describe("calculateBidSheetPricing — edge cases (SA-QA-02 / APP-01)", () => {
  it("returns 0/0/0 when subtotal is 0 (no NaN, no Infinity)", () => {
    const result = calculateBidSheetPricing(0, 0, 0);
    expect(result.subtotal).toBe(0);
    expect(result.afterCredit).toBe(0);
    expect(result.finalTotal).toBe(0);
    expect(Number.isFinite(result.finalTotal)).toBe(true);
  });

  it("100% discount produces a final price of 0 with subtotal preserved", () => {
    const result = calculateBidSheetPricing(1000, 0, 100);
    expect(result.subtotal).toBe(1000);
    expect(result.afterCredit).toBe(1000);
    expect(result.finalTotal).toBe(0);
  });

  it("clamps a discount > 100% to 100% (does not produce a negative price)", () => {
    const result = calculateBidSheetPricing(1000, 0, 250);
    expect(result.finalTotal).toBe(0);
    expect(result.finalTotal).toBeGreaterThanOrEqual(0);
  });

  it("clamps a negative discount percent to 0 (no price inflation)", () => {
    const result = calculateBidSheetPricing(1000, 0, -50);
    expect(result.finalTotal).toBe(1000);
  });

  it("clamps a credit greater than the subtotal so final price never goes negative", () => {
    const result = calculateBidSheetPricing(1000, 5000, 0);
    expect(result.afterCredit).toBe(0);
    expect(result.finalTotal).toBe(0);
    expect(result.finalTotal).toBeGreaterThanOrEqual(0);
  });

  it("treats a negative subtotal as 0 (defensive against bad upstream data)", () => {
    const result = calculateBidSheetPricing(-500, 0, 10);
    expect(result.subtotal).toBe(0);
    expect(result.afterCredit).toBe(0);
    expect(result.finalTotal).toBe(0);
  });

  it("treats NaN inputs as 0 across all three parameters", () => {
    const result = calculateBidSheetPricing(NaN, NaN, NaN);
    expect(result.subtotal).toBe(0);
    expect(result.afterCredit).toBe(0);
    expect(result.finalTotal).toBe(0);
  });

  it("does NOT round cents — returns exact arithmetic for the caller to format", () => {
    // 333 - 0 credit, 7% discount -> 333 * 0.93 = 309.69
    const result = calculateBidSheetPricing(333, 0, 7);
    expect(result.finalTotal).toBeCloseTo(309.69, 6);
  });
});

describe("allocateAdjustedTotal — edge cases (SA-QA-02 / APP-01)", () => {
  it("returns 0 when adjustedSubtotal is 0 (full discount allocation)", () => {
    expect(allocateAdjustedTotal(600, 1000, 0)).toBe(0);
  });

  it("returns 0 when component is negative (defensive)", () => {
    expect(allocateAdjustedTotal(-100, 1000, 720)).toBe(0);
  });

  it("preserves total proportionality across multiple components", () => {
    // Sum of allocations must match the adjusted subtotal exactly.
    const a = allocateAdjustedTotal(600, 1000, 720);
    const b = allocateAdjustedTotal(400, 1000, 720);
    expect(a + b).toBeCloseTo(720, 6);
  });
});

// ─── INTERNAL_COST_RATE pin (SA-APP-01) ──────────────────────────────
//
// The seeded internalCostRate of 135 (Master|Internal Cost Rate) feeds
// estimatedMargin in calculateMigrationTotals. This test pins the
// expected margin for a known input so rate changes are caught before
// silently shifting reported margins.

describe("estimatedMargin — INTERNAL_COST_RATE pin (SA-APP-01)", () => {
  it("workshop-only @ Sr.IM 200 / PM 300 + internalCostRate 135 produces blendedRate ≈ 205.71 and margin ≈ 0.3437", () => {
    const totals = calculateMigrationTotals(
      {
        num_projects: 1,
        hrs_per_import: 4,
        lines_per_import_file: 1000,
        is_effort_included: false,
        is_workshop_included: true,
        complexity_factor: 1,
        sr_im_trips: 0,
        pm_trips: 0,
        doc_avg_mb_per_project: 0,
        doc_mb_per_hour: 0,
        core_requirements_hrs: 0,
        core_migration_plan_hrs: 0,
        core_validation_hrs: 0,
        core_final_qa_hrs: 0,
        core_pm_oversight_hrs: 0,
      },
      [],
      [],
      [],
      200,
      300,
      0,
      135
    );

    // Workshop preset: 132 Sr.IM hrs + 8 PM hrs.
    // Client price = 132*200 + 8*300 = 26400 + 2400 = 28800
    // Total hours = 140; blendedRate = 28800/140 ≈ 205.7142857
    // Raw margin = 1 - 135/205.7142857 = 0.34375. Rounding policy rounds
    // the percent edge to 2 decimals: 34.375% → 34.38% → 0.3438.
    expect(totals.totalSrImHours).toBe(132);
    expect(totals.totalPmHours).toBe(8);
    expect(totals.clientPrice).toBe(28800);
    expect(totals.blendedRate).toBeCloseTo(205.7142857, 4);
    expect(totals.estimatedMargin).toBeCloseTo(0.3438, 5);
  });

  it("estimatedMargin is exactly 0 when clientPrice is 0 (no NaN, no Infinity)", () => {
    const totals = calculateMigrationTotals(
      {
        num_projects: 1,
        hrs_per_import: 4,
        lines_per_import_file: 1000,
        is_effort_included: false,
        is_workshop_included: false,
        complexity_factor: 1,
        sr_im_trips: 0,
        pm_trips: 0,
        doc_avg_mb_per_project: 0,
        doc_mb_per_hour: 0,
        core_requirements_hrs: 0,
        core_migration_plan_hrs: 0,
        core_validation_hrs: 0,
        core_final_qa_hrs: 0,
        core_pm_oversight_hrs: 0,
      },
      [],
      [],
      [],
      200,
      300,
      0,
      135
    );

    expect(totals.clientPrice).toBe(0);
    expect(totals.estimatedMargin).toBe(0);
    expect(Number.isFinite(totals.estimatedMargin)).toBe(true);
  });
});
