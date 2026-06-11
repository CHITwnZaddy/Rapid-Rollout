"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedResult } from "@/lib/auth/require-admin";
import {
  bidSheetCustomerInputSchema,
  bidSheetDiscountDollarsInputSchema,
  bidSheetDiscountPercentInputSchema,
  bidSheetNotesInputSchema,
} from "@/lib/validation/bid-sheet";
import { fetchProposalSubtotal } from "@/lib/proposals/proposal-subtotal";

export type UpdateBidSheetResult =
  | { ok: true }
  | { ok: false; error: string };

type BidSheetRow = {
  id: string;
  proposal_id: string;
};

async function loadBidSheetRow(
  proposalId: string
): Promise<
  | { ok: true; row: BidSheetRow }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bid_sheets")
    .select("id, proposal_id")
    .eq("proposal_id", proposalId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!data) {
    return {
      ok: false,
      error:
        "Bid Sheet Unavailable. This proposal is missing its bid sheet row.",
    };
  }

  return { ok: true, row: data as BidSheetRow };
}

async function revalidateBidSheetPaths(proposalId: string) {
  revalidatePath(`/proposals/${proposalId}`);
  revalidatePath(`/proposals/${proposalId}/bid-sheet`);
}

export async function updateBidSheetCustomer(
  proposalId: string,
  customerId: string
): Promise<UpdateBidSheetResult> {
  const parsed = bidSheetCustomerInputSchema.safeParse({ proposalId, customerId });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? "Invalid bid sheet customer update.",
    };
  }

  const auth = await requireAuthenticatedResult("You must be signed in to update the bid sheet customer.");
  if (!auth.ok) return auth;

  const bidSheetResult = await loadBidSheetRow(parsed.data.proposalId);
  if (!bidSheetResult.ok) {
    return { ok: false, error: bidSheetResult.error };
  }

  const supabase = await createClient();
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("id", parsed.data.customerId)
    .maybeSingle();

  if (customerError) {
    return { ok: false, error: customerError.message };
  }

  if (!customer) {
    return { ok: false, error: "Selected customer was not found." };
  }

  const { error } = await supabase
    .from("bid_sheets")
    .update({ customer_id: parsed.data.customerId })
    .eq("id", bidSheetResult.row.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  await revalidateBidSheetPaths(parsed.data.proposalId);
  return { ok: true };
}

export async function updateBidSheetDiscountPercent(
  proposalId: string,
  discountPercent: number
): Promise<UpdateBidSheetResult> {
  const parsed = bidSheetDiscountPercentInputSchema.safeParse({
    proposalId,
    discountPercent,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Invalid bid sheet discount percent update.",
    };
  }

  const auth = await requireAuthenticatedResult("You must be signed in to update the bid sheet discount percent.");
  if (!auth.ok) return auth;

  const bidSheetResult = await loadBidSheetRow(parsed.data.proposalId);
  if (!bidSheetResult.ok) {
    return { ok: false, error: bidSheetResult.error };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bid_sheets")
    .update({ discount_percent: parsed.data.discountPercent })
    .eq("id", bidSheetResult.row.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  await revalidateBidSheetPaths(parsed.data.proposalId);
  return { ok: true };
}

export async function updateBidSheetCredit(
  proposalId: string,
  discountDollars: number
): Promise<UpdateBidSheetResult> {
  const parsed = bidSheetDiscountDollarsInputSchema.safeParse({
    proposalId,
    discountDollars,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Invalid bid sheet credit update.",
    };
  }

  const auth = await requireAuthenticatedResult("You must be signed in to update the bid sheet credit.");
  if (!auth.ok) return auth;

  const bidSheetResult = await loadBidSheetRow(parsed.data.proposalId);
  if (!bidSheetResult.ok) {
    return { ok: false, error: bidSheetResult.error };
  }

  const supabase = await createClient();

  // Business rule: the credit is prepaid LoE money deducted from the
  // proposal, so it can never exceed what the proposal is worth. Computed
  // server-side — the client-displayed subtotal is not trusted.
  const subtotalResult = await fetchProposalSubtotal(
    supabase,
    parsed.data.proposalId
  );
  if (!subtotalResult.ok) {
    return { ok: false, error: subtotalResult.error };
  }
  if (parsed.data.discountDollars > subtotalResult.subtotal) {
    return {
      ok: false,
      error: `Credit ($${parsed.data.discountDollars.toLocaleString()}) cannot exceed the proposal subtotal ($${subtotalResult.subtotal.toLocaleString()}).`,
    };
  }

  const { error } = await supabase
    .from("bid_sheets")
    .update({ discount_dollars: parsed.data.discountDollars })
    .eq("id", bidSheetResult.row.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  await revalidateBidSheetPaths(parsed.data.proposalId);
  return { ok: true };
}

export async function updateBidSheetNotes(
  proposalId: string,
  notes: string
): Promise<UpdateBidSheetResult> {
  const parsed = bidSheetNotesInputSchema.safeParse({ proposalId, notes });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? "Invalid bid sheet notes update.",
    };
  }

  const auth = await requireAuthenticatedResult("You must be signed in to update bid sheet notes.");
  if (!auth.ok) return auth;

  const bidSheetResult = await loadBidSheetRow(parsed.data.proposalId);
  if (!bidSheetResult.ok) {
    return { ok: false, error: bidSheetResult.error };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bid_sheets")
    .update({ notes: parsed.data.notes })
    .eq("id", bidSheetResult.row.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  await revalidateBidSheetPaths(parsed.data.proposalId);
  return { ok: true };
}
