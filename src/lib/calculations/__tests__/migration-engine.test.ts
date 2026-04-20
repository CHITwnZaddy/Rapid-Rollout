import { describe, it, expect } from "vitest";
import {
  calculateLineImports,
  effectiveTotalLineItems,
  calculateSectionHours,
  calculateDocumentHours,
  calculateMigrationTotals,
  computeLineHours,
  DEFAULT_PROJECT_LINES,
  DEFAULT_WORKFLOW_LINES,
  DEFAULT_COST_LINES,
  type MigrationConfig,
  type MigrationDetailLine,
} from "../migration-engine";

const baseConfig: MigrationConfig = {
  num_projects: 1,
  hrs_per_import: 4,
  lines_per_import_file: 1000,
  is_effort_included: true,
  is_workshop_included: true,
  pm_contingency_pct: 0,
  ba_complexity_factor: 1,
  pm_complexity_factor: 1,
  ba_trips: 0,
  pm_trips: 0,
  doc_avg_mb_per_project: 0,
  doc_mb_per_hour: 0,
  core_requirements_hrs: 20,
  core_migration_plan_hrs: 16,
  core_validation_hrs: 12,
  core_final_qa_hrs: 8,
  core_pm_oversight_hrs: 10,
};

const line = (
  over: Partial<MigrationDetailLine>
): MigrationDetailLine => ({
  id: "x",
  section: "project",
  label: "Test",
  quantity: 0,
  items_per_object: 0,
  total_line_items: 0,
  row_order: 0,
  ...over,
});

describe("calculateLineImports", () => {
  it("returns zero imports when total is 0", () => {
    const result = calculateLineImports(0, 1000, 4);
    expect(result.numImports).toBe(0);
    expect(result.totalHours).toBe(0);
  });

  it("enforces a minimum of 2 imports when total > 0", () => {
    const result = calculateLineImports(1, 1000, 4);
    expect(result.numImports).toBe(2);
    expect(result.totalHours).toBe(8);
  });

  it("rounds up at the lines-per-file boundary", () => {
    const result = calculateLineImports(1001, 1000, 4);
    expect(result.numImports).toBe(2);
  });

  it("rounds up partial imports", () => {
    const result = calculateLineImports(2500, 1000, 4);
    expect(result.numImports).toBe(3);
    expect(result.totalHours).toBe(12);
  });

  it("handles exact multiples", () => {
    const result = calculateLineImports(3000, 1000, 4);
    expect(result.numImports).toBe(3);
  });
});

describe("effectiveTotalLineItems", () => {
  it("project: quantity × items_per_object", () => {
    expect(
      effectiveTotalLineItems(
        line({ section: "project", quantity: 5, items_per_object: 200 })
      )
    ).toBe(1000);
  });

  it("cost: quantity × items_per_object", () => {
    expect(
      effectiveTotalLineItems(
        line({ section: "cost", quantity: 3, items_per_object: 50 })
      )
    ).toBe(150);
  });

  it("workflow: also computes quantity × items_per_object (total_line_items field is ignored)", () => {
    expect(
      effectiveTotalLineItems(
        line({
          section: "workflow",
          quantity: 4,
          items_per_object: 25,
          total_line_items: 999, // ignored
        })
      )
    ).toBe(100);
  });
});

describe("computeLineHours", () => {
  it("matches the two-step form (effectiveTotalLineItems + calculateLineImports)", () => {
    const l = line({ quantity: 5, items_per_object: 200 });
    const viaHelper = computeLineHours(l, baseConfig);
    const viaTwoStep = calculateLineImports(
      effectiveTotalLineItems(l),
      baseConfig.lines_per_import_file,
      baseConfig.hrs_per_import
    );
    expect(viaHelper).toEqual(viaTwoStep);
  });

  // Drift-prevention guarantee: the section total MUST equal the sum
  // of per-row hours. Previously these two values were computed by
  // parallel inline loops in migration-detail-section.tsx and
  // scenario-breakout-results.tsx — editing one without the other
  // would silently desync row totals from the footer. Now both go
  // through computeLineHours, so this invariant is structural.
  it("sums to exactly calculateSectionHours (no drift)", () => {
    const lines = [
      line({ quantity: 5, items_per_object: 200 }),
      line({ quantity: 10, items_per_object: 300 }),
      line({ quantity: 3, items_per_object: 150 }),
      line({ quantity: 0, items_per_object: 0 }), // empty row
    ];
    const rowSum = lines
      .map((l) => computeLineHours(l, baseConfig).totalHours)
      .reduce((a, b) => a + b, 0);
    const sectionTotal = calculateSectionHours(lines, baseConfig);
    expect(rowSum).toBe(sectionTotal);
  });
});

