import { describe, expect, it } from "vitest";
import {
  computeMigrationTotalsFromState,
  type MigrationConfigState,
  type MigrationLineState,
} from "./compute-totals-from-state";

const configFixture: MigrationConfigState = {
  num_projects: 2,
  hrs_per_import: 4,
  lines_per_import_file: 1000,
  is_effort_included: true,
  is_workshop_included: false,
  pm_contingency_pct: 0,
  sr_im_complexity_factor: 1.25,
  pm_complexity_factor: 1.1,
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
      })
    ).toBeNull();
  });

  it("returns null when a required rate is missing", () => {
    expect(
      computeMigrationTotalsFromState(configFixture, lineFixture, {
        srImRate: 100,
        pmRate: null,
        travelRate: 1000,
      })
    ).toBeNull();
  });

  it("returns stable totals for a known config and line set", () => {
    const totals = computeMigrationTotalsFromState(configFixture, lineFixture, {
      srImRate: 100,
      pmRate: 150,
      travelRate: 1000,
    });

    expect(totals).not.toBeNull();
    expect(totals?.totalSrImHours).toBe(90);
    expect(totals?.totalPmHours).toBeCloseTo(3.3);
    expect(totals?.srImCost).toBe(9000);
    expect(totals?.pmCost).toBeCloseTo(495);
    expect(totals?.salesPrice).toBe(9495);
    expect(totals?.travelExpense).toBe(0);
  });
});
