"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedResult } from "@/lib/auth/require-admin";
import { fetchRequiredRates } from "@/lib/supabase/queries";
import {
  INTERNAL_COST_RATE_KEY,
  PM_RATE_KEY,
  SR_IM_RATE_KEY,
  TRAVEL_RATE_KEY,
} from "@/lib/rate-card-keys";
import {
  computeMigrationTotalsFromState,
  type MigrationConfigState,
  type MigrationLineState,
  type MigrationRateInputs,
} from "@/lib/migration/compute-totals-from-state";
import {
  addMigrationDetailLineSchema,
  removeMigrationDetailLineSchema,
  type MigrationSection,
} from "@/lib/validation/migration";
import type { Database } from "@/types/database";

export type MigrationDetailActionResult =
  | { ok: true; lines: MigrationLineState[] }
  | { ok: false; error: string };

type MigrationConfigRow = MigrationConfigState & {
  id: string;
  proposal_id: string;
  computed_total_cost: number;
};

type MigrationDetailLineRow = MigrationLineState & {
  proposal_id: string;
};

const SECTION_ORDER: Record<MigrationSection, number> = {
  project: 0,
  workflow: 1,
  cost: 2,
};

const DEFAULT_LABELS: Record<MigrationSection, string> = {
  project: "New Item",
  workflow: "WF Object Name",
  cost: "TBD",
};

function sortMigrationLines<T extends MigrationLineState>(lines: T[]): T[] {
  return [...lines].sort((a, b) => {
    const sectionCompare =
      SECTION_ORDER[a.section as MigrationSection] -
      SECTION_ORDER[b.section as MigrationSection];
    if (sectionCompare !== 0) return sectionCompare;
    if (a.row_order !== b.row_order) return a.row_order - b.row_order;
    return a.id.localeCompare(b.id);
  });
}

function stripProposalId(lines: MigrationDetailLineRow[]): MigrationLineState[] {
  return lines.map((line) => ({
    id: line.id,
    section: line.section,
    label: line.label,
    quantity: line.quantity,
    items_per_object: line.items_per_object,
    total_line_items: line.total_line_items,
    row_order: line.row_order,
  }));
}

async function loadMigrationConfig(
  supabase: Awaited<ReturnType<typeof createClient>>,
  proposalId: string
): Promise<
  | { ok: true; config: MigrationConfigRow }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from("migration_config")
    .select("*")
    .eq("proposal_id", proposalId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!data) {
    return {
      ok: false,
      error:
        "Migration Services Unavailable. This proposal is missing its migration configuration row.",
    };
  }

  return { ok: true, config: data as MigrationConfigRow };
}

async function loadMigrationLines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  proposalId: string
): Promise<
  | { ok: true; lines: MigrationDetailLineRow[] }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from("migration_detail_lines")
    .select("*")
    .eq("proposal_id", proposalId);

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Couldn't load migration detail rows.",
    };
  }

  return { ok: true, lines: sortMigrationLines(data as MigrationDetailLineRow[]) };
}

async function loadMigrationRates(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<
  | { ok: true; rates: MigrationRateInputs }
  | { ok: false; error: string }
> {
  const result = await fetchRequiredRates(supabase, [
    SR_IM_RATE_KEY,
    PM_RATE_KEY,
    TRAVEL_RATE_KEY,
    INTERNAL_COST_RATE_KEY,
  ]);

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    rates: {
      srImRate: result.rates.get(SR_IM_RATE_KEY) ?? null,
      pmRate: result.rates.get(PM_RATE_KEY) ?? null,
      travelRate: result.rates.get(TRAVEL_RATE_KEY) ?? null,
      internalCostRate: result.rates.get(INTERNAL_COST_RATE_KEY) ?? null,
    },
  };
}

