export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ScenarioGrid } from "@/components/scenarios/scenario-grid";
import { ScenarioComplexityFactor } from "@/components/proposals/scenario-complexity-factor";

export default async function ScenarioPage({
  params,
}: {
  params: Promise<{ id: string; type: string }>;
}) {
  const { id, type } = await params;

  const validTypes = ["P1", "P2", "Opt1", "Opt2"];
  if (!validTypes.includes(type)) notFound();

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

  return (
    <div className="space-y-4">
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
        initialLines={lines ?? []}
        serviceHours={serviceHours ?? []}
        rateCards={rateCards ?? []}
        complexityFactor={Number(scenario.complexity_factor ?? 1)}
      />
    </div>
  );
}
