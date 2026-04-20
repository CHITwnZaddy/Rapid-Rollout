"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { PROPOSAL_STATUSES, type ProposalStatus } from "@/lib/constants/statuses";
import { assertAuthenticated, AuthError } from "@/lib/auth/require-admin";

export type DeleteProposalResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateComplexityFactorResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateProposalStatusResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Commit a status transition for a proposal.
 *
 *  1. Validate the new status against the allow-list.
 *  2. Read the current status so we can record the transition's
 *     old_status honestly (don't trust what the client sent).
 *  3. If unchanged → no-op, no history row written.
 *  4. Update proposals.status and insert a history row.
 *
 * Note: Supabase JS can't do a true transaction from client libs,
 * but the ordering here is safe — if the history insert fails, the
 * status update has already happened and we surface the error so
 * the user can retry (the next save will record the transition
 * against the now-current status).
 */
export async function updateProposalStatus(
  proposalId: string,
  newStatus: string
): Promise<UpdateProposalStatusResult> {
  if (!PROPOSAL_STATUSES.includes(newStatus as ProposalStatus)) {
    return { ok: false, error: `Invalid status: ${newStatus}` };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { ok: false, error: "You must be signed in to change status." };
  }

  const { data: existing, error: readError } = await supabase
    .from("proposals")
    .select("status")
    .eq("id", proposalId)
    .single();

  if (readError || !existing) {
    return {
      ok: false,
      error: "Proposal not found or you do not have permission to edit it.",
    };
  }

  if (existing.status === newStatus) {
    return { ok: true };
  }

  const { error: updateError } = await supabase
    .from("proposals")
    .update({ status: newStatus })
    .eq("id", proposalId);

  if (updateError) {
    return { ok: false, error: `Failed to update status: ${updateError.message}` };
  }

  const { error: historyError } = await supabase
    .from("proposal_status_history")
    .insert({
      proposal_id: proposalId,
      old_status: existing.status,
      new_status: newStatus,
      changed_by: user.id,
    });

  if (historyError) {
    return {
      ok: false,
      error: `Status saved, but history record failed: ${historyError.message}`,
    };
  }

  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath("/proposals");
  return { ok: true };
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

  try {
    await assertAuthenticated();
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  const supabase = await createClient();
  const rounded = Math.round(value * 100) / 100;

  // RLS on scenarios restricts UPDATE to rows whose parent proposal
  // has created_by = auth.uid(). assertAuthenticated above is
  // defense-in-depth — if RLS were ever relaxed, the action still
  // refuses to run for anonymous callers.
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

  try {
    await assertAuthenticated();
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

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
