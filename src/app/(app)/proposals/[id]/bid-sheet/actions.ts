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
import type { Database } from "@/types/database";

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

type BidSheetUpdate =
  | { ok: true; fields: Database["public"]["Tables"]["bid_sheets"]["Update"] }
  | { ok: false; error: string };

// Shared mutation flow for the bid-sheet updaters: authenticate, load the bid
// sheet row, run the caller's pre-checks + field builder, then update +
// revalidate. Each updater supplies only its validation and fields.
async function withBidSheetMutation(
  proposalId: string,
  authMessage: string,
  buildUpdate: (
    supabase: Awaited<ReturnType<typeof createClient>>,
    row: BidSheetRow
  ) => Promise<BidSheetUpdate>
): Promise<UpdateBidSheetResult> {
  const auth = await requireAuthenticatedResult(authMessage);
  if (!auth.ok) return auth;

  const bidSheetResult = await loadBidSheetRow(proposalId);
  if (!bidSheetResult.ok) {
    return { ok: false, error: bidSheetResult.error };
  }

  const supabase = await createClient();
  const built = await buildUpdate(supabase, bidSheetResult.row);
  if (!built.ok) {
    return { ok: false, error: built.error };
  }

  const { error } = await supabase
    .from("bid_sheets")
    .update(built.fields)
    .eq("id", bidSheetResult.row.id);
  if (error) {
    return { ok: false, error: error.message };
  }

  await revalidateBidSheetPaths(proposalId);
  return { ok: true };
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

  return withBidSheetMutation(
    parsed.data.proposalId,
    "You must be signed in to update the bid sheet customer.",
    async (supabase) => {
      const { data: customer, error } = await supabase
        .from("customers")
        .select("id")
        .eq("id", parsed.data.customerId)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!customer) {
        return { ok: false, error: "Selected customer was not found." };
      }
      return { ok: true, fields: { customer_id: parsed.data.customerId } };
    }
  );
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

  return withBidSheetMutation(
    parsed.data.proposalId,
    "You must be signed in to update the bid sheet discount percent.",
    async () => ({
      ok: true,
      fields: { discount_percent: parsed.data.discountPercent },
    })
  );
}

// The UI field and this action are both called "Credit". The value persists to
// the legacy `discount_dollars` DB column (kept as-is to avoid a schema
// migration). It is a positive dollar amount — prepaid LoE money or a negotiated
// concession — subtracted from the subtotal BEFORE the % discount, per
// bid-sheet-pricing. The schema/column keep the old `discountDollars` name; the
// action parameter uses `creditAmount` to match what it actually represents.
export async function updateBidSheetCredit(
  proposalId: string,
  creditAmount: number
): Promise<UpdateBidSheetResult> {
  const parsed = bidSheetDiscountDollarsInputSchema.safeParse({
    proposalId,
    discountDollars: creditAmount,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ??
        "Invalid bid sheet credit update.",
    };
  }

  return withBidSheetMutation(
    parsed.data.proposalId,
    "You must be signed in to update the bid sheet credit.",
    async (supabase) => {
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
      return {
        ok: true,
        fields: { discount_dollars: parsed.data.discountDollars },
      };
    }
  );
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

  return withBidSheetMutation(
    parsed.data.proposalId,
    "You must be signed in to update bid sheet notes.",
    async () => ({ ok: true, fields: { notes: parsed.data.notes } })
  );
}
