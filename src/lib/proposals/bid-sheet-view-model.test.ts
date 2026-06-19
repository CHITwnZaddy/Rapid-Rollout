import { describe, expect, it } from "vitest";
import { buildBidSheetViewModel } from "./bid-sheet-view-model";
import type { ScenarioData } from "@/lib/validation/proposal";

function scenario(overrides: Partial<ScenarioData>): ScenarioData {
  return {
    scenario_type: "P1",
    summary_total_cost: 0,
    summary_total_hours: 0,
    complexity_factor: 1,
    ...overrides,
  };
}

describe("buildBidSheetViewModel", () => {
  it("includes populated Phase 3 and Option 3 rows", () => {
    const result = buildBidSheetViewModel({
      scenarios: [
        scenario({
          scenario_type: "P3",
          summary_total_cost: 1000,
          summary_total_hours: 10,
        }),
        scenario({
          scenario_type: "Opt3",
          summary_total_cost: 500,
          summary_total_hours: 5,
          complexity_factor: 1.2,
        }),
      ],
      migrationTotal: 0,
      scopedTotal: 0,
      credit: 0,
      discountPercent: 0,
    });

    expect(result.bidLineItems).toEqual([
      {
        label: "P3",
        displayLabel: "Phase 3",
        clientPrice: 1000,
        totalHours: 10,
      },
      {
        label: "Opt3",
        displayLabel: "Option 3",
        clientPrice: 600,
        totalHours: 6,
      },
    ]);
  });

  it("keeps a scenario with cost but no hours and drops a fully empty one", () => {
    const result = buildBidSheetViewModel({
      scenarios: [
        scenario({
          scenario_type: "P1",
          summary_total_cost: 1000,
          summary_total_hours: 0,
        }),
        scenario({
          scenario_type: "P2",
          summary_total_cost: 0,
          summary_total_hours: 0,
        }),
      ],
      migrationTotal: 0,
      scopedTotal: 0,
      credit: 0,
      discountPercent: 0,
    });

    expect(result.bidLineItems).toEqual([
      { label: "P1", displayLabel: "Phase 1", clientPrice: 1000, totalHours: 0 },
    ]);
  });

  it("keeps a scenario with hours but no cost", () => {
    const result = buildBidSheetViewModel({
      scenarios: [
        scenario({
          scenario_type: "P1",
          summary_total_cost: 0,
          summary_total_hours: 8,
        }),
      ],
      migrationTotal: 0,
      scopedTotal: 0,
      credit: 0,
      discountPercent: 0,
    });

    expect(result.bidLineItems).toEqual([
      { label: "P1", displayLabel: "Phase 1", clientPrice: 0, totalHours: 8 },
    ]);
  });

  it("treats a zero complexity factor as 1", () => {
    const result = buildBidSheetViewModel({
      scenarios: [
        scenario({
          scenario_type: "P1",
          summary_total_cost: 500,
          summary_total_hours: 5,
          complexity_factor: 0,
        }),
      ],
      migrationTotal: 0,
      scopedTotal: 0,
      credit: 0,
      discountPercent: 0,
    });

    expect(result.bidLineItems).toEqual([
      { label: "P1", displayLabel: "Phase 1", clientPrice: 500, totalHours: 5 },
    ]);
  });

  it("lists scoped and migration rows when there are no scenarios", () => {
    const result = buildBidSheetViewModel({
      scenarios: [],
      migrationTotal: 2000,
      scopedTotal: 1500,
      credit: 0,
      discountPercent: 0,
    });

    expect(result.bidLineItems).toEqual([
      {
        label: "Scoped Services",
        displayLabel: "Scoped Services",
        clientPrice: 1500,
        totalHours: 0,
      },
      {
        label: "Migration Services",
        displayLabel: "Migration Services",
        clientPrice: 2000,
        totalHours: 0,
      },
    ]);
  });
});
