"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertManagerOrAdmin, AuthError } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

const calendarYearSchema = z.coerce
  .number()
  .int("Year must be a calendar year.")
  .min(2000, "Year must be a calendar year.")
  .max(2100, "Year must be a calendar year.");

const activeSchema = z.enum(["true", "false"]).transform((value) => value === "true");

const idSchema = z.object({
  id: z.string().uuid("Invalid KPI target id."),
});

const yearTargetSchema = z.object({
  id: z.string().uuid("Invalid KPI year target id."),
  year: calendarYearSchema,
  label: z.string().trim().min(1, "Label is required."),
  teamQuota: z.coerce
    .number()
    .finite("Team quota must be a number.")
    .nonnegative("Team quota cannot be negative."),
  isActive: activeSchema,
});

const userTargetSchema = z.object({
  id: z.string().uuid("Invalid KPI user target id.").optional(),
  year: calendarYearSchema,
  userId: z.string().uuid("Invalid SE user id."),
  targetAmount: z.coerce
    .number()
    .finite("Target amount must be a number.")
    .nonnegative("Target amount cannot be negative."),
  isActive: activeSchema,
});

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function actionError(error: unknown): ActionResult {
  if (error instanceof AuthError) return { ok: false, error: error.message };
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: "Unable to save KPI target." };
}

export async function updateKpiYearTarget(
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertManagerOrAdmin();
    const parsed = yearTargetSchema.parse({
      id: getString(formData, "id"),
      year: getString(formData, "year"),
      label: getString(formData, "label"),
      teamQuota: getString(formData, "teamQuota"),
      isActive: getString(formData, "isActive"),
    });

    const supabase = await createClient();
    const { error } = await supabase
      .from("kpi_year_targets")
      .update({
        year: parsed.year,
        label: parsed.label,
        team_quota: parsed.teamQuota,
        is_active: parsed.isActive,
      })
      .eq("id", parsed.id);

    if (error) throw new Error(error.message);
    revalidatePath("/admin/kpi-targets");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function submitUpdateKpiYearTarget(formData: FormData): Promise<void> {
  await updateKpiYearTarget(formData);
}

export async function deleteKpiYearTarget(
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertManagerOrAdmin();
    const parsed = idSchema.parse({ id: getString(formData, "id") });

    const supabase = await createClient();
    const { error } = await supabase
      .from("kpi_year_targets")
      .delete()
      .eq("id", parsed.id);

    if (error) throw new Error(error.message);
    revalidatePath("/admin/kpi-targets");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function submitDeleteKpiYearTarget(formData: FormData): Promise<void> {
  await deleteKpiYearTarget(formData);
}

export async function upsertKpiUserTarget(
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertManagerOrAdmin();
    const id = getString(formData, "id");
    const parsed = userTargetSchema.parse({
      id: id.length > 0 ? id : undefined,
      year: getString(formData, "year"),
      userId: getString(formData, "userId"),
      targetAmount: getString(formData, "targetAmount"),
      isActive: getString(formData, "isActive"),
    });

    const supabase = await createClient();
    const { error } = await supabase.from("kpi_user_targets").upsert(
      {
        ...(parsed.id ? { id: parsed.id } : {}),
        year: parsed.year,
        user_id: parsed.userId,
        target_amount: parsed.targetAmount,
        is_active: parsed.isActive,
      },
      { onConflict: "year,user_id" }
    );

    if (error) throw new Error(error.message);
    revalidatePath("/admin/kpi-targets");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function submitUpsertKpiUserTarget(formData: FormData): Promise<void> {
  await upsertKpiUserTarget(formData);
}

export async function deleteKpiUserTarget(
  formData: FormData
): Promise<ActionResult> {
  try {
    await assertManagerOrAdmin();
    const parsed = idSchema.parse({ id: getString(formData, "id") });

    const supabase = await createClient();
    const { error } = await supabase
      .from("kpi_user_targets")
      .delete()
      .eq("id", parsed.id);

    if (error) throw new Error(error.message);
    revalidatePath("/admin/kpi-targets");
    return { ok: true };
  } catch (error) {
    return actionError(error);
  }
}

export async function submitDeleteKpiUserTarget(formData: FormData): Promise<void> {
  await deleteKpiUserTarget(formData);
}
