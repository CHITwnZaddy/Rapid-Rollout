"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  AuthError,
  assertAdmin,
  assertAuthenticated,
} from "@/lib/auth/require-admin";
import {
  buildNewRow,
  normalizeEditableValue,
  type ColumnDef,
} from "./data-table-utils";
import {
  getAdminTableConfig,
  type AdminRow,
  type AdminTableName,
} from "./data-table-config";

const adminTableNameSchema = z.enum(["customers", "rate_cards", "service_hours"]);

const addAdminRowInputSchema = z.object({
  tableName: adminTableNameSchema,
});

const updateAdminCellInputSchema = z.object({
  tableName: adminTableNameSchema,
  rowId: z.uuid("Invalid row id."),
  key: z.string().min(1, "Column key is required."),
  rawValue: z.string({ error: "Edited value must be text." }),
});

const deleteAdminRowInputSchema = z.object({
  tableName: adminTableNameSchema,
  rowId: z.uuid("Invalid row id."),
});

export type AdminActionResult =
  | { ok: true; row?: AdminRow }
  | { ok: false; error: string };

async function assertTablePermission(tableName: AdminTableName): Promise<AdminActionResult> {
  const { auth } = getAdminTableConfig(tableName);

  try {
    if (auth === "admin") {
      await assertAdmin();
    } else {
      await assertAuthenticated();
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        ok: false,
        error:
          auth === "admin"
            ? "Admin access required for this table."
            : "You must be signed in to edit this table.",
      };
    }
    throw error;
  }

  return { ok: true };
}

async function revalidateAdminTablePaths(tableName: AdminTableName) {
  const { revalidatePaths } = getAdminTableConfig(tableName);
  for (const path of revalidatePaths) {
    revalidatePath(path);
  }
}

async function loadRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tableName: AdminTableName,
  rowId: string
): Promise<
  | { ok: true; row: AdminRow }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .eq("id", rowId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }

  if (!data) {
    return { ok: false, error: "The requested row was not found." };
  }

  return { ok: true, row: data as AdminRow };
}

function findEditableColumn(
  columns: ColumnDef[],
  key: string
): ColumnDef | null {
  return (
    columns.find((column) => column.key === key && column.editable !== false) ?? null
  );
}

export async function addAdminTableRow(tableName: AdminTableName): Promise<AdminActionResult> {
  const parsed = addAdminRowInputSchema.safeParse({ tableName });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid add-row request.",
    };
  }

  const permission = await assertTablePermission(parsed.data.tableName);
  if (!permission.ok) {
    return permission;
  }

  const { columns, createDefaults } = getAdminTableConfig(parsed.data.tableName);
  const supabase = await createClient();
  const nextRow = buildNewRow(columns, createDefaults, Date.now());
  const { data, error } = await supabase
    .from(parsed.data.tableName)
    .insert(nextRow as never)
    .select()
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "No row was returned after insert.",
    };
  }

  await revalidateAdminTablePaths(parsed.data.tableName);
  return { ok: true, row: data as AdminRow };
}

export async function updateAdminTableCell(
  tableName: AdminTableName,
  rowId: string,
  key: string,
  rawValue: string
): Promise<AdminActionResult> {
  const parsed = updateAdminCellInputSchema.safeParse({
    tableName,
    rowId,
    key,
    rawValue,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid cell update request.",
    };
  }

  const permission = await assertTablePermission(parsed.data.tableName);
  if (!permission.ok) {
    return permission;
  }

  const { columns } = getAdminTableConfig(parsed.data.tableName);
  const column = findEditableColumn(columns, parsed.data.key);
  if (!column) {
    return {
      ok: false,
      error: "Couldn't save that field because its column is missing.",
    };
  }

  const normalized = normalizeEditableValue(parsed.data.rawValue, column);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  const supabase = await createClient();
  const rowResult = await loadRow(supabase, parsed.data.tableName, parsed.data.rowId);
  if (!rowResult.ok) {
    return { ok: false, error: rowResult.error };
  }

  const { error } = await supabase
    .from(parsed.data.tableName)
    .update({ [parsed.data.key]: normalized.value } as never)
    .eq("id", parsed.data.rowId);

  if (error) {
    return { ok: false, error: error.message };
  }

  const refreshedRowResult = await loadRow(
    supabase,
    parsed.data.tableName,
    parsed.data.rowId
  );
  if (!refreshedRowResult.ok) {
    return { ok: false, error: refreshedRowResult.error };
  }

  await revalidateAdminTablePaths(parsed.data.tableName);
  return { ok: true, row: refreshedRowResult.row };
}

export async function deleteAdminTableRow(
  tableName: AdminTableName,
  rowId: string
): Promise<AdminActionResult> {
  const parsed = deleteAdminRowInputSchema.safeParse({ tableName, rowId });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid delete-row request.",
    };
  }

  const permission = await assertTablePermission(parsed.data.tableName);
  if (!permission.ok) {
    return permission;
  }

  const supabase = await createClient();
  const rowResult = await loadRow(supabase, parsed.data.tableName, parsed.data.rowId);
  if (!rowResult.ok) {
    return { ok: false, error: rowResult.error };
  }

  const { error } = await supabase
    .from(parsed.data.tableName)
    .delete()
    .eq("id", parsed.data.rowId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await revalidateAdminTablePaths(parsed.data.tableName);
  return { ok: true };
}
