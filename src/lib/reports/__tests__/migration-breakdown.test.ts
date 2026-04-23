import { describe, expect, it } from "vitest";
import {
  buildScenarioBreakoutMigrationRows,
  calculateMigrationBreakdownTotal,
} from "../migration-breakdown";

describe("migration breakdown", () => {
  it("builds the scenario-breakout migration rows from shared migration inputs", () => {
    const rows = buildScenarioBreakoutMigrationRows(
      {
        num_projects: 2,
        hrs_per_import: 4,
        lines_per_import_file: 1000,
        is_effort_included: true,
        is_workshop_included: false,
        sr_im_complexity_factor: 1.5,
        pm_complexity_factor: 2,
        sr_im_trips: 0,
        pm_trips: 0,
        doc_avg_mb_per_project: 100,
        doc_mb_per_hour: 50,
        core_requirements_hrs: 10,
        core_migration_plan_hrs: 6,
        core_validation_hrs: 4,
        core_final_qa_hrs: 2,
        core_pm_oversight_hrs: 3,
      },
      [
        {
          section: "project",
          label: "Project Info/Detail",
          quantity: 1,
          items_per_object: 1500,
          total_line_items: 0,
          row_order: 0,
        },
        {
          section: "workflow",
          label: "Workflow A",
          quantity: 1,
          items_per_object: 1000,
          total_line_items: 0,
          row_order: 1,
        },
        {
          section: "cost",
          label: "Budgets",
          quantity: 1,
          items_per_object: 500,
          total_line_items: 0,
          row_order: 2,
        },
      ],
      300,
      250
    );

    expect(rows).toEqual([
      { label: "Core Data Migration Efforts", total: 11400 },
      { label: "Document Migration", total: 1800 },
      { label: "Project & Schedule Data Migration", total: 5400 },
      { label: "Workflow Data Migration", total: 3600 },
      { label: "Cost Data Migration", total: 3600 },
    ]);
    expect(calculateMigrationBreakdownTotal(rows)).toBe(25800);
  });

  it("includes workshop and placeholder-labeled workflow/cost rows in the migration total", () => {
    const rows = buildScenarioBreakoutMigrationRows(
      {
        num_projects: 1,
        hrs_per_import: 4,
        lines_per_import_file: 1000,
        is_effort_included: false,
        is_workshop_included: true,
        sr_im_complexity_factor: 1,
        pm_complexity_factor: 1,
        sr_im_trips: 0,
        pm_trips: 0,
        doc_avg_mb_per_project: 0,
        doc_mb_per_hour: 50,
        core_requirements_hrs: 0,
        core_migration_plan_hrs: 0,
        core_validation_hrs: 0,
        core_final_qa_hrs: 0,
        core_pm_oversight_hrs: 0,
      },
      [
        {
          section: "workflow",
          label: "WF Object Name",
          quantity: 1,
          items_per_object: 1000,
          total_line_items: 0,
          row_order: 0,
        },
        {
          section: "cost",
          label: "TBD",
          quantity: 1,
          items_per_object: 500,
          total_line_items: 0,
          row_order: 1,
        },
      ],
      300,
      250
    );

    expect(rows).toEqual([
      { label: "Data Migration Workshop", total: 41600 },
      { label: "Workflow Data Migration", total: 2400 },
      { label: "Cost Data Migration", total: 2400 },
    ]);
    expect(calculateMigrationBreakdownTotal(rows)).toBe(46400);
  });

  it("includes travel labor in the scenario-breakout migration total", () => {
    const rows = buildScenarioBreakoutMigrationRows(
      {
        num_projects: 0,
        hrs_per_import: 4,
        lines_per_import_file: 1000,
        is_effort_included: false,
        is_workshop_included: false,
        sr_im_complexity_factor: 1,
        pm_complexity_factor: 1,
        sr_im_trips: 1,
        pm_trips: 1,
        doc_avg_mb_per_project: 0,
        doc_mb_per_hour: 50,
        core_requirements_hrs: 0,
        core_migration_plan_hrs: 0,
        core_validation_hrs: 0,
        core_final_qa_hrs: 0,
        core_pm_oversight_hrs: 0,
      },
      [],
      300,
      250
    );

    expect(rows).toEqual([
      { label: "Travel", total: 22000 },
    ]);
    expect(calculateMigrationBreakdownTotal(rows)).toBe(22000);
  });
});
