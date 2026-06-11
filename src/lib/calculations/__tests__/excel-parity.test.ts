/**
 * Excel-parity and round-trip fidelity tests.
 *
 * The app replicates pricing math that previously lived in Excel. These
 * tests pin canonical inputs to exact expected outputs derived from the
 * documented Excel formulas, so a future edit to the calculation engine
 * that silently breaks parity fails here instead of in a client meeting.
 *
 * NOTE: expected values are hand-computed from the Excel formula patterns
 * documented in migration-engine.ts (MAX(2, ROUNDUP(total/linesPerFile)))
 * and the confirmed discount/rounding policy. Swapping in outputs from a
 * real (anonymized) Excel proposal would strengthen these further.
 */

import { describe, expect, it } from "vitest";
import {
  calculateLineImports,
  lineItemsBoundsError,
  MAX_TOTAL_LINE_ITEMS,
} from "@/lib/calculations/migration-engine";
import { calculateProposalPricingSummary } from "@/lib/calculations/proposal-pricing";
import { calculateMarginPercent } from "@/lib/calculations/contingency-pricing";

describe("Excel parity — import calculation (MAX(2, ROUNDUP))", () => {
  it("matches Excel ROUNDUP for a partial file", () => {
    // 4,500 items / 2,000 per file = 2.25 → ROUNDUP → 3 imports × 4 hrs
    const calc = calculateLineImports(4500, 2000, 4);
    expect(calc.numImports).toBe(3);
    expect(calc.totalHours).toBe(12);
  });

  it("enforces the Excel MAX(2, …) floor for small loads", () => {
    // 100 items / 2,000 per file = 0.05 → ROUNDUP → 1, floored to 2
    const calc = calculateLineImports(100, 2000, 4);
    expect(calc.numImports).toBe(2);
    expect(calc.totalHours).toBe(8);
  });

  it("returns zero imports for zero items (IF(total=0, 0, …))", () => {
    const calc = calculateLineImports(0, 2000, 4);
    expect(calc.numImports).toBe(0);
    expect(calc.totalHours).toBe(0);
  });
});

describe("Excel parity — full proposal pricing pipeline", () => {
  it("produces exact totals for a canonical proposal", () => {
    // Scenario: $10,000 / 50 hrs at complexity 1.2 → $12,000 / 60 hrs
    // Subtotal: 12,000 + 5,000 migration + 3,000 scoped = 20,000
    // Credit $1,125 first: 18,875. Then 15%: 18,875 × 0.85 = 16,043.75
    const summary = calculateProposalPricingSummary({
      scenarios: [
        {
          summary_total_cost: 10000,
          summary_total_hours: 50,
          complexity_factor: 1.2,
        },
      ],
      migrationTotal: 5000,
      scopedTotal: 3000,
      credit: 1125,
      discountPercent: 15,
    });

    expect(summary.scenarioSubtotal).toBe(12000);
    expect(summary.proposalSubtotal).toBe(20000);
    expect(summary.pricing.afterCredit).toBe(18875);
    expect(summary.pricing.finalTotal).toBe(16043.75);
    // Hours policy: always ceil to the whole hour.
    expect(summary.totalHours).toBe(60);
  });

  it("ceils fractional client-facing hours up, never down", () => {
    // 50 hrs × 1.21 = 60.5 → 61 (estimation error lands in our favor)
    const summary = calculateProposalPricingSummary({
      scenarios: [
        {
          summary_total_cost: 10000,
          summary_total_hours: 50,
          complexity_factor: 1.21,
        },
      ],
      migrationTotal: 0,
      scopedTotal: 0,
      credit: 0,
      discountPercent: 0,
    });

    expect(summary.totalHours).toBe(61);
  });

  it("margin percent matches Excel-style 2-decimal display exactly", () => {
    // (28800 − 18900) / 28800 = 34.375% → policy rounds to 34.38
    expect(calculateMarginPercent(28800, 18900)).toBe(34.38);
    // Clean halves stay exact: (10000 − 5000) / 10000 = 50%
    expect(calculateMarginPercent(10000, 5000)).toBe(50);
  });
});

describe("migration line bounds", () => {
  it("accepts realistic volumes", () => {
    expect(lineItemsBoundsError(5000, 100)).toBeNull();
    expect(lineItemsBoundsError(0, 0)).toBeNull();
  });

  it("accepts exactly the maximum", () => {
    expect(lineItemsBoundsError(MAX_TOTAL_LINE_ITEMS, 1)).toBeNull();
  });

  it("rejects a fat-fingered quantity with a clear error", () => {
    const error = lineItemsBoundsError(10000, 10000);
    expect(error).not.toBeNull();
    expect(error).toContain("exceed the maximum");
  });

  it("treats non-finite input as zero rather than passing it through", () => {
    expect(lineItemsBoundsError(NaN, 100)).toBeNull();
    expect(lineItemsBoundsError(Infinity, 100)).toBeNull();
  });
});

describe("round-trip fidelity — save → fetch → recalculate", () => {
  // Postgres numeric columns can come back as strings through some
  // drivers, and JSON serialization is how values cross the wire. This
  // simulates that round trip and asserts the recalculated pricing
  // matches the original to the policy precision (< $0.01 / < 0.01%).
  it("pricing survives a serialization round trip without drift", () => {
    const input = {
      scenarios: [
        {
          summary_total_cost: 10333.33,
          summary_total_hours: 42.5,
          complexity_factor: 1.15,
        },
        {
          summary_total_cost: 7777.77,
          summary_total_hours: 33.25,
          complexity_factor: 1.05,
        },
      ],
      migrationTotal: 12345.67,
      scopedTotal: 999.99,
      credit: 1125,
      discountPercent: 15,
    };

    const first = calculateProposalPricingSummary(input);

    // Simulate DB round trip: JSON wire format + numeric-as-string.
    const wire = JSON.parse(JSON.stringify(input)) as typeof input;
    const refetched = {
      ...wire,
      scenarios: wire.scenarios.map((s) => ({
        summary_total_cost: String(s.summary_total_cost),
        summary_total_hours: String(s.summary_total_hours),
        complexity_factor: String(s.complexity_factor),
      })),
      migrationTotal: Number(String(wire.migrationTotal)),
      scopedTotal: Number(String(wire.scopedTotal)),
    };

    const second = calculateProposalPricingSummary(refetched);

    expect(Math.abs(second.pricing.finalTotal - first.pricing.finalTotal)).toBeLessThan(0.01);
    expect(Math.abs(second.proposalSubtotal - first.proposalSubtotal)).toBeLessThan(0.01);
    expect(second.totalHours).toBe(first.totalHours);
    // Edge values are already rounded, so the round trip is exact:
    expect(second.pricing.finalTotal).toBe(first.pricing.finalTotal);
  });
});
