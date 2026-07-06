"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAuthenticatedResult } from "@/lib/auth/require-admin";

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
