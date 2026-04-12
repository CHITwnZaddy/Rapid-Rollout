export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ScenarioGrid } from "@/components/scenarios/scenario-grid";

export default async function ScenarioPage({
  params,
}: {
  params: Promise<{ id: string; type: string }>;
}) {
  const { id, type } = await params;

  const validTypes = ["P1", "P2", "Opt1", "Opt2"];
  if (!validTypes.includes(type)) notFound();

  const supabase = await createClient();

  // Fetch scenario
  const { data: scenario } = await supabase
    .from("scenarios")
    .select("id, scenario_type, summary_total_hours, summary_total_cost")
    .eq("proposal_id", id)
    .eq("scenario_type", type)
    .single();

  if (!scenario) notFound();

  // Fetch scenario lines
  const { data: lines } = await supabase
    .from("scenario_lines")
    .select("*")
    .eq("scenario_id", scenario.id)
    .order("row_order");

  // Fetch lookup data
  const { data: serviceHours } = await supabase
    .from("service_hours")
    .select("*")
    .eq("status", "Active");

  const { data: rateCards } = await supabase
    .from("rate_cards")
    .select("*")
    .eq("status", "Active");

  return (
    <ScenarioGrid
      scenarioId={scenario.id}
      scenarioType={type}
      initialLines={lines ?? []}
      serviceHours={serviceHours ?? []}
      rateCards={rateCards ?? []}
    />
  );
}
