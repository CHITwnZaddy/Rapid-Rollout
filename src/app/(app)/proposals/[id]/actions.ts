"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { PROPOSAL_STATUSES, type ProposalStatus } from "@/lib/constants/statuses";
import { isClosedProposalStatus } from "@/lib/proposals/status";
import {
  buildRateCardMap,
  buildServiceHoursMap,
  type RateCardRow,
  type ServiceHoursRow,
} from "@/lib/calculations/engine";
import {
  requireAuthenticatedResult,
  requireManagerOrAdminResult,
} from "@/lib/auth/require-admin";
import {
  type ClosedLostCloseoutInput,
  type ClosedWonCloseoutInput,
  validateClosedLostCloseout,
  validateClosedWonCloseout,
} from "@/lib/proposals/closeout";
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
import { renameProposalSchema } from "@/lib/validation/proposal";
import { buildDeleteConfirmationPhrase } from "@/lib/proposals/delete-confirmation";
import type { Database } from "@/types/database";

export type DeleteProposalResult =
  | { ok: true }
  | { ok: false; error: string };

export type RenameProposalResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

export type UpdateComplexityFactorResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateProposalStatusResult =
  | { ok: true }
  | { ok: false; error: string };

export type CloseProposalResult =
  | { ok: true }
  | { ok: false; error: string };

export type CorrectClosedProposalFinancialsInput = ClosedWonCloseoutInput & {
  correctionNote: string;
};

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

/**
 * Commit a status transition for a proposal.
 *
 *  1. Validate the new status against the allow-list.
 *  2. Delegate the change to the atomic Postgres RPC so status and
 *     history are written together.
 *  3. If unchanged → no-op, no history row written.
 */
export async function updateProposalStatus(
  proposalId: string,
  newStatus: string
): Promise<UpdateProposalStatusResult> {
  if (!PROPOSAL_STATUSES.includes(newStatus as ProposalStatus)) {
    return { ok: false, error: `Invalid status: ${newStatus}` };
  }

  if (isClosedProposalStatus(newStatus)) {
    return { ok: false, error: `${newStatus} requires closeout details.` };
  }

  return transitionProposalStatus(proposalId, newStatus as ProposalStatus);
}

async function transitionProposalStatus(
  proposalId: string,
  newStatus: ProposalStatus
): Promise<UpdateProposalStatusResult> {
  const supabase = await createClient();
  const auth = await requireAuthenticatedResult("You must be signed in to change status.");
  if (!auth.ok) return auth;

  const { data: changed, error } = await supabase.rpc(
    "transition_proposal_status",
    {
      p_proposal_id: proposalId,
      p_new_status: newStatus,
    }
  );

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!changed) {
    return { ok: true };
  }

  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath("/proposals");
  return { ok: true };
}

export async function closeProposalWon(
  proposalId: string,
  input: ClosedWonCloseoutInput
): Promise<CloseProposalResult> {
  const parsed = validateClosedWonCloseout(input);
  if (!parsed.ok) return parsed;

  const auth = await requireAuthenticatedResult("You must be signed in to close a proposal.");
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("proposals")
    .update({
      sold_price: parsed.data.soldPrice,
      loe_value: parsed.data.loeValue,
      loe_signed_date: parsed.data.loeSignedDate,
      variance_reason_code: parsed.data.varianceReasonCode,
      variance_note: parsed.data.varianceNote,
      closed_lost_reason: null,
      closed_lost_note: null,
    })
    .eq("id", proposalId);

  if (updateError) return { ok: false, error: updateError.message };

  const transitioned = await transitionProposalStatus(proposalId, "Closed Won");
  if (!transitioned.ok) return transitioned;

  return { ok: true };
}

export async function closeProposalLost(
  proposalId: string,
  input: ClosedLostCloseoutInput
): Promise<CloseProposalResult> {
  const parsed = validateClosedLostCloseout(input);
  if (!parsed.ok) return parsed;

  const auth = await requireAuthenticatedResult("You must be signed in to close a proposal.");
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { error: updateError } = await supabase
    .from("proposals")
    .update({
      closed_lost_reason: parsed.data.closedLostReason,
      closed_lost_note: parsed.data.closedLostNote,
      loe_signed_date: null,
      loe_value: null,
      variance_reason_code: null,
      variance_note: null,
    })
    .eq("id", proposalId);

  if (updateError) return { ok: false, error: updateError.message };

  const transitioned = await transitionProposalStatus(proposalId, "Closed Lost");
  if (!transitioned.ok) return transitioned;

  return { ok: true };
}

