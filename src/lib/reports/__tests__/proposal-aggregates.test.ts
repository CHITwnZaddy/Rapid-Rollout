import { describe, expect, it } from "vitest";
import {
  BA_RATE_KEY,
  buildMigrationCostMap,
  buildMigrationHoursMap,
  buildRateMap,
  buildScenarioCostMap,
  buildScenarioTotalByProposal,
  buildScopedCostMap,
  buildScopedHoursMap,
  PM_RATE_KEY,
  SCOPED_KEY_BA,
  SCOPED_KEY_PM,
  SCOPED_KEY_SR_IM,
  type MigrationConfigRow,
  type MigrationLineRow,
} from "../proposal-aggregates";
import {
  SR_IM_RATE_KEY,
  TRAVEL_RATE_KEY,
} from "@/lib/rate-card-keys";

describe("proposal aggregates", () => {
  it("builds per-proposal scenario maps and totals", () => {
    const rows = [
      {
        proposal_id: "p1",
        scenario_type: "P1",
        summary_total_cost: 100,
        complexity_factor: 1.5,
      },
      {
        proposal_id: "p1",
        scenario_type: "P2",
        summary_total_cost: 200,
        complexity_factor: 1,
      },
      {
        proposal_id: "p2",
        scenario_type: "P1",
        summary_total_cost: 50,
        complexity_factor: 2,
      },
    ];

    const scenarioMap = buildScenarioCostMap(rows);
    const totals = buildScenarioTotalByProposal(rows);

    expect(scenarioMap.get("p1")).toEqual({ P1: 150, P2: 200 });
    expect(scenarioMap.get("p2")).toEqual({ P1: 100 });
    expect(totals.get("p1")).toBe(350);
    expect(totals.get("p2")).toBe(100);
  });

  it("builds scoped cost and scoped hour maps", () => {
    const costMap = buildScopedCostMap([
      { proposal_id: "p1", cost: 100 },
      { proposal_id: "p1", cost: 40 },
      { proposal_id: "p2", cost: 25 },
    ]);
    const hoursMap = buildScopedHoursMap([
      { proposal_id: "p1", hours: 2, rate_card_lookup_key: SCOPED_KEY_SR_IM },
      { proposal_id: "p1", hours: 3, rate_card_lookup_key: SCOPED_KEY_PM },
      { proposal_id: "p1", hours: 4, rate_card_lookup_key: SCOPED_KEY_BA },
      { proposal_id: "p1", hours: 99, rate_card_lookup_key: "Master|Travel Cost/Trip" },
    ]);

    expect(costMap.get("p1")).toBe(140);
    expect(costMap.get("p2")).toBe(25);
    expect(hoursMap.get("p1")).toEqual({ sr: 2, pm: 3, ba: 4 });
  });

  it("builds migration cost and hour maps from shared inputs", () => {
    const configs: MigrationConfigRow[] = [
      {
        proposal_id: "p1",
        num_projects: 2,
        hrs_per_import: 4,
        lines_per_import_file: 1000,
        is_effort_included: true,
        is_workshop_included: false,
        sr_im_complexity_factor: 1,
        pm_complexity_factor: 1,
        sr_im_trips: 0,
        pm_trips: 0,
        doc_avg_mb_per_project: 0,
        doc_mb_per_hour: 0,
        core_requirements_hrs: 20,
        core_migration_plan_hrs: 16,
        core_validation_hrs: 12,
        core_final_qa_hrs: 8,
        core_pm_oversight_hrs: 10,
      },
    ];
    const lines: MigrationLineRow[] = [
      {
        proposal_id: "p1",
        id: "l1",
        section: "project",
        label: "Projects",
        quantity: 1,
        items_per_object: 1200,
        total_line_items: 0,
        row_order: 1,
      },
      {
        proposal_id: "p1",
        id: "l2",
        section: "workflow",
        label: "Workflow A",
        quantity: 1,
        items_per_object: 800,
        total_line_items: 0,
        row_order: 2,
      },
      {
        proposal_id: "p1",
        id: "l3",
        section: "cost",
        label: "Special Cost",
        quantity: 2,
        items_per_object: 500,
        total_line_items: 0,
        row_order: 3,
      },
    ];
    const rates = buildRateMap([
      { lookup_key: BA_RATE_KEY, rate: 200 },
      { lookup_key: SR_IM_RATE_KEY, rate: 275 },
      { lookup_key: PM_RATE_KEY, rate: 250 },
      { lookup_key: TRAVEL_RATE_KEY, rate: 1000 },
    ]);

    const costMap = buildMigrationCostMap(configs, lines, rates);
    const hoursMap = buildMigrationHoursMap(configs, lines, rates);

    expect(costMap.get("p1")).toBe(25600);
    expect(hoursMap.get("p1")).toEqual({
      pm: 10,
      srIm: 84,
    });
  });
});
