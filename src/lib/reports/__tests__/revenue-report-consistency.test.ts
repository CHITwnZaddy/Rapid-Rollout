import { describe, expect, it } from "vitest";
import {
  buildMigrationCostMap,
  buildRateMap,
  buildScenarioTotalByProposal,
  buildScopedCostMap,
  type MigrationConfigRow,
  type MigrationLineRow,
} from "../proposal-aggregates";
import { calculateProposalPricingSummary } from "@/lib/calculations/proposal-pricing";
import {
  INTERNAL_COST_RATE_KEY,
  PM_RATE_KEY,
  SR_IM_RATE_KEY,
  TRAVEL_RATE_KEY,
} from "@/lib/rate-card-keys";

describe("revenue report consistency", () => {
  it("reconciles shared report aggregates with proposal pricing totals for the same fixture", () => {
    const proposalId = "proposal-1";
    const scenarioRows = [
      {
        proposal_id: proposalId,
        scenario_type: "P1",
        summary_total_cost: 1200,
        complexity_factor: 1.25,
      },
      {
        proposal_id: proposalId,
        scenario_type: "P2",
        summary_total_cost: 300,
        complexity_factor: 1,
      },
    ];
    const scopedRows = [
      { proposal_id: proposalId, cost: 150 },
      { proposal_id: proposalId, cost: 50 },
    ];
    const migrationConfigs: MigrationConfigRow[] = [
      {
        proposal_id: proposalId,
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
        core_requirements_hrs: 12,
        core_migration_plan_hrs: 8,
        core_validation_hrs: 6,
        core_final_qa_hrs: 4,
        core_pm_oversight_hrs: 5,
      },
    ];
    const migrationLines: MigrationLineRow[] = [
      {
        proposal_id: proposalId,
        id: "line-1",
        section: "project",
        label: "Project Info/Detail",
        quantity: 1,
        items_per_object: 1500,
        total_line_items: 0,
        row_order: 0,
      },
      {
        proposal_id: proposalId,
        id: "line-2",
        section: "workflow",
        label: "Workflow A",
        quantity: 1,
        items_per_object: 1000,
        total_line_items: 0,
        row_order: 1,
      },
      {
        proposal_id: proposalId,
        id: "line-3",
        section: "cost",
        label: "Budgets",
        quantity: 1,
        items_per_object: 500,
        total_line_items: 0,
        row_order: 2,
      },
    ];
    const rates = buildRateMap([
      { lookup_key: SR_IM_RATE_KEY, rate: 275 },
      { lookup_key: PM_RATE_KEY, rate: 250 },
      { lookup_key: TRAVEL_RATE_KEY, rate: 1000 },
      { lookup_key: INTERNAL_COST_RATE_KEY, rate: 135 },
    ]);

    const scenarioTotals = buildScenarioTotalByProposal(scenarioRows);
    const scopedTotals = buildScopedCostMap(scopedRows);
    const migrationTotals = buildMigrationCostMap(
      migrationConfigs,
      migrationLines,
      rates
    );

    const pricing = calculateProposalPricingSummary({
      scenarios: [
        {
          summary_total_cost: 1200,
          summary_total_hours: 12,
          complexity_factor: 1.25,
        },
        {
          summary_total_cost: 300,
          summary_total_hours: 3,
          complexity_factor: 1,
        },
      ],
      migrationTotal: migrationTotals.get(proposalId) ?? 0,
      scopedTotal: scopedTotals.get(proposalId) ?? 0,
      credit: 100,
      discountPercent: 10,
    });

    expect(scenarioTotals.get(proposalId)).toBe(1800);
    expect(scopedTotals.get(proposalId)).toBe(200);
    expect(migrationTotals.get(proposalId)).toBeGreaterThan(0);
    expect(pricing.proposalSubtotal).toBe(
      (scenarioTotals.get(proposalId) ?? 0) +
        (scopedTotals.get(proposalId) ?? 0) +
        (migrationTotals.get(proposalId) ?? 0)
    );
    expect(pricing.pricing.afterCredit).toBe(pricing.proposalSubtotal - 100);
    expect(pricing.pricing.finalTotal).toBe(
      pricing.pricing.afterCredit * 0.9
    );
  });
});
