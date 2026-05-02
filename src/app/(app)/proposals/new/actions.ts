"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { AuthError, assertAuthenticated } from "@/lib/auth/require-admin";
import { newProposalSchema } from "@/lib/validation/proposal";

export type CreateProposalResult =
  | { ok: true; proposalId: string }
  | { ok: false; error: string };

export async function createProposal(
  input: { name: string; customerId?: string }
): Promise<CreateProposalResult> {
  const parsed = newProposalSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid proposal input",
    };
  }

  try {
    await assertAuthenticated();
  } catch (e) {
    if (e instanceof AuthError) {
      return { ok: false, error: "You must be logged in." };
    }
    throw e;
  }

  const supabase = await createClient();
  const { name, customerId } = parsed.data;

  const { data, error } = await supabase.rpc("create_proposal_bundle", {
    p_name: name,
    p_customer_id: customerId || undefined,
  });

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Failed to create proposal",
    };
  }

  revalidatePath("/proposals");
  revalidatePath("/dashboard");

  return { ok: true, proposalId: data };
}
