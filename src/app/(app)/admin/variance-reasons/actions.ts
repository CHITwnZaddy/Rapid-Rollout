"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertManagerOrAdmin, AuthError } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const activeSchema = z.enum(["true", "false"]).transform((value) => value === "true");

const reasonSchema = z.object({
  id: z.string().uuid("Invalid variance reason id."),
  code: z.string().trim().min(1, "Reason code is required."),
  label: z.string().trim().min(1, "Reason label is required."),
  description: z.string().trim().min(1, "Reason description is required."),
  sortOrder: z.coerce
    .number()
    .int("Sort order must be a whole number.")
    .min(0, "Sort order cannot be negative."),
  isActive: activeSchema,
});

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function actionError(error: unknown): ActionResult {
  if (error instanceof AuthError) return { ok: false, error: error.message };
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: "Unable to save variance reason." };
}

export async function updateVarianceReason(
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertManagerOrAdmin();
    const parsed = reasonSchema.parse({
      id: getString(formData, "id"),
      code: getString(formData, "code"),
      label: getString(formData, "label"),
      description: getString(formData, "description"),
      sortOrder: getString(formData, "sortOrder"),
      isActive: getString(formData, "isActive"),
    });

    const supabase = await createClient();
    const { error } = await supabase
      .from("proposal_variance_reasons")
      .update({
        label: parsed.label,
        description: parsed.description,
        sort_order: parsed.sortOrder,
        is_active: parsed.isActive,
      })
      .eq("id", parsed.id)
      .eq("code", parsed.code);

    if (error) throw new Error(error.message);
    revalidatePath("/admin/variance-reasons");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

// useActionState wrapper: returns the result so the form can surface failures
// instead of silently swallowing them.
export async function submitUpdateVarianceReason(
  _prevState: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  return updateVarianceReason(formData);
}
