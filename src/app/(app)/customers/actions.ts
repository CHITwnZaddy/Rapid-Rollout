"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedResult } from "@/lib/auth/require-admin";
import {
  newCustomerSchema,
  type NewCustomerInput,
} from "@/lib/validation/customer";

export type CreateCustomerResult =
  | { ok: true; customer: { id: string; company_name: string } }
  | { ok: false; error: string };

// Inline customer creation from the New Proposal dialog. The customers
// table RLS auto-stamps created_by on insert (migration 20260424162022),
// so no ownership fields are sent from here.
export async function createCustomer(
  input: NewCustomerInput
): Promise<CreateCustomerResult> {
  const parsed = newCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid customer input.",
    };
  }

  const auth = await requireAuthenticatedResult(
    "You must be signed in to add a customer."
  );
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      company_name: parsed.data.company_name,
      address_line1: parsed.data.address_line1 || null,
      address_line2: parsed.data.address_line2 || null,
      city: parsed.data.city || null,
      state: parsed.data.state || null,
      zip: parsed.data.zip || null,
    })
    .select("id, company_name")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Couldn't create the customer.",
    };
  }

  revalidatePath("/customers");
  return { ok: true, customer: data };
}
