import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateProposalPricingSummary } from "@/lib/calculations/proposal-pricing";
import {
  buildMigrationCostMap,
  buildMigrationHoursMap,
  buildRateMap,
  buildScenarioTotalByProposal,
  buildScopedCostMap,
  buildScopedHoursMap,
  type MigrationConfigRow,
  type MigrationLineRow,
} from "@/lib/reports/proposal-aggregates";
import {
  buildScenarioBreakoutMigrationRows,
  calculateMigrationBreakdownTotal,
} from "@/lib/reports/migration-breakdown";
import {
  INTERNAL_COST_RATE_KEY,
  PM_RATE_KEY,
  SCOPED_KEY_BA,
  SCOPED_KEY_PM,
  SCOPED_KEY_SR_IM,
  SR_IM_RATE_KEY,
  TRAVEL_RATE_KEY,
} from "@/lib/rate-card-keys";

const { getUserMock, rpcMock, revalidatePathMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  rpcMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    rpc: rpcMock,
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { createProposal } from "./new/actions";
import { updateProposalStatus } from "./[id]/actions";

describe("proposal lifecycle actions", () => {
  beforeEach(() => {
    getUserMock.mockReset();
    rpcMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("maps the create and status RPC contracts correctly for the same proposal flow", async () => {
    getUserMock
      .mockResolvedValueOnce({
        data: { user: { id: "user-1" } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { user: { id: "user-1" } },
        error: null,
      });

    rpcMock
      .mockResolvedValueOnce({
        data: "proposal-123",
        error: null,
      })
      .mockResolvedValueOnce({
        data: true,
        error: null,
      });

    const createResult = await createProposal({
      name: "Revenue Flow",
      customerId: "",
    });
    const statusResult = await updateProposalStatus("proposal-123", "Won");

    expect(createResult).toEqual({ ok: true, proposalId: "proposal-123" });
    expect(statusResult).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenNthCalledWith(1, "create_proposal_bundle", {
      p_name: "Revenue Flow",
      p_customer_id: null,
    });
    expect(rpcMock).toHaveBeenNthCalledWith(2, "transition_proposal_status", {
      p_proposal_id: "proposal-123",
      p_new_status: "Won",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/proposals");
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePathMock).toHaveBeenCalledWith("/proposals/proposal-123");
  });

  it("keeps proposal pricing and reports aligned for the core revenue flow", async () => {
    getUserMock
      .mockResolvedValueOnce({
        data: { user: { id: "user-1" } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { user: { id: "user-1" } },
        error: null,
      });

    rpcMock
      .mockResolvedValueOnce({
        data: "proposal-lifecycle-1",
        error: null,
      })
      .mockResolvedValueOnce({
        data: true,
        error: null,
      });

    const createResult = await createProposal({
      name: "Lifecycle Revenue Flow",
      customerId: "",
    });

    if (!createResult.ok) {
      throw new Error("Expected createProposal to succeed for lifecycle test");
    }

    const statusResult = await updateProposalStatus(
      createResult.proposalId,
      "Won"
    );

    expect(statusResult).toEqual({ ok: true });

    const proposalId = createResult.proposalId;

    const scenarioRows = [
      {
        proposal_id: proposalId,
        scenario_type: "P1",
        summary_total_cost: 1000,
        complexity_factor: 1.25,
      },
      {
        proposal_id: proposalId,
        scenario_type: "P2",
        summary_total_cost: 400,
        complexity_factor: 1,
      },
      {
        proposal_id: proposalId,
        scenario_type: "Opt1",
        summary_total_cost: 200,
        complexity_factor: 1.1,
      },
    ];

    const pricingScenarios = [
      {
        summary_total_cost: 1000,
        summary_total_hours: 10,
        complexity_factor: 1.25,
      },
      {
        summary_total_cost: 400,
        summary_total_hours: 4,
        complexity_factor: 1,
      },
      {
        summary_total_cost: 200,
        summary_total_hours: 2,
        complexity_factor: 1.1,
      },
    ];

    const scopedCosts = [
      { proposal_id: proposalId, cost: 120 },
      { proposal_id: proposalId, cost: 80 },
    ];

    const scopedHours = [
      {
        proposal_id: proposalId,
        hours: 3,
        rate_card_lookup_key: SCOPED_KEY_SR_IM,
      },
      {
        proposal_id: proposalId,
        hours: 2,
        rate_card_lookup_key: SCOPED_KEY_PM,
      },
      {
        proposal_id: proposalId,
        hours: 1,
        rate_card_lookup_key: SCOPED_KEY_BA,
      },
    ];

    const migrationConfigs: MigrationConfigRow[] = [
      {
        proposal_id: proposalId,
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
      },
    ];

    const migrationLines: MigrationLineRow[] = [
      {
        proposal_id: proposalId,
        id: "project-1",
        section: "project",
        label: "Project Info/Detail",
        quantity: 1,
        items_per_object: 1500,
        total_line_items: 0,
        row_order: 0,
      },
      {
        proposal_id: proposalId,
        id: "project-2",
        section: "project",
        label: "Schedules",
        quantity: 1,
        items_per_object: 500,
        total_line_items: 0,
        row_order: 1,
      },
      {
        proposal_id: proposalId,
        id: "workflow-1",
        section: "workflow",
        label: "Workflow Approval",
        quantity: 5,
        items_per_object: 800,
        total_line_items: 0,
        row_order: 2,
      },
      {
        proposal_id: proposalId,
        id: "cost-1",
        section: "cost",
        label: "Budgets",
        quantity: 2,
        items_per_object: 600,
        total_line_items: 0,
        row_order: 3,
      },
    ];

    const rateMap = buildRateMap([
      { lookup_key: SR_IM_RATE_KEY, rate: 275 },
      { lookup_key: PM_RATE_KEY, rate: 225 },
      { lookup_key: TRAVEL_RATE_KEY, rate: 1000 },
      { lookup_key: INTERNAL_COST_RATE_KEY, rate: 135 },
    ]);

    const scenarioTotals = buildScenarioTotalByProposal(scenarioRows);
    const scopedTotals = buildScopedCostMap(scopedCosts);
    const scopedRoleHours = buildScopedHoursMap(scopedHours);
    const migrationTotals = buildMigrationCostMap(
      migrationConfigs,
      migrationLines,
      rateMap
    );
    const migrationHours = buildMigrationHoursMap(
      migrationConfigs,
      migrationLines,
      rateMap
    );

    const breakdownConfig = migrationConfigs[0];
    const migrationBreakdownRows = buildScenarioBreakoutMigrationRows(
      {
        num_projects: Number(breakdownConfig.num_projects),
        hrs_per_import: Number(breakdownConfig.hrs_per_import),
        lines_per_import_file: Number(breakdownConfig.lines_per_import_file),
        is_effort_included: breakdownConfig.is_effort_included,
        is_workshop_included: breakdownConfig.is_workshop_included,
        complexity_factor: Number(breakdownConfig.complexity_factor),
        sr_im_trips: Number(breakdownConfig.sr_im_trips),
        pm_trips: Number(breakdownConfig.pm_trips),
        doc_avg_mb_per_project: Number(breakdownConfig.doc_avg_mb_per_project),
        doc_mb_per_hour: Number(breakdownConfig.doc_mb_per_hour),
        core_requirements_hrs: Number(breakdownConfig.core_requirements_hrs),
        core_migration_plan_hrs: Number(breakdownConfig.core_migration_plan_hrs),
        core_validation_hrs: Number(breakdownConfig.core_validation_hrs),
        core_final_qa_hrs: Number(breakdownConfig.core_final_qa_hrs),
        core_pm_oversight_hrs: Number(breakdownConfig.core_pm_oversight_hrs),
      },
      migrationLines.map((line) => ({
        section: line.section,
        label: line.label,
        quantity: Number(line.quantity),
        items_per_object: Number(line.items_per_object),
        total_line_items: Number(line.total_line_items),
        row_order: line.row_order ?? 0,
      })),
      rateMap.get(SR_IM_RATE_KEY) ?? 0,
      rateMap.get(PM_RATE_KEY) ?? 0
    );

    const pricing = calculateProposalPricingSummary({
      scenarios: pricingScenarios,
      migrationTotal: migrationTotals.get(proposalId) ?? 0,
      scopedTotal: scopedTotals.get(proposalId) ?? 0,
      credit: 100,
      discountPercent: 10,
    });

    expect(createResult).toEqual({ ok: true, proposalId });
    expect(rpcMock).toHaveBeenNthCalledWith(1, "create_proposal_bundle", {
      p_name: "Lifecycle Revenue Flow",
      p_customer_id: null,
    });
    expect(rpcMock).toHaveBeenNthCalledWith(2, "transition_proposal_status", {
      p_proposal_id: proposalId,
      p_new_status: "Won",
    });

    expect(scenarioTotals.get(proposalId)).toBe(1870);
    expect(scopedTotals.get(proposalId)).toBe(200);
    expect(scopedRoleHours.get(proposalId)).toEqual({ sr: 3, pm: 2, ba: 1 });

    const migrationTotal = migrationTotals.get(proposalId) ?? 0;
    const migrationRoleHours = migrationHours.get(proposalId);
    expect(migrationTotal).toBeGreaterThan(0);
    expect(migrationRoleHours?.srIm ?? 0).toBeGreaterThan(0);
    expect(migrationRoleHours?.pm ?? 0).toBeGreaterThan(0);

    // This fixture intentionally keeps workshop/travel at zero so the
    // Scenario Breakout migration section should reconcile exactly to the
    // full migration total shown elsewhere.
    expect(calculateMigrationBreakdownTotal(migrationBreakdownRows)).toBe(
      migrationTotal
    );

    expect(pricing.scenarioSubtotal).toBe(scenarioTotals.get(proposalId));
    expect(pricing.proposalSubtotal).toBe(
      (scenarioTotals.get(proposalId) ?? 0) +
        (scopedTotals.get(proposalId) ?? 0) +
        migrationTotal
    );
    expect(pricing.pricing.afterCredit).toBe(pricing.proposalSubtotal - 100);
    expect(pricing.pricing.finalTotal).toBe(
      pricing.pricing.afterCredit * 0.9
    );
  });
});