async function updateComputedTotal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  config: MigrationConfigRow,
  lines: MigrationDetailLineRow[],
  rates: MigrationRateInputs
): Promise<{ ok: true } | { ok: false; error: string }> {
  const totals = computeMigrationTotalsFromState(config, lines, rates);
  if (!totals) {
    return {
      ok: false,
      error: "Couldn't recompute migration totals after updating rows.",
    };
  }

  const { error } = await supabase
    .from("migration_config")
    .update({
      computed_total_cost: totals.clientPrice,
      updated_at: new Date().toISOString(),
    })
    .eq("id", config.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

function resequenceSectionRows(
  lines: MigrationDetailLineRow[],
  section: MigrationSection
): {
  lines: MigrationDetailLineRow[];
  updates: Array<{ id: string; row_order: number }>;
} {
  const sectionLines = sortMigrationLines(
    lines.filter((line) => line.section === section)
  );
  const nextById = new Map(
    sectionLines.map((line, index) => [
      line.id,
      { ...line, row_order: index },
    ])
  );

  const updates = sectionLines
    .map((line, index) => ({ id: line.id, row_order: index, current: line.row_order }))
    .filter((line) => line.current !== line.row_order)
    .map(({ id, row_order }) => ({ id, row_order }));

  const resequenced = sortMigrationLines(
    lines.map((line) => nextById.get(line.id) ?? line)
  );

  return { lines: resequenced, updates };
}

async function revalidateMigrationPaths(proposalId: string) {
  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath(`/proposals/${proposalId}/migration`);
}

export async function addMigrationDetailLine(
  proposalId: string,
  section: MigrationSection
): Promise<MigrationDetailActionResult> {
  const parsed = addMigrationDetailLineSchema.safeParse({ proposalId, section });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Invalid migration row add request.",
    };
  }

  const auth = await requireAuthenticatedResult("You must be signed in to add migration rows.");
  if (!auth.ok) return auth;

  const supabase = await createClient();

  const configResult = await loadMigrationConfig(supabase, parsed.data.proposalId);
  if (!configResult.ok) {
    return { ok: false, error: configResult.error };
  }

  const lineResult = await loadMigrationLines(supabase, parsed.data.proposalId);
  if (!lineResult.ok) {
    return { ok: false, error: lineResult.error };
  }

  const rateResult = await loadMigrationRates(supabase);
  if (!rateResult.ok) {
    return { ok: false, error: rateResult.error };
  }

  const nextOrder = lineResult.lines
    .filter((line) => line.section === parsed.data.section)
    .reduce((max, line) => Math.max(max, line.row_order), -1) + 1;

  const insertPayload: Database["public"]["Tables"]["migration_detail_lines"]["Insert"] =
    {
      proposal_id: parsed.data.proposalId,
      section: parsed.data.section,
      label: DEFAULT_LABELS[parsed.data.section],
      quantity: 0,
      items_per_object: 0,
      total_line_items: 0,
      row_order: nextOrder,
    };

  const { error: insertError } = await supabase
    .from("migration_detail_lines")
    .insert(insertPayload);

  if (insertError) {
    return {
      ok: false,
      error: `Couldn't add migration detail row. ${insertError.message}`,
    };
  }

  const reloadedLines = await loadMigrationLines(supabase, parsed.data.proposalId);
  if (!reloadedLines.ok) {
    return { ok: false, error: reloadedLines.error };
  }

  const totalUpdate = await updateComputedTotal(
    supabase,
    configResult.config,
    reloadedLines.lines,
    rateResult.rates
  );
  if (!totalUpdate.ok) {
    return { ok: false, error: totalUpdate.error };
  }

  await revalidateMigrationPaths(parsed.data.proposalId);

  return {
    ok: true,
    lines: stripProposalId(reloadedLines.lines),
  };
}

export async function removeMigrationDetailLine(
  proposalId: string,
  lineId: string
): Promise<MigrationDetailActionResult> {
  const parsed = removeMigrationDetailLineSchema.safeParse({ proposalId, lineId });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Invalid migration row delete request.",
    };
  }

  const auth = await requireAuthenticatedResult("You must be signed in to remove migration rows.");
  if (!auth.ok) return auth;

  const supabase = await createClient();

  const configResult = await loadMigrationConfig(supabase, parsed.data.proposalId);
  if (!configResult.ok) {
    return { ok: false, error: configResult.error };
  }

  const lineResult = await loadMigrationLines(supabase, parsed.data.proposalId);
  if (!lineResult.ok) {
    return { ok: false, error: lineResult.error };
  }

  const targetLine = lineResult.lines.find((line) => line.id === parsed.data.lineId);
  if (!targetLine) {
    return {
      ok: false,
      error: "Migration detail row not found for this proposal.",
    };
  }

  const rateResult = await loadMigrationRates(supabase);
  if (!rateResult.ok) {
    return { ok: false, error: rateResult.error };
  }

  const { error: deleteError } = await supabase
    .from("migration_detail_lines")
    .delete()
    .eq("id", parsed.data.lineId);

  if (deleteError) {
    return {
      ok: false,
      error: `Couldn't delete migration detail row. ${deleteError.message}`,
    };
  }

  const remainingLineResult = await loadMigrationLines(
    supabase,
    parsed.data.proposalId
  );
  if (!remainingLineResult.ok) {
    return { ok: false, error: remainingLineResult.error };
  }

  const resequenced = resequenceSectionRows(
    remainingLineResult.lines,
    targetLine.section as MigrationSection
  );

  for (const update of resequenced.updates) {
    const { error } = await supabase
      .from("migration_detail_lines")
      .update({ row_order: update.row_order })
      .eq("id", update.id);

    if (error) {
      return {
        ok: false,
        error: `Couldn't resequence migration rows. ${error.message}`,
      };
    }
  }

  const totalUpdate = await updateComputedTotal(
    supabase,
    configResult.config,
    resequenced.lines,
    rateResult.rates
  );
  if (!totalUpdate.ok) {
    return { ok: false, error: totalUpdate.error };
  }

  await revalidateMigrationPaths(parsed.data.proposalId);

  return {
    ok: true,
    lines: stripProposalId(resequenced.lines),
  };
}
