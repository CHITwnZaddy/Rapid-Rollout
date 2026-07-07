"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  buildRateCardMap,
  buildServiceHoursMap,
  type RateCardRow,
  type ServiceHoursRow,
} from "@/lib/calculations/engine";
import { requireAuthenticatedResult } from "@/lib/auth/require-admin";
import {
  buildCanonicalScenarioGridLines,
  buildScenarioGridRpcPayload,
  buildScenarioGridTotalsUpdate,
  type ScenarioGridPersistLine,
} from "@/lib/scenarios/persist-scenario-grid";
import {
  BA_RATE_KEY,
  INTERNAL_COST_RATE_KEY,
  PM_RATE_KEY,
  SR_IM_RATE_KEY,
} from "@/lib/rate-card-keys";
import { getRequiredRateCardsError } from "@/lib/pricing/load-guards";
import { saveScenarioGridSchema } from "@/lib/validation/scenario-grid";
import { safeParseSupabaseResult } from "@/lib/validation/parse-supabase";
import type { Database } from "@/types/database";
import { z } from "zod";

// Local (this "use server" module can only export async functions); nullability
// mirrors the generated scenarios row.
const scenarioRecordSchema = z.object({
  id: z.string(),
  proposal_id: z.string(),
  scenario_type: z.string(),
});

export type SaveScenarioGridResult =
  | { ok: true; lines: ScenarioGridPersistLine[] }
  | { ok: false; error: string };

type ScenarioRecord = Pick<
  Database["public"]["Tables"]["scenarios"]["Row"],
  "id" | "proposal_id" | "scenario_type"
>;

type ScenarioLineRecord = Pick<
  Database["public"]["Tables"]["scenario_lines"]["Row"],
  "id" | "row_order" | "module" | "scope_selection"
>;

export async function saveScenarioGridSelections(
  proposalId: string,
  scenarioId: string,
  changes: Array<{ lineId: string; scopeSelection: string | null }>
): Promise<SaveScenarioGridResult> {
  const parsed = saveScenarioGridSchema.safeParse({
    proposalId,
    scenarioId,
    changes,
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid scenario save payload.",
    };
  }

  const auth = await requireAuthenticatedResult("You must be signed in to save scenario changes.");
  if (!auth.ok) return auth;

  const supabase = await createClient();

  const scenarioResult = await supabase
    .from("scenarios")
    .select("id, proposal_id, scenario_type")
    .eq("id", parsed.data.scenarioId)
    .eq("proposal_id", parsed.data.proposalId)
    .single();

  const scenarioParsed = safeParseSupabaseResult(
    scenarioRecordSchema,
    scenarioResult
  );
  if (!scenarioParsed.ok) {
    return {
      ok: false,
      error: "Scenario not found or you do not have permission to edit it.",
    };
  }
  const scenario: ScenarioRecord = scenarioParsed.data;

  const { data: lineRows, error: lineError } = await supabase
    .from("scenario_lines")
    .select("id, row_order, module, scope_selection")
    .eq("scenario_id", parsed.data.scenarioId)
    .order("row_order", { ascending: true })
    .returns<ScenarioLineRecord[]>();

  if (lineError || !lineRows) {
    return {
      ok: false,
      error: lineError?.message ?? "Couldn't load current scenario lines.",
    };
  }

  const knownLineIds = new Set(lineRows.map((line) => line.id));
  for (const change of parsed.data.changes) {
    if (!knownLineIds.has(change.lineId)) {
      return {
        ok: false,
        error: "Scenario changes contain lines outside the target scenario.",
      };
    }
  }

  const { data: serviceHoursRows, error: serviceHoursError } = await supabase
    .from("service_hours")
    .select(
      "service_name, scope_value, sr_im_hours, pm_hours, ba_hours, scope_label, service_group, lookup_key"
    )
    .eq("status", "Active")
    .returns<ServiceHoursRow[]>();

  if (serviceHoursError || !serviceHoursRows) {
    return {
      ok: false,
      error: serviceHoursError?.message ?? "Couldn't load active service hours.",
    };
  }

  const { data: rateCardRows, error: rateCardError } = await supabase
    .from("rate_cards")
    .select("activity, rate, role_category, lookup_key")
    .eq("status", "Active")
    .returns<RateCardRow[]>();

  if (rateCardError || !rateCardRows) {
    return {
      ok: false,
      error: rateCardError?.message ?? "Couldn't load active rate cards.",
    };
  }
  const rateCardLoadError = getRequiredRateCardsError(
    rateCardRows,
    [SR_IM_RATE_KEY, PM_RATE_KEY, BA_RATE_KEY, INTERNAL_COST_RATE_KEY],
    "scenario pricing"
  );
  if (rateCardLoadError) {
    return { ok: false, error: rateCardLoadError };
  }

  let canonicalLines: ScenarioGridPersistLine[];
  try {
    canonicalLines = buildCanonicalScenarioGridLines(
      lineRows.map((line) => ({
        id: line.id,
        rowOrder: line.row_order,
        module: line.module,
        scopeSelection: line.scope_selection,
      })),
      parsed.data.changes,
      buildServiceHoursMap(serviceHoursRows),
      buildRateCardMap(rateCardRows)
    );
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Couldn't rebuild canonical scenario lines.",
    };
  }

  const totals = buildScenarioGridTotalsUpdate(canonicalLines);
  const { data: saved, error: rpcError } = await supabase.rpc(
    "save_scenario_grid",
    {
      p_scenario_id: parsed.data.scenarioId,
      p_lines: buildScenarioGridRpcPayload(canonicalLines),
      p_summary_total_hours: totals.summary_total_hours,
      p_summary_total_cost: totals.summary_total_cost,
    }
  );

  if (rpcError) {
    return { ok: false, error: rpcError.message };
  }

  if (!saved) {
    return { ok: false, error: "Scenario grid save did not complete." };
  }

  revalidatePath(`/proposals/${parsed.data.proposalId}`);
  revalidatePath(
    `/proposals/${parsed.data.proposalId}/scenarios/${scenario.scenario_type}`
  );

  return { ok: true, lines: canonicalLines };
}
