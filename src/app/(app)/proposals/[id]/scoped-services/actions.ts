"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedResult } from "@/lib/auth/require-admin";
import { buildRateCardMap, calculateScopedServiceCost } from "@/lib/calculations/engine";
import {
  addScopedServiceLineInputSchema,
  SCOPED_SERVICE_TYPES,
  updateScopedServiceLineInputSchema,
  deleteScopedServiceLineInputSchema,
} from "@/lib/validation/scoped-services";
import type { Database } from "@/types/database";

export type ScopedServiceLine = Pick<
  Database["public"]["Tables"]["scoped_services"]["Row"],
  | "id"
  | "service_type"
  | "description"
  | "hours"
  | "rate_card_lookup_key"
  | "cost"
  | "row_order"
>;

export type ScopedServiceActionResult =
  | { ok: true; lines: ScopedServiceLine[] }
  | { ok: false; error: string };

type ProposalRow = Pick<Database["public"]["Tables"]["proposals"]["Row"], "id">;

type RateCardRow = Pick<
  Database["public"]["Tables"]["rate_cards"]["Row"],
  "lookup_key" | "rate" | "activity" | "role_category"
>;

function sortScopedLines(lines: ScopedServiceLine[]): ScopedServiceLine[] {
  return [...lines].sort((a, b) => {
    if (a.row_order !== b.row_order) return a.row_order - b.row_order;
    return a.id.localeCompare(b.id);
  });
}

async function revalidateScopedServicePaths(proposalId: string) {
  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath(`/proposals/${proposalId}/scoped-services`);
}

async function loadProposal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  proposalId: string
): Promise<
  | { ok: true; proposal: ProposalRow }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from("proposals")
    .select("id")
    .eq("id", proposalId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!data) {
    return {
      ok: false,
      error: "Scoped Services Unavailable. This proposal was not found.",
    };
  }

  return { ok: true, proposal: data as ProposalRow };
}

async function loadScopedServiceLines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  proposalId: string
): Promise<
  | { ok: true; lines: ScopedServiceLine[] }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from("scoped_services")
    .select(
      "id, service_type, description, hours, rate_card_lookup_key, cost, row_order"
    )
    .eq("proposal_id", proposalId);

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Couldn't load scoped service rows.",
    };
  }

  return { ok: true, lines: sortScopedLines(data as ScopedServiceLine[]) };
}

async function loadActiveRateCards(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<
  | { ok: true; rateCards: RateCardRow[] }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from("rate_cards")
    .select("lookup_key, rate, activity, role_category")
    .eq("status", "Active")
    .order("lookup_key");

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Couldn't load active rate cards.",
    };
  }

  return { ok: true, rateCards: data as RateCardRow[] };
}

async function resequenceScopedRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  proposalId: string,
  lines: ScopedServiceLine[]
): Promise<
  | { ok: true; lines: ScopedServiceLine[] }
  | { ok: false; error: string }
> {
  const sortedLines = sortScopedLines(lines);
  const updates = sortedLines
    .map((line, index) => ({
      id: line.id,
      nextRowOrder: index,
      currentRowOrder: line.row_order,
    }))
    .filter((line) => line.currentRowOrder !== line.nextRowOrder);

  for (const update of updates) {
    const { error } = await supabase
      .from("scoped_services")
      .update({ row_order: update.nextRowOrder })
      .eq("id", update.id)
      .eq("proposal_id", proposalId);

    if (error) {
      return { ok: false, error: error.message };
    }
  }

  return {
    ok: true,
    lines: sortedLines.map((line, index) => ({
      ...line,
      row_order: index,
    })),
  };
}

export async function addScopedServiceLine(
  proposalId: string
): Promise<ScopedServiceActionResult> {
  const parsed = addScopedServiceLineInputSchema.safeParse({ proposalId });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? "Invalid scoped service add request.",
    };
  }

  const auth = await requireAuthenticatedResult("You must be signed in to add scoped service lines.");
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const proposalResult = await loadProposal(supabase, parsed.data.proposalId);
  if (!proposalResult.ok) {
    return { ok: false, error: proposalResult.error };
  }

  const lineResult = await loadScopedServiceLines(supabase, parsed.data.proposalId);
  if (!lineResult.ok) {
    return { ok: false, error: lineResult.error };
  }

  const rateCardResult = await loadActiveRateCards(supabase);
  if (!rateCardResult.ok) {
    return { ok: false, error: rateCardResult.error };
  }

  const defaultLookupKey = rateCardResult.rateCards[0]?.lookup_key;
  if (!defaultLookupKey) {
    return {
      ok: false,
      error: "No active rate card rows are available for Scoped Services.",
    };
  }

  const nextRowOrder =
    lineResult.lines.reduce((max, line) => Math.max(max, line.row_order), -1) + 1;

  const insertPayload: Database["public"]["Tables"]["scoped_services"]["Insert"] = {
    proposal_id: parsed.data.proposalId,
    service_type: SCOPED_SERVICE_TYPES[0],
    description: "",
    hours: 0,
    rate_card_lookup_key: defaultLookupKey,
    cost: 0,
    row_order: nextRowOrder,
  };

  const { error } = await supabase.from("scoped_services").insert(insertPayload);
  if (error) {
    return { ok: false, error: error.message };
  }

  const refreshedLineResult = await loadScopedServiceLines(
    supabase,
    parsed.data.proposalId
  );
  if (!refreshedLineResult.ok) {
    return { ok: false, error: refreshedLineResult.error };
  }

  await revalidateScopedServicePaths(parsed.data.proposalId);
  return { ok: true, lines: refreshedLineResult.lines };
}

