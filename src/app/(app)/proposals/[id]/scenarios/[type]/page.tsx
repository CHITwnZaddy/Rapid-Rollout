export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ScenarioGrid } from "@/components/scenarios/scenario-grid";
import { ScenarioComplexityFactor } from "@/components/proposals/scenario-complexity-factor";
import { INTERNAL_COST_RATE_KEY } from "@/lib/rate-card-keys";
import { getScenarioDisplayName, SCENARIO_ORDER } from "@/lib/scenarios/display";

export default async function ScenarioPage({
  params,
}: {
  params: Promise<{ id: string; type: string }>;
}) {
  const { id, type } = await params;

  if (!SCENARIO_ORDER.includes(type as (typeof SCENARIO_ORDER)[number])) notFound();

  const supabase = await createClient();

  const { data: scenario } = await supabase
    .from("scenarios")
    .select(
      "id, scenario_type, summary_total_hours, summary_total_cost, complexity_factor"
    )
    .eq("proposal_id", id)
    .eq("scenario_type", type)
    .single();

  if (!scenario) notFound();

  const { data: lines } = await supabase
    .from("scenario_lines")
    .select("*")
    .eq("scenario_id", scenario.id)
    .order("row_order");

  const { data: serviceHours } = await supabase
    .from("service_hours")
    .select("*")
    .eq("status", "Active");

  const { data: rateCards } = await supabase
    .from("rate_cards")
    .select("*")
    .eq("status", "Active");
  const internalCostRate =
    rateCards?.find((rate) => rate.lookup_key === INTERNAL_COST_RATE_KEY)?.rate ??
    0;
  const normalizedLines = (lines ?? []).map((line) => ({
    ...line,
    row_order: line.row_order ?? 0,
    sr_im_hours: line.sr_im_hours ?? 0,
    sr_im_cost: line.sr_im_cost ?? 0,
    pm_hours: line.pm_hours ?? 0,
    pm_cost: line.pm_cost ?? 0,
    ba_hours: line.ba_hours ?? 0,
    ba_cost: line.ba_cost ?? 0,
    total_hours: line.total_hours ?? 0,
    total_cost: line.total_cost ?? 0,
    is_locked: line.is_locked ?? false,
  }));
  const normalizedServiceHours = (serviceHours ?? []).map((row) => ({
    ...row,
    sr_im_hours: row.sr_im_hours ?? 0,
    pm_hours: row.pm_hours ?? 0,
    ba_hours: row.ba_hours ?? 0,
    scope_label: row.scope_label ?? row.scope_value,
    service_group: row.service_group ?? "Core",
  }));
  const normalizedRateCards = (rateCards ?? []).map((row) => ({
    ...row,
    rate: row.rate ?? 0,
    role_category: row.role_category ?? "",
  }));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">
        {getScenarioDisplayName(type)}
      </h2>
      <div className="rounded-md border bg-card p-4">
        <ScenarioComplexityFactor
          scenarioId={scenario.id}
          proposalId={id}
          initialValue={Number(scenario.complexity_factor ?? 1)}
        />
      </div>
      <ScenarioGrid
        proposalId={id}
        scenarioId={scenario.id}
        scenarioType={type}
        initialLines={normalizedLines}
        serviceHours={normalizedServiceHours}
        rateCards={normalizedRateCards}
        complexityFactor={Number(scenario.complexity_factor ?? 1)}
        internalCostRate={Number(internalCostRate)}
      />
    </div>
  );
}
