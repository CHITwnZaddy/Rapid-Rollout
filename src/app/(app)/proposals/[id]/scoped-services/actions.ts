"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedResult } from "@/lib/auth/require-admin";
import { buildRateCardMap, calculateScopedServiceCost } from "@/lib/calculations/engine";
import { roundMoney } from "@/lib/calculations/rounding";
import {
  addScopedServiceLineInputSchema,
  SCOPED_SERVICE_TYPES,
  scopedServiceLineRowsSchema,
  updateScopedServiceLineInputSchema,
  deleteScopedServiceLineInputSchema,
} from "@/lib/validation/scoped-services";
import { safeParseSupabaseResult } from "@/lib/validation/parse-supabase";
import {
  checkAffectedRows,
  PROPOSAL_EDIT_NOT_PERMITTED,
} from "@/lib/supabase/affected-rows";
import type { Database } from "@/types/database";
import { z } from "zod";

// Row schemas kept local: this "use server" module can only export async
// functions. Nullability mirrors the generated DB types.
const proposalIdRowSchema = z.object({ id: z.string() });
const rateCardRowSchema = z.object({
  lookup_key: z.string(),
  rate: z.number(),
  activity: z.string(),
  role_category: z.string(),
});
const rateCardRowsSchema = z.array(rateCardRowSchema);

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

  const parsed = safeParseSupabaseResult(proposalIdRowSchema, {
    data,
    error: null,
  });
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  return { ok: true, proposal: parsed.data };
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

  const parsed = safeParseSupabaseResult(scopedServiceLineRowsSchema, {
    data,
    error: null,
  });
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  return { ok: true, lines: sortScopedLines(parsed.data) };
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

  const parsed = safeParseSupabaseResult(rateCardRowsSchema, {
    data,
    error: null,
  });
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  return { ok: true, rateCards: parsed.data };
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

  // Round at the persistence edge so the stored cost matches the bid sheet
  // display (rounding policy: money to the cent).
  const nextCost = roundMoney(
    calculateScopedServiceCost(
      parsed.data.hours,
      rateCardMap,
      parsed.data.rateCardLookupKey
    )
  );

  // RLS lets only the proposal's owner or an admin write scoped_services. A
  // refused update returns no error and zero rows, so count the rows changed
  // (the line was just confirmed to exist above).
  const { error, count } = await supabase
    .from("scoped_services")
    .update(
      {
        service_type: parsed.data.serviceType,
        description: parsed.data.description,
        hours: parsed.data.hours,
        rate_card_lookup_key: parsed.data.rateCardLookupKey,
        cost: nextCost,
      },
      { count: "exact" }
    )
    .eq("id", parsed.data.lineId)
    .eq("proposal_id", parsed.data.proposalId);

  const written = checkAffectedRows({ error, count }, PROPOSAL_EDIT_NOT_PERMITTED);
  if (!written.ok) return written;

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

  // The RPC is SECURITY INVOKER, so RLS applies to its DELETE, and it raises
  // when no row was removed (IF NOT FOUND). A refused delete therefore
  // surfaces as an error here rather than a silent success.
  const { error } = await supabase
    .rpc("delete_scoped_service_line", {
      p_proposal_id: parsed.data.proposalId,
      p_line_id: parsed.data.lineId,
    });

  if (error) {
    if (!error.message.includes("was not found for proposal")) {
      return { ok: false, error: error.message };
    }
    // The RPC raises the same "not found" error whether the line is missing
    // or RLS hid it from the DELETE. Every signed-in user can read the lines,
    // so a line that is still there means the delete was refused.
    const remaining = await loadScopedServiceLines(
      supabase,
      parsed.data.proposalId
    );
    const stillThere =
      remaining.ok &&
      remaining.lines.some((line) => line.id === parsed.data.lineId);
    return {
      ok: false,
      error: stillThere
        ? PROPOSAL_EDIT_NOT_PERMITTED
        : "Scoped service line not found for this proposal.",
    };
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

// Clear Tab: remove every scoped service line for the proposal.
// RLS limits the delete to proposals the caller can edit, and a refused
// delete returns no error and zero rows. Count the proposal's rows first
// (reads are open to every signed-in user) so a refused clear is reported,
// while clearing an already-empty proposal still succeeds.
export async function clearScopedServices(
  proposalId: string
): Promise<ScopedServiceActionResult> {
  const parsed = z.uuid("Invalid proposal id").safeParse(proposalId);
  if (!parsed.success) {
    return { ok: false, error: "Invalid proposal id" };
  }

  const auth = await requireAuthenticatedResult(
    "You must be signed in to clear scoped services."
  );
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const proposalResult = await loadProposal(supabase, parsed.data);
  if (!proposalResult.ok) {
    return { ok: false, error: proposalResult.error };
  }

  const existingLineResult = await loadScopedServiceLines(supabase, parsed.data);
  if (!existingLineResult.ok) {
    return { ok: false, error: existingLineResult.error };
  }
  const expectedCount = existingLineResult.lines.length;

  const { error, count } = await supabase
    .from("scoped_services")
    .delete({ count: "exact" })
    .eq("proposal_id", parsed.data);

  if (error) {
    return { ok: false, error: error.message };
  }

  if (expectedCount > 0 && (count === null || count < expectedCount)) {
    return { ok: false, error: PROPOSAL_EDIT_NOT_PERMITTED };
  }

  await revalidateScopedServicePaths(parsed.data);
  return { ok: true, lines: [] };
}
