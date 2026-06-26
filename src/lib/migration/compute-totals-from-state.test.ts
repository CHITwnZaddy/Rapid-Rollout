import { describe, expect, it } from "vitest";
import {
  computeMigrationTotalsFromState,
  computeProposalMigrationTotal,
  type MigrationConfigState,
  type MigrationLineState,
} from "./compute-totals-from-state";

const configFixture: MigrationConfigState = {
  num_projects: 2,
  hrs_per_import: 4,
  lines_per_import_file: 1000,
  is_effort_included: true,
  is_workshop_included: false,
  complexity_factor: 1.25,
  sr_im_trips: 0,
  pm_trips: 0,
  doc_avg_mb_per_project: 200,
  doc_mb_per_hour: 50,
  core_requirements_hrs: 8,
  core_migration_plan_hrs: 6,
  core_validation_hrs: 4,
  core_final_qa_hrs: 2,
  core_pm_oversight_hrs: 3,
};

const lineFixture: MigrationLineState[] = [
  {
    id: "project-1",
    section: "project",
    label: "Project Info/Detail",
    quantity: 1,
    items_per_object: 1500,
    total_line_items: 0,
    row_order: 0,
  },
  {
    id: "project-2",
    section: "project",
    label: "Schedules",
    quantity: 1,
    items_per_object: 500,
    total_line_items: 0,
    row_order: 1,
  },
  {
    id: "workflow-1",
    section: "workflow",
    label: "Workflow Approval",
    quantity: 5,
    items_per_object: 800,
    total_line_items: 0,
    row_order: 0,
  },
  {
    id: "cost-1",
    section: "cost",
    label: "Budgets",
    quantity: 2,
    items_per_object: 600,
    total_line_items: 0,
    row_order: 0,
  },
];

describe("computeMigrationTotalsFromState", () => {
  it("returns null when config is missing", () => {
    expect(
      computeMigrationTotalsFromState(null, lineFixture, {
        srImRate: 100,
        pmRate: 150,
        travelRate: 1000,
        internalCostRate: 135,
      })
    ).toBeNull();
  });

  it("returns null when a required rate is missing", () => {
    expect(
      computeMigrationTotalsFromState(configFixture, lineFixture, {
        srImRate: 100,
        pmRate: null,
        travelRate: 1000,
        internalCostRate: 135,
      })
    ).toBeNull();
  });

  it.each([0, -1, NaN, Infinity])(
    "returns null when lines_per_import_file is invalid: %s",
    (capacity) => {
      expect(
        computeMigrationTotalsFromState(
          { ...configFixture, lines_per_import_file: capacity },
          lineFixture,
          {
            srImRate: 100,
            pmRate: 150,
            travelRate: 1000,
            internalCostRate: 135,
          }
        )
      ).toBeNull();
    }
  );

  it("returns stable totals for a known config and line set", () => {
    const totals = computeMigrationTotalsFromState(configFixture, lineFixture, {
      srImRate: 100,
      pmRate: 150,
      travelRate: 1000,
      internalCostRate: 135,
    });

    expect(totals).not.toBeNull();
    expect(totals?.totalSrImHours).toBe(90);
    expect(totals?.baseSrImHours).toBe(72);
    expect(totals?.srImContingencyHours).toBe(18);
    expect(totals?.totalPmHours).toBeCloseTo(3.75);
    expect(totals?.srImCost).toBe(9000);
    expect(totals?.pmCost).toBeCloseTo(562.5);
    expect(totals?.clientPrice).toBe(9562.5);
    expect(totals?.internalCost).toBeCloseTo(75 * 135);
    expect(totals?.travelExpense).toBe(0);
  });

  it("rejects unknown migration detail sections before calculation", () => {
    expect(() =>
      computeMigrationTotalsFromState(
        configFixture,
        [
          ...lineFixture,
          {
            id: "bad-1",
            section: "unknown",
            label: "Bad row",
            quantity: 1,
            items_per_object: 1,
            total_line_items: 1,
            row_order: 99,
          },
        ],
        {
          srImRate: 100,
          pmRate: 150,
          travelRate: 1000,
          internalCostRate: 135,
        }
      )
    ).toThrow("Unknown migration detail section: unknown");
  });
});

describe("computeProposalMigrationTotal", () => {
  const rates = {
    srImRate: 100,
    pmRate: 150,
    travelRate: 1000,
    internalCostRate: 135,
  };

  it("returns null when the config row is missing", () => {
    expect(computeProposalMigrationTotal(null, lineFixture, rates)).toBeNull();
  });

  it("matches computeMigrationTotalsFromState for the same valid input", () => {
    const viaRows = computeProposalMigrationTotal(
      configFixture,
      lineFixture,
      rates
    );
    const viaState = computeMigrationTotalsFromState(
      configFixture,
      lineFixture,
      rates
    );
    expect(viaRows).toEqual(viaState);
    expect(viaRows?.clientPrice).toBe(9562.5);
  });

  it("still computes when lines_per_import_file is invalid (server pages keep the non-import components)", () => {
    const totals = computeProposalMigrationTotal(
      { ...configFixture, lines_per_import_file: 0 },
      lineFixture,
      rates
    );
    // computeMigrationTotalsFromState short-circuits to null here; the server
    // helper deliberately does not, matching the pages' existing behaviour.
    expect(totals).not.toBeNull();
  });

  it("coerces null numeric fields to zero", () => {
    const totals = computeProposalMigrationTotal(
      { ...configFixture, num_projects: null, complexity_factor: null },
      lineFixture,
      rates
    );
    expect(totals).not.toBeNull();
  });
});
