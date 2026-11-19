"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAuthenticatedResult } from "@/lib/auth/require-admin";
import { isAdminRole } from "@/lib/auth/roles";
import { renameProposalSchema } from "@/lib/validation/proposal";
import { buildDeleteConfirmationPhrase } from "@/lib/proposals/delete-confirmation";

export type RenameProposalResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

export type DeleteProposalResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Rename a proposal.
 *
 * Any signed-in user can rename any proposal (SEs act as backups for each
 * other):
 *  - The action-level requireAuthenticatedResult keeps anonymous callers out
 *    before any query runs.
 *  - RLS ("Authenticated users can update proposals") lets every
 *    authenticated user UPDATE the proposals row. So when the update matches
 *    zero rows the proposal is gone (deleted, e.g. in another tab), not
 *    refused; we request an exact count to catch that and ask the user to
 *    reload.
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
      error: "Proposal not found. It may have been deleted. Reload the page and try again.",
    };
  }

  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath("/proposals");
  return { ok: true, name: parsed.data.name };
}

/**
 * Deletes a proposal after confirming user intent and writing an audit
 * record to change_log. All child records cascade via FK ON DELETE CASCADE.
 *
 * Guards:
 *  - User must be authenticated and match the Supabase user record.
 *  - Only the proposal's owner (created_by) or an admin may delete it. Any
 *    signed-in user can edit a proposal (SEs back each other up), but delete
 *    stays owner-or-admin in RLS ("Users can delete own proposals or admin").
 *    We check ownership up front, before the typed confirmation and the
 *    change_log insert, so a non-owner never leaves a change_log DELETE row
 *    for a delete RLS would refuse.
 *  - Caller must submit a typed-confirmation string matching the proposal
 *    name exactly — this is a friction gate, not an auth boundary.
 *  - RLS on proposals is still the real boundary: a refused or already-gone
 *    delete silently matches zero rows, so we check the delete count
 *    explicitly and surface a clean error.
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

  // 1. Identify the current user (for the ownership check and the audit log
  //    payload).
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

  // 3. Ownership pre-check. Delete is owner-or-admin (RLS); without this a
  //    non-owner would write a change_log DELETE row below and then have the
  //    delete itself refused (zero rows), leaving a false audit record. The
  //    role comes from app_metadata, which only the service role can write.
  if (proposal.created_by !== user.id && !isAdminRole(user.app_metadata?.role)) {
    return {
      ok: false,
      error: "Only the proposal's owner or an admin can delete it.",
    };
  }

  // 4. Typed-confirmation friction gate. Compare trimmed strings so trailing
  //    whitespace from the textbox doesn't cause confusing false negatives.
  const expectedPhrase = buildDeleteConfirmationPhrase(proposal.name);
  if (confirmationText.trim() !== expectedPhrase) {
    return {
      ok: false,
      error: `Confirmation text did not match. Type "${expectedPhrase}" exactly to delete. (If the proposal was just renamed, reload the page first.)`,
    };
  }

  // 5. Write the audit record BEFORE deleting so the proposal FK is still live.
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

  // 6. Delete the proposal. All child tables cascade automatically.
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
