import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { applyComplexity } from "@/lib/calculations/complexity";
import { calculateProposalPricingSummary } from "@/lib/calculations/proposal-pricing";
import {
  calculateMigrationTotals,
  type MigrationConfig as EngineMigrationConfig,
  type MigrationDetailLine,
} from "@/lib/calculations/migration-engine";
import { toEngineLine } from "@/lib/calculations/adapters";
import { NUM } from "@/lib/calculations/num";
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
      pmRate === null ||
      travelRate === null ||
      internalCostRate === null
    ) {
      return {
        ok: false,
        error:
          "Pricing-critical rate card rows are missing; cannot compute the proposal subtotal.",
      };
    }

    const migLines = migrationLinesRes.data ?? [];
    const numP = NUM(migCfg.num_projects);
    const engineCfg: EngineMigrationConfig = {
      num_projects: numP,
      hrs_per_import: NUM(migCfg.hrs_per_import),
      lines_per_import_file: NUM(migCfg.lines_per_import_file),
      is_effort_included: migCfg.is_effort_included ?? false,
      is_workshop_included: migCfg.is_workshop_included ?? false,
      complexity_factor: NUM(migCfg.complexity_factor),
      sr_im_trips: NUM(migCfg.sr_im_trips),
      pm_trips: NUM(migCfg.pm_trips),
      doc_avg_mb_per_project: NUM(migCfg.doc_avg_mb_per_project),
      doc_mb_per_hour: NUM(migCfg.doc_mb_per_hour),
      core_requirements_hrs: NUM(migCfg.core_requirements_hrs),
      core_migration_plan_hrs: NUM(migCfg.core_migration_plan_hrs),
      core_validation_hrs: NUM(migCfg.core_validation_hrs),
      core_final_qa_hrs: NUM(migCfg.core_final_qa_hrs),
      core_pm_oversight_hrs: NUM(migCfg.core_pm_oversight_hrs),
    };
    const projectLines: MigrationDetailLine[] = migLines
      .filter((l) => l.section === "project")
      .map((l) => toEngineLine(l, { quantityOverride: numP }));
    const workflowLines: MigrationDetailLine[] = migLines
      .filter((l) => l.section === "workflow")
      .map((l) => toEngineLine(l));
    const costLines: MigrationDetailLine[] = migLines
      .filter((l) => l.section === "cost")
      .map((l) => toEngineLine(l));

    migrationTotal = calculateMigrationTotals(
      engineCfg,
      projectLines,
      workflowLines,
      costLines,
      srImRate,
      pmRate,
      travelRate,
      internalCostRate
    ).clientPrice;
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