export async function correctClosedProposalFinancials(
  proposalId: string,
  input: CorrectClosedProposalFinancialsInput
): Promise<CloseProposalResult> {
  const auth = await requireManagerOrAdminResult();
  if (!auth.ok) return auth;
  const managerId = auth.user.id;

  const parsed = validateClosedWonCloseout(input);
  if (!parsed.ok) return parsed;

  const correctionNote = input.correctionNote.trim();
  if (correctionNote.length < 10) {
    return { ok: false, error: "Correction note must be at least 10 characters." };
  }

  const supabase = await createClient();
  const correctedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("proposals")
    .update({
      sold_price: parsed.data.soldPrice,
      loe_value: parsed.data.loeValue,
      loe_signed_date: parsed.data.loeSignedDate,
      variance_reason_code: parsed.data.varianceReasonCode,
      variance_note: parsed.data.varianceNote,
      closed_financials_corrected_at: correctedAt,
      closed_financials_corrected_by: managerId,
    })
    .eq("id", proposalId);

  if (updateError) return { ok: false, error: updateError.message };

  const { error: logError } = await supabase.from("change_log").insert({
    proposal_id: proposalId,
    table_name: "proposals",
    record_id: proposalId,
    action: "UPDATE",
    changed_by: managerId,
    old_values: null,
    new_values: {
      correction_note: correctionNote,
      sold_price: parsed.data.soldPrice,
      loe_value: parsed.data.loeValue,
      loe_signed_date: parsed.data.loeSignedDate,
      variance_reason_code: parsed.data.varianceReasonCode,
    },
  });

  if (logError) return { ok: false, error: logError.message };

  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath("/proposals");
  return { ok: true };
}

/**
 * Rename a proposal.
 *
 * Authorization is layered:
 *  - The action-level requireAuthenticatedResult keeps anonymous callers out
 *    before any query runs.
 *  - RLS ("Users can update own proposals or admin") restricts the UPDATE to
 *    the proposal owner or an admin. A blocked update matches zero rows
 *    rather than erroring, so we request an exact count and surface a clean
 *    permission error when nothing was updated.
 */
export async function renameProposal(
  proposalId: string,
  name: string
): Promise<RenameProposalResult> {
  const parsed = renameProposalSchema.safeParse({ name });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid proposal name.",
    };
  }

  const auth = await requireAuthenticatedResult(
    "You must be signed in to rename a proposal."
  );
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("proposals")
    .update({ name: parsed.data.name }, { count: "exact" })
    .eq("id", proposalId);

  if (error) return { ok: false, error: error.message };
  if (count === 0) {
    return {
      ok: false,
      error: "Proposal not found or you do not have permission to rename it.",
    };
  }

  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath("/proposals");
  return { ok: true, name: parsed.data.name };
}

function validateFactor(value: number): string | null {
  if (!Number.isFinite(value) || value < 0.5 || value > 9.99) {
    return "Complexity factor must be between 0.50 and 9.99.";
  }
  return null;
}

