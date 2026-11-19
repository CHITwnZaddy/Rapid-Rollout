"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAuthenticatedResult } from "@/lib/auth/require-admin";
import {
  checkAffectedRows,
  PROPOSAL_EDIT_NOT_PERMITTED,
  PROPOSAL_ROW_NOT_PERMITTED,
} from "@/lib/supabase/affected-rows";

export type UpdateComplexityFactorResult =
  | { ok: true }
  | { ok: false; error: string };

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

  // RLS on scenarios restricts UPDATE to the parent proposal's owner or an
  // admin. The action-level auth check keeps anonymous callers out before
  // RLS runs. A refused update returns no error and zero rows, so count the
  // rows actually changed.
  const { error, count } = await supabase
    .from("scenarios")
    .update({ complexity_factor: rounded }, { count: "exact" })
    .eq("id", scenarioId);

  const written = checkAffectedRows(
    { error, count },
    PROPOSAL_EDIT_NOT_PERMITTED
  );
  if (!written.ok) return written;

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

  // RLS on proposals restricts UPDATE to the owner, a manager or an admin.
  // A refused update returns no error and zero rows, so count the rows
  // actually changed.
  const { error, count } = await supabase
    .from("proposals")
    .update({ scoped_complexity_factor: rounded }, { count: "exact" })
    .eq("id", proposalId);

  const written = checkAffectedRows(
    { error, count },
    PROPOSAL_ROW_NOT_PERMITTED
  );
  if (!written.ok) return written;

  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath("/proposals");
  return { ok: true };
}
