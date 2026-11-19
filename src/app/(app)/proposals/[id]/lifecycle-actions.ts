"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { PROPOSAL_STATUSES, type ProposalStatus } from "@/lib/constants/statuses";
import { isClosedProposalStatus } from "@/lib/proposals/status";
import {
  PROPOSAL_CHANGE_NOT_SAVED,
  checkAffectedRows,
} from "@/lib/supabase/affected-rows";
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

export type UpdateProposalStatusResult =
  | { ok: true }
  | { ok: false; error: string };

export type CloseProposalResult =
  | { ok: true }
  | { ok: false; error: string };

export type CorrectClosedProposalFinancialsInput = ClosedWonCloseoutInput & {
  correctionNote: string;
};

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

// Raised by transition_proposal_status() when its row lock finds no proposal.
const TRANSITION_PROPOSAL_NOT_FOUND =
  "Proposal not found or you do not have permission to edit it.";

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
    // Any signed-in user may change a proposal's status, so neither of these
    // errors means "not permitted":
    //  - The RPC's not-found text ("...or you do not have permission to edit
    //    it") can only mean the proposal is gone (deleted, e.g. in another
    //    tab).
    //  - The RPC is SECURITY INVOKER, so its history insert goes through RLS.
    //    That policy only needs a signed-in caller and an existing proposal;
    //    this branch is a backstop for a deleted proposal or an ended session.
    // Show the shared not-saved message instead of the raw Postgres text.
    if (
      error.message.includes(TRANSITION_PROPOSAL_NOT_FOUND) ||
      error.message.includes("row-level security")
    ) {
      return { ok: false, error: PROPOSAL_CHANGE_NOT_SAVED };
    }
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
  // Any signed-in user may update proposals. An UPDATE that matches no row
  // (the proposal was deleted, or the session ended) returns no error and
  // zero rows, so count the affected rows and stop before the status
  // transition runs.
  const updated = await supabase
    .from("proposals")
    .update(
      {
        sold_price: parsed.data.soldPrice,
        loe_value: parsed.data.loeValue,
        loe_signed_date: parsed.data.loeSignedDate,
        variance_reason_code: parsed.data.varianceReasonCode,
        variance_note: parsed.data.varianceNote,
        closed_lost_reason: null,
        closed_lost_note: null,
      },
      { count: "exact" }
    )
    .eq("id", proposalId);

  const updateCheck = checkAffectedRows(updated, PROPOSAL_CHANGE_NOT_SAVED);
  if (!updateCheck.ok) return updateCheck;

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
  const updated = await supabase
    .from("proposals")
    .update(
      {
        closed_lost_reason: parsed.data.closedLostReason,
        closed_lost_note: parsed.data.closedLostNote,
        loe_signed_date: null,
        loe_value: null,
        variance_reason_code: null,
        variance_note: null,
      },
      { count: "exact" }
    )
    .eq("id", proposalId);

  const updateCheck = checkAffectedRows(updated, PROPOSAL_CHANGE_NOT_SAVED);
  if (!updateCheck.ok) return updateCheck;

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
  const updated = await supabase
    .from("proposals")
    .update(
      {
        sold_price: parsed.data.soldPrice,
        loe_value: parsed.data.loeValue,
        loe_signed_date: parsed.data.loeSignedDate,
        variance_reason_code: parsed.data.varianceReasonCode,
        variance_note: parsed.data.varianceNote,
        closed_financials_corrected_at: correctedAt,
        closed_financials_corrected_by: managerId,
      },
      { count: "exact" }
    )
    .eq("id", proposalId);

  const updateCheck = checkAffectedRows(updated, PROPOSAL_CHANGE_NOT_SAVED);
  if (!updateCheck.ok) return updateCheck;

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
