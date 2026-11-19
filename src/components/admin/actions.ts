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
  adminRowSchema,
  getAdminTableConfig,
  type AdminRow,
  type AdminTableName,
} from "./data-table-config";
import { safeParseSupabaseResult } from "@/lib/validation/parse-supabase";
import {
  CUSTOMER_EDIT_NOT_PERMITTED,
  ROW_NOT_SAVED,
  checkAffectedRows,
} from "@/lib/supabase/affected-rows";

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

// Postgres foreign_key_violation. proposals.customer_id and
// bid_sheets.customer_id reference customers with no ON DELETE action, so an
// admin deleting a customer that is still in use gets this error.
const FOREIGN_KEY_VIOLATION = "23503";

const CUSTOMER_IN_USE_MESSAGE =
  "This customer can't be deleted because proposals still use it.";

// RLS turns a refused UPDATE/DELETE into "no error, zero rows". Customers can
// be changed by their creator or an admin; rate cards and service hours only
// by admins (assertTablePermission already gates those, so a zero count there
// usually means the row disappeared between the load and the write).
function notPermittedMessage(tableName: AdminTableName): string {
  return tableName === "customers" ? CUSTOMER_EDIT_NOT_PERMITTED : ROW_NOT_SAVED;
}

// The customer delete policy also refuses the creator while any proposal still
// uses the customer. proposals are readable by every authenticated user, so a
// refused delete can be explained accurately instead of blaming ownership.
async function customerHasProposals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  customerId: string
): Promise<boolean> {
  const { error, count } = await supabase
    .from("proposals")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId);

  return !error && (count ?? 0) > 0;
}

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

  const parsed = safeParseSupabaseResult(adminRowSchema, { data, error: null });
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  return { ok: true, row: parsed.data };
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

  const { columns, createDefaults, computeCreateDefaults } = getAdminTableConfig(
    parsed.data.tableName
  );
  const supabase = await createClient();

  // Table-specific defaults that depend on existing rows (for example
  // service_hours.sort_order). A failed lookup aborts the add instead of
  // inserting a row that would violate NOT NULL or land in the wrong position.
  let computedDefaults: Record<string, unknown> = {};
  if (computeCreateDefaults) {
    const computed = await computeCreateDefaults(supabase);
    if (!computed.ok) {
      return { ok: false, error: computed.error };
    }
    computedDefaults = computed.defaults;
  }

  const nextRow = buildNewRow(
    columns,
    { ...createDefaults, ...computedDefaults },
    Date.now()
  );
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

  const parsedRow = safeParseSupabaseResult(adminRowSchema, {
    data,
    error: null,
  });
  if (!parsedRow.ok) {
    return { ok: false, error: parsedRow.error };
  }

  await revalidateAdminTablePaths(parsed.data.tableName);
  return { ok: true, row: parsedRow.data };
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

  // loadRow just found the row, so zero affected rows means RLS refused it.
  const { error, count } = await supabase
    .from(parsed.data.tableName)
    .update({ [parsed.data.key]: normalized.value } as never, { count: "exact" })
    .eq("id", parsed.data.rowId);

  const updated = checkAffectedRows(
    { error, count },
    notPermittedMessage(parsed.data.tableName)
  );
  if (!updated.ok) {
    return updated;
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

  // loadRow just found the row, so zero affected rows means RLS refused it.
  const { error, count } = await supabase
    .from(parsed.data.tableName)
    .delete({ count: "exact" })
    .eq("id", parsed.data.rowId);

  const isCustomer = parsed.data.tableName === "customers";
  if (isCustomer && error?.code === FOREIGN_KEY_VIOLATION) {
    return { ok: false, error: CUSTOMER_IN_USE_MESSAGE };
  }

  const deleted = checkAffectedRows(
    { error, count },
    notPermittedMessage(parsed.data.tableName)
  );
  if (!deleted.ok) {
    if (
      isCustomer &&
      !error &&
      (await customerHasProposals(supabase, parsed.data.rowId))
    ) {
      return { ok: false, error: CUSTOMER_IN_USE_MESSAGE };
    }
    return deleted;
  }

  await revalidateAdminTablePaths(parsed.data.tableName);
  return { ok: true };
}