describe("calculateSectionHours", () => {
  it("sums hours across multiple lines", () => {
    const lines = [
      line({ section: "project", quantity: 5, items_per_object: 200 }), // 1000 → 2 imports → 8 hrs
      line({ section: "project", quantity: 10, items_per_object: 300 }), // 3000 → 3 imports → 12 hrs
    ];
    expect(calculateSectionHours(lines, baseConfig)).toBe(20);
  });

  it("returns 0 for empty section", () => {
    expect(calculateSectionHours([], baseConfig)).toBe(0);
  });
});

describe("calculateDocumentHours", () => {
  it("returns 0 when doc_mb_per_hour is 0", () => {
    expect(calculateDocumentHours({ ...baseConfig, doc_mb_per_hour: 0 })).toBe(0);
  });

  it("returns 0 when num_projects is 0", () => {
    expect(
      calculateDocumentHours({ ...baseConfig, num_projects: 0, doc_mb_per_hour: 100 })
    ).toBe(0);
  });

  it("computes (avg_mb / mb_hr) × num_projects", () => {
    expect(
      calculateDocumentHours({
        ...baseConfig,
        num_projects: 3,
        doc_avg_mb_per_project: 500,
        doc_mb_per_hour: 50,
      })
    ).toBe(30);
  });
});

