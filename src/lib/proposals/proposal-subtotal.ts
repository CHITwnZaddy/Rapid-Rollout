import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { applyComplexity } from "@/lib/calculations/complexity";
import { calculateProposalPricingSummary } from "@/lib/calculations/proposal-pricing";
import { computeProposalMigrationTotal } from "@/lib/migration/compute-totals-from-state";
import {
  INTERNAL_COST_RATE_KEY,
  PM_RATE_KEY,
  SR_IM_RATE_KEY,
  TRAVEL_RATE_KEY,
} from "@/lib/rate-card-keys";

export type ProposalSubtotalResult =
  | { ok: true; subtotal: number }
  | { ok: false; error: string };

// Server-side proposal subtotal: the same number the proposal summary
// page computes (scenarios with complexity + scoped services with
// complexity + live migration recompute). Server actions that need to
// validate against the subtotal (e.g. credit must not exceed it) call
// this instead of trusting a client-supplied figure.
//
// Fail-closed: if any pricing-critical input can't be read (missing
// rate card rows, query errors), this returns an error rather than a
// zero subtotal — a zero would make every credit look invalid or, worse,
// silently valid.
export async function fetchProposalSubtotal(
  supabase: SupabaseClient<Database>,
  proposalId: string
): Promise<ProposalSubtotalResult> {
  const [proposalRes, scenarioRes, scopedRes, migrationConfigRes, migrationLinesRes, ratesRes] =
    await Promise.all([
      supabase
        .from("proposals")
        .select("scoped_complexity_factor")
        .eq("id", proposalId)
        .single(),
      supabase
        .from("scenarios")
        .select("summary_total_cost, summary_total_hours, complexity_factor")
        .eq("proposal_id", proposalId),
      supabase
        .from("scoped_services")
        .select("cost")
        .eq("proposal_id", proposalId),
      supabase
        .from("migration_config")
        .select(
          "num_projects, hrs_per_import, lines_per_import_file, is_effort_included, is_workshop_included, complexity_factor, sr_im_trips, pm_trips, doc_avg_mb_per_project, doc_mb_per_hour, core_requirements_hrs, core_migration_plan_hrs, core_validation_hrs, core_final_qa_hrs, core_pm_oversight_hrs"
        )
        .eq("proposal_id", proposalId)
        .maybeSingle(),
      supabase
        .from("migration_detail_lines")
        .select("id, section, label, quantity, items_per_object, total_line_items, row_order")
        .eq("proposal_id", proposalId),
      supabase
        .from("rate_cards")
        .select("lookup_key, rate")
        .eq("status", "Active")
        .in("lookup_key", [
          INTERNAL_COST_RATE_KEY,
          SR_IM_RATE_KEY,
          PM_RATE_KEY,
          TRAVEL_RATE_KEY,
        ]),
    ]);

  if (proposalRes.error) {
    return { ok: false, error: `Could not read proposal: ${proposalRes.error.message}` };
  }
  if (scenarioRes.error) {
    return { ok: false, error: `Could not read scenarios: ${scenarioRes.error.message}` };
  }
  if (scopedRes.error) {
    return { ok: false, error: `Could not read scoped services: ${scopedRes.error.message}` };
  }
  if (migrationConfigRes.error) {
    return { ok: false, error: `Could not read migration config: ${migrationConfigRes.error.message}` };
  }
  if (migrationLinesRes.error) {
    return { ok: false, error: `Could not read migration lines: ${migrationLinesRes.error.message}` };
  }
  if (ratesRes.error) {
    return { ok: false, error: `Could not read rate cards: ${ratesRes.error.message}` };
  }

  const rateRows = ratesRes.data ?? [];
  const rate = (key: string) => {
    const row = rateRows.find((r) => r.lookup_key === key);
    return row ? Number(row.rate) : null;
  };

  const scopedComplexityFactor =
    Number(proposalRes.data?.scoped_complexity_factor) || 1;
  const scopedRawTotal = (scopedRes.data ?? []).reduce(
    (sum, s) => sum + Number(s.cost),
    0
  );
  const scopedTotal = applyComplexity(scopedRawTotal, scopedComplexityFactor);

  // Migration total recomputed live from config + lines, same as the
  // proposal summary page (the stored snapshot can lag).
  let migrationTotal = 0;
  const migCfg = migrationConfigRes.data;
  if (migCfg) {
    const srImRate = rate(SR_IM_RATE_KEY);
    const pmRate = rate(PM_RATE_KEY);
    const travelRate = rate(TRAVEL_RATE_KEY);
    const internalCostRate = rate(INTERNAL_COST_RATE_KEY);
    if (
      srImRate === null ||
      srImRate <= 0 ||
      pmRate === null ||
      pmRate <= 0 ||
      travelRate === null ||
      travelRate <= 0 ||
      internalCostRate === null ||
      internalCostRate <= 0
    ) {
      return {
        ok: false,
        error:
          "Pricing-critical rate card rows are missing or have a non-positive rate; cannot compute the proposal subtotal.",
      };
    }

    const totals = computeProposalMigrationTotal(
      migCfg,
      migrationLinesRes.data ?? [],
      { srImRate, pmRate, travelRate, internalCostRate }
    );
    migrationTotal = totals ? totals.clientPrice : 0;
  }

  const { proposalSubtotal } = calculateProposalPricingSummary({
    scenarios: scenarioRes.data ?? [],
    migrationTotal,
    scopedTotal,
    credit: 0,
    discountPercent: 0,
  });

  return { ok: true, subtotal: proposalSubtotal };
}