export async function updateScopedServiceLine(
  proposalId: string,
  lineId: string,
  input: {
    serviceType: string;
    description: string;
    hours: number;
    rateCardLookupKey: string;
  }
): Promise<ScopedServiceActionResult> {
  const parsed = updateScopedServiceLineInputSchema.safeParse({
    proposalId,
    lineId,
    serviceType: input.serviceType,
    description: input.description,
    hours: input.hours,
    rateCardLookupKey: input.rateCardLookupKey,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Invalid scoped service update request.",
    };
  }

  const auth = await requireAuthenticatedResult("You must be signed in to update scoped service lines.");
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const proposalResult = await loadProposal(supabase, parsed.data.proposalId);
  if (!proposalResult.ok) {
    return { ok: false, error: proposalResult.error };
  }

  const lineResult = await loadScopedServiceLines(supabase, parsed.data.proposalId);
  if (!lineResult.ok) {
    return { ok: false, error: lineResult.error };
  }

  const existingLine = lineResult.lines.find((line) => line.id === parsed.data.lineId);
  if (!existingLine) {
    return {
      ok: false,
      error: "Scoped service line not found for this proposal.",
    };
  }

  const rateCardResult = await loadActiveRateCards(supabase);
  if (!rateCardResult.ok) {
    return { ok: false, error: rateCardResult.error };
  }

  const rateCardMap = buildRateCardMap(rateCardResult.rateCards);
  if (!rateCardMap.has(parsed.data.rateCardLookupKey)) {
    return {
      ok: false,
      error: "Selected scoped service rate card was not found.",
    };
  }

  const nextCost = calculateScopedServiceCost(
    parsed.data.hours,
    rateCardMap,
    parsed.data.rateCardLookupKey
  );

  const { error } = await supabase
    .from("scoped_services")
    .update({
      service_type: parsed.data.serviceType,
      description: parsed.data.description,
      hours: parsed.data.hours,
      rate_card_lookup_key: parsed.data.rateCardLookupKey,
      cost: nextCost,
    })
    .eq("id", parsed.data.lineId)
    .eq("proposal_id", parsed.data.proposalId);

  if (error) {
    return { ok: false, error: error.message };
  }

  const refreshedLineResult = await loadScopedServiceLines(
    supabase,
    parsed.data.proposalId
  );
  if (!refreshedLineResult.ok) {
    return { ok: false, error: refreshedLineResult.error };
  }

  await revalidateScopedServicePaths(parsed.data.proposalId);
  return { ok: true, lines: refreshedLineResult.lines };
}

export async function deleteScopedServiceLine(
  proposalId: string,
  lineId: string
): Promise<ScopedServiceActionResult> {
  const parsed = deleteScopedServiceLineInputSchema.safeParse({
    proposalId,
    lineId,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Invalid scoped service delete request.",
    };
  }

  const auth = await requireAuthenticatedResult("You must be signed in to delete scoped service lines.");
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const proposalResult = await loadProposal(supabase, parsed.data.proposalId);
  if (!proposalResult.ok) {
    return { ok: false, error: proposalResult.error };
  }

  const lineResult = await loadScopedServiceLines(supabase, parsed.data.proposalId);
  if (!lineResult.ok) {
    return { ok: false, error: lineResult.error };
  }

  const existingLine = lineResult.lines.find((line) => line.id === parsed.data.lineId);
  if (!existingLine) {
    return {
      ok: false,
      error: "Scoped service line not found for this proposal.",
    };
  }

  const { error } = await supabase
    .from("scoped_services")
    .delete()
    .eq("id", parsed.data.lineId)
    .eq("proposal_id", parsed.data.proposalId);

  if (error) {
    return { ok: false, error: error.message };
  }

  const refreshedLineResult = await loadScopedServiceLines(
    supabase,
    parsed.data.proposalId
  );
  if (!refreshedLineResult.ok) {
    return { ok: false, error: refreshedLineResult.error };
  }

  const resequenceResult = await resequenceScopedRows(
    supabase,
    parsed.data.proposalId,
    refreshedLineResult.lines
  );
  if (!resequenceResult.ok) {
    return { ok: false, error: resequenceResult.error };
  }

  await revalidateScopedServicePaths(parsed.data.proposalId);
  return { ok: true, lines: resequenceResult.lines };
}