export async function updateScenarioComplexityFactor(
  scenarioId: string,
  proposalId: string,
  value: number
): Promise<UpdateComplexityFactorResult> {
  const err = validateFactor(value);
  if (err) return { ok: false, error: err };

  const auth = await requireAuthenticatedResult("You must be signed in.");
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const rounded = Math.round(value * 100) / 100;

  // RLS on scenarios restricts UPDATE to rows whose parent proposal
  // has created_by = auth.uid(). The action-level auth check keeps
  // anonymous callers out before RLS runs.
  const { error } = await supabase
    .from("scenarios")
    .update({ complexity_factor: rounded })
    .eq("id", scenarioId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath("/proposals");
  return { ok: true };
}

export async function updateScopedComplexityFactor(
  proposalId: string,
  value: number
): Promise<UpdateComplexityFactorResult> {
  const err = validateFactor(value);
  if (err) return { ok: false, error: err };

  const auth = await requireAuthenticatedResult("You must be signed in.");
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const rounded = Math.round(value * 100) / 100;

  // RLS on proposals enforces created_by ownership.
  const { error } = await supabase
    .from("proposals")
    .update({ scoped_complexity_factor: rounded })
    .eq("id", proposalId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath("/proposals");
  return { ok: true };
}

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

  const { data: scenarioData, error: scenarioError } = await supabase
    .from("scenarios")
    .select("id, proposal_id, scenario_type")
    .eq("id", parsed.data.scenarioId)
    .eq("proposal_id", parsed.data.proposalId)
    .single();

  const scenario = scenarioData as ScenarioRecord | null;

  if (scenarioError || !scenario) {
    return {
      ok: false,
      error: "Scenario not found or you do not have permission to edit it.",
    };
  }

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

/**
 * Deletes a proposal after confirming user intent and writing an audit
 * record to change_log. All child records cascade via FK ON DELETE CASCADE.
 *
 * Guards:
 *  - User must be authenticated and match the Supabase user record.
 *  - Caller must submit a typed-confirmation string matching the proposal
 *    name exactly — this is a friction gate, not an auth boundary.
 *  - RLS on proposals enforces created_by = auth.uid() — the delete will
 *    silently no-op if the row isn't owned by this user, so we check the
 *    delete count explicitly and surface a clean error.
 *
 * Why no password re-auth: the previous implementation called
 * supabase.auth.signInWithPassword() as a friction gate. That issued a new
 * session/refresh token on every delete attempt (potentially invalidating
 * the active session) and pushed the plaintext password through the server
 * action pipeline. The server-side auth boundary is the authenticated
 * user check plus RLS; the typed-confirmation string replaces only the
 * UX friction.
 */
export async function deleteProposal(
  proposalId: string,
  justification: string,
  confirmationText: string
): Promise<DeleteProposalResult> {
  const auth = await requireAuthenticatedResult("You must be signed in to delete a proposal.");
  if (!auth.ok) return auth;

  const supabase = await createClient();

  // 1. Identify the current user (for the audit log payload).
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "You must be signed in to delete a proposal." };
  }

  // 2. Fetch minimal proposal data so we can record it in the audit log
  //    AND validate the typed confirmation against the current name.
  const { data: proposal, error: fetchError } = await supabase
    .from("proposals")
    .select("id, name, status, created_by")
    .eq("id", proposalId)
    .single();

  if (fetchError || !proposal) {
    return {
      ok: false,
      error: "Proposal not found or you do not have permission to delete it.",
    };
  }

  // 3. Typed-confirmation friction gate. Compare trimmed strings so trailing
  //    whitespace from the textbox doesn't cause confusing false negatives.
  const expectedPhrase = buildDeleteConfirmationPhrase(proposal.name);
  if (confirmationText.trim() !== expectedPhrase) {
    return {
      ok: false,
      error: `Confirmation text did not match. Type "${expectedPhrase}" exactly to delete.`,
    };
  }

  // 4. Write the audit record BEFORE deleting so the proposal FK is still live.
  const { error: logError } = await supabase.from("change_log").insert({
    proposal_id: proposalId,
    table_name: "proposals",
    record_id: proposalId,
    action: "DELETE",
    changed_by: user.id,
    old_values: {
      name: proposal.name,
      status: proposal.status,
    },
    new_values: {
      justification: justification.trim(),
      deleted_by_email: user.email,
    },
  });

  if (logError) {
    return {
      ok: false,
      error: `Audit log failed — deletion aborted. (${logError.message})`,
    };
  }

  // 5. Delete the proposal. All child tables cascade automatically.
  const { error: deleteError, count } = await supabase
    .from("proposals")
    .delete({ count: "exact" })
    .eq("id", proposalId);

  if (deleteError) {
    return { ok: false, error: `Delete failed: ${deleteError.message}` };
  }

  if (count === 0) {
    return {
      ok: false,
      error: "Proposal not found or you do not have permission to delete it.",
    };
  }

  return { ok: true };
}
