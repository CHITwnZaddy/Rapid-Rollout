"use server";

import { createClient } from "@/lib/supabase/server";

export type DeleteProposalResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Deletes a proposal after re-authenticating the user and writing an audit
 * record to change_log. All child records cascade via FK ON DELETE CASCADE.
 *
 * Guards:
 *  - User must be authenticated.
 *  - Password must match (re-auth via signInWithPassword).
 *  - RLS on proposals enforces created_by = auth.uid() — the delete will
 *    silently no-op if the row isn't owned by this user, so we check the
 *    delete count explicitly and surface a clean error.
 */
export async function deleteProposal(
  proposalId: string,
  justification: string,
  password: string
): Promise<DeleteProposalResult> {
  const supabase = await createClient();

  // 1. Identify the current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, error: "You must be signed in to delete a proposal." };
  }

  // 2. Re-authenticate — this is the friction gate for non-draft proposals.
  //    We call signInWithPassword silently; if it fails the password is wrong.
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password,
  });

  if (authError) {
    return { ok: false, error: "Incorrect password. Deletion cancelled." };
  }

  // 3. Fetch minimal proposal data so we can record it in the audit log.
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
