"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertManagerOrAdmin, AuthError } from "@/lib/auth/require-admin";
import { STALE_THRESHOLD_STATUSES } from "@/lib/settings/sales-ops-constants";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

const activeSchema = z.enum(["true", "false"]).transform((value) => value === "true");

const thresholdSchema = z.object({
  id: z.string().uuid("Invalid stale threshold id."),
  status: z.enum(STALE_THRESHOLD_STATUSES, {
    error: "Only active pipeline statuses can have stale thresholds.",
  }),
  thresholdDays: z.coerce
    .number()
    .int("Threshold days must be a whole number.")
    .min(1, "Threshold days must be at least 1."),
  isActive: activeSchema,
});

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function actionError(error: unknown): ActionResult {
  if (error instanceof AuthError) return { ok: false, error: error.message };
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: "Unable to save stale threshold." };
}

export async function updateStaleThreshold(
  formData: FormData
): Promise<ActionResult> {
  try {
    const user = await assertManagerOrAdmin();
    const parsed = thresholdSchema.parse({
      id: getString(formData, "id"),
      status: getString(formData, "status"),
      thresholdDays: getString(formData, "thresholdDays"),
      isActive: getString(formData, "isActive"),
    });

    const supabase = await createClient();
    const { error } = await supabase
      .from("proposal_stale_thresholds")
      .update({
        threshold_days: parsed.thresholdDays,
        is_active: parsed.isActive,
        updated_by: user.id,
      })
      .eq("id", parsed.id)
      .eq("status", parsed.status);

    if (error) throw new Error(error.message);
    revalidatePath("/admin/stale-thresholds");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function submitUpdateStaleThreshold(
  formData: FormData
): Promise<void> {
  await updateStaleThreshold(formData);
}