describe("calculateMigrationTotals", () => {
  it("zero-everything config produces zero salesPrice and zero blended rate", () => {
    const cfg: MigrationConfig = {
      ...baseConfig,
      is_effort_included: false,
      is_workshop_included: false,
      core_requirements_hrs: 0,
      core_migration_plan_hrs: 0,
      core_validation_hrs: 0,
      core_final_qa_hrs: 0,
      core_pm_oversight_hrs: 0,
    };
    const totals = calculateMigrationTotals(cfg, [], [], [], 225, 225, 2250);
    expect(totals.salesPrice).toBe(0);
    expect(totals.totalBaHours).toBe(0);
    expect(totals.totalPmHours).toBe(0);
    expect(totals.blendedRate).toBe(0);
  });

  it("workshop toggle adds 132 BA / 8 PM raw hours", () => {
    const withWorkshop = calculateMigrationTotals(
      { ...baseConfig, is_effort_included: false },
      [],
      [],
      [],
      225,
      225,
      2250
    );
    expect(withWorkshop.workshopBaRaw).toBe(132);
    expect(withWorkshop.workshopPmRaw).toBe(8);
  });

  it("core effort toggle sums core_*_hrs into BA, PM oversight into PM", () => {
    const t = calculateMigrationTotals(
      { ...baseConfig, is_workshop_included: false },
      [],
      [],
      [],
      200,
      225,
      2000
    );
    expect(t.coreBaRaw).toBe(20 + 16 + 12 + 8); // 56
    expect(t.corePmRaw).toBe(10);
  });

  it("applies complexity factors to raw hours", () => {
    const t = calculateMigrationTotals(
      {
        ...baseConfig,
        is_workshop_included: true,
        is_effort_included: false,
        ba_complexity_factor: 1.5,
        pm_complexity_factor: 1.25,
      },
      [],
      [],
      [],
      200,
      225,
      2000
    );
    expect(t.workshopBa).toBe(132 * 1.5);
    expect(t.workshopPm).toBe(8 * 1.25);
  });

  it("computes travel hours as trips × 40 and travelExpense as (ba_trips + pm_trips) × travelCost", () => {
    const t = calculateMigrationTotals(
      {
        ...baseConfig,
        is_workshop_included: false,
        is_effort_included: false,
        ba_trips: 2,
        pm_trips: 1,
      },
      [],
      [],
      [],
      200,
      225,
      2500
    );
    expect(t.travelBaRaw).toBe(80);
    expect(t.travelPmRaw).toBe(40);
    expect(t.travelExpense).toBe(3 * 2500);
  });

  it("salesPrice = BA cost + PM cost (hourly only)", () => {
    const t = calculateMigrationTotals(
      {
        ...baseConfig,
        is_workshop_included: true,
        is_effort_included: false,
        ba_complexity_factor: 1,
        pm_complexity_factor: 1,
      },
      [],
      [],
      [],
      200,
      300,
      2000
    );
    // Workshop only: BA 132 * 200 = 26400, PM 8 * 300 = 2400
    expect(t.baCost).toBe(26400);
    expect(t.pmCost).toBe(2400);
    expect(t.salesPrice).toBe(28800);
  });

  it("blendedRate = salesPrice / totalHours", () => {
    const t = calculateMigrationTotals(
      {
        ...baseConfig,
        is_workshop_included: true,
        is_effort_included: false,
      },
      [],
      [],
      [],
      200,
      300,
      2000
    );
    const totalHours = t.totalBaHours + t.totalPmHours;
    expect(t.blendedRate).toBeCloseTo(t.salesPrice / totalHours, 6);
  });

  it("estimatedMargin is positive when blendedRate > 135", () => {
    // Workshop only: BA 132hrs @ 200 + PM 8hrs @ 300 = 28800 / 140hrs ≈ 205.7/hr
    // margin = 1 - 135/205.7 ≈ 0.344
    const t = calculateMigrationTotals(
      { ...baseConfig, is_workshop_included: true, is_effort_included: false },
      [], [], [], 200, 300, 2000
    );
    expect(t.estimatedMargin).toBeGreaterThan(0);
    expect(t.estimatedMargin).toBeCloseTo(1 - 135 / t.blendedRate, 6);
  });

  it("estimatedMargin goes negative when blendedRate < 135", () => {
    // Use a low BA rate (100) so blendedRate ends up below 135
    // Workshop: 132 BA hrs @ 100 = 13200, 8 PM hrs @ 100 = 800 → 14000 / 140 = 100/hr
    const t = calculateMigrationTotals(
      { ...baseConfig, is_workshop_included: true, is_effort_included: false },
      [], [], [], 100, 100, 2000
    );
    expect(t.blendedRate).toBeCloseTo(100, 6);
    expect(t.estimatedMargin).toBeLessThan(0); // surfaced, not clamped
  });

  it("estimatedMargin is 0 when salesPrice is 0", () => {
    const cfg: MigrationConfig = {
      ...baseConfig,
      is_effort_included: false,
      is_workshop_included: false,
      core_requirements_hrs: 0,
      core_migration_plan_hrs: 0,
      core_validation_hrs: 0,
      core_final_qa_hrs: 0,
      core_pm_oversight_hrs: 0,
    };
    const t = calculateMigrationTotals(cfg, [], [], [], 225, 225, 2250);
    expect(t.salesPrice).toBe(0);
    expect(t.estimatedMargin).toBe(0);
  });

  it("includes section line hours via detail lines", () => {
    const projectLines: MigrationDetailLine[] = [
      line({
        section: "project",
        quantity: 5,
        items_per_object: 200,
        total_line_items: 1000,
        row_order: 0,
      }),
    ];
    const t = calculateMigrationTotals(
      {
        ...baseConfig,
        is_workshop_included: false,
        is_effort_included: false,
      },
      projectLines,
      [],
      [],
      200,
      225,
      2000
    );
    // 1000 lines → 2 imports × 4 hrs = 8 raw BA hours
    expect(t.projectRaw).toBe(8);
    expect(t.totalBaHours).toBe(8);
  });
});

describe("default line presets", () => {
  it("has 2 project lines", () => {
    expect(DEFAULT_PROJECT_LINES).toHaveLength(2);
    expect(DEFAULT_PROJECT_LINES.every((l) => l.section === "project")).toBe(true);
  });

  it("has 11 workflow lines", () => {
    expect(DEFAULT_WORKFLOW_LINES).toHaveLength(11);
    expect(DEFAULT_WORKFLOW_LINES.every((l) => l.section === "workflow")).toBe(true);
  });

  it("has 9 cost lines", () => {
    expect(DEFAULT_COST_LINES).toHaveLength(9);
    expect(DEFAULT_COST_LINES.every((l) => l.section === "cost")).toBe(true);
  });
});
