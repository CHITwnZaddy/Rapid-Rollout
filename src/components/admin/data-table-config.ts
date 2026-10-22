import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { safeParseSupabaseResult } from "@/lib/validation/parse-supabase";
import { type ColumnDef } from "./data-table-utils";

export type AdminTableName = "customers" | "rate_cards" | "service_hours";
export type AdminRow = Record<string, unknown> & { id: string };

// The generic admin table reads columns dynamically, so it only needs a
// guaranteed string id; catchall preserves every other column untouched.
// This validates the id contract without duplicating each table's columns.
export const adminRowSchema = z
  .object({ id: z.string() })
  .catchall(z.unknown());
export const adminRowsSchema = z.array(adminRowSchema);

type AdminTableAuth = "authenticated" | "admin";

export type AdminSupabaseClient = SupabaseClient<Database>;

export type ComputeCreateDefaultsResult =
  | { ok: true; defaults: Record<string, unknown> }
  | { ok: false; error: string };

// Insert types mark every NOT NULL column without a DB default as required, so
// `satisfies` on each table's createDefaults turns a missing column into a tsc
// error instead of a Postgres not-null violation when "Add Row" runs.
type AdminTableInsert<T extends AdminTableName> =
  Database["public"]["Tables"][T]["Insert"];

export type AdminTableConfig = {
  columns: ColumnDef[];
  // Static values for a new row; see buildNewRow for __AUTO__ token handling.
  createDefaults: Record<string, unknown>;
  // Optional defaults that depend on the rows already in the table. Runs on
  // the server inside addAdminTableRow and is merged over createDefaults.
  computeCreateDefaults?: (
    supabase: AdminSupabaseClient
  ) => Promise<ComputeCreateDefaultsResult>;
  auth: AdminTableAuth;
  revalidatePaths: string[];
};

const maxSortOrderRowSchema = z.object({ sort_order: z.number() }).nullable();

// service_hours.sort_order is NOT NULL with no DB default (migration
// 20260424195025_service_hours_sort_order), and create_proposal_bundle orders
// proposal modules by MIN(sort_order) per service_name. A new row therefore
// takes max(sort_order) + 1 so it lands after every existing service; the
// first row on an empty table starts at 0.
async function computeServiceHoursCreateDefaults(
  supabase: AdminSupabaseClient
): Promise<ComputeCreateDefaultsResult> {
  const result = await supabase
    .from("service_hours")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const parsed = safeParseSupabaseResult(maxSortOrderRowSchema, result);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  return {
    ok: true,
    defaults: { sort_order: (parsed.data?.sort_order ?? -1) + 1 },
  };
}

export const adminTableConfigs: Record<AdminTableName, AdminTableConfig> = {
  customers: {
    columns: [
      { key: "company_name", label: "Company Name", type: "text" },
      { key: "address_line1", label: "Address 1", type: "text" },
      { key: "address_line2", label: "Address 2", type: "text" },
      { key: "city", label: "City", type: "text" },
      { key: "state", label: "State", type: "text", width: "80px" },
      { key: "zip", label: "Zip", type: "text", width: "100px" },
    ],
    createDefaults: {
      company_name: "New Company",
      address_line1: "",
      city: "",
      state: "",
      zip: "",
    } satisfies AdminTableInsert<"customers">,
    auth: "authenticated",
    revalidatePaths: ["/customers", "/admin/customers"],
  },
  rate_cards: {
    columns: [
      { key: "rate_card_name", label: "Rate Card", type: "text" },
      { key: "activity", label: "Activity / Role", type: "text" },
      { key: "rate", label: "Rate ($/hr)", type: "number", width: "120px" },
      { key: "role_category", label: "Category", type: "text" },
      { key: "status", label: "Status", type: "text", width: "100px" },
      { key: "lookup_key", label: "Lookup Key", type: "text" },
    ],
    createDefaults: {
      rate_card_name: "Master",
      activity: "New Role",
      rate: 0,
      role_category: "Professional Services",
      status: "Active",
      lookup_key: "Master|NewRole__AUTO__",
    } satisfies AdminTableInsert<"rate_cards">,
    auth: "admin",
    revalidatePaths: ["/admin/rate-cards"],
  },
  service_hours: {
    columns: [
      { key: "service_name", label: "Service Name", type: "text" },
      { key: "sort_order", label: "Sort Order", type: "number", width: "100px" },
      { key: "scope_value", label: "Scope Value", type: "text" },
      { key: "scope_label", label: "Scope Label", type: "text" },
      { key: "sr_im_hours", label: "Sr. IM Hrs", type: "number", width: "100px" },
      { key: "pm_hours", label: "PM Hrs", type: "number", width: "100px" },
      { key: "ba_hours", label: "BA Hrs", type: "number", width: "100px" },
      { key: "service_group", label: "Group", type: "text" },
      { key: "status", label: "Status", type: "text", width: "100px" },
      { key: "lookup_key", label: "Lookup Key", type: "text" },
    ],
    // sort_order is required as well; computeCreateDefaults supplies it per
    // insert because the right value depends on the rows already present.
    createDefaults: {
      service_name: "New Service",
      scope_value: "Included",
      scope_label: "Included",
      sr_im_hours: 0,
      pm_hours: 0,
      ba_hours: 0,
      service_group: "Core",
      status: "Active",
      lookup_key: "NewService|Included__AUTO__",
    } satisfies Omit<AdminTableInsert<"service_hours">, "sort_order">,
    computeCreateDefaults: computeServiceHoursCreateDefaults,
    auth: "admin",
    revalidatePaths: ["/admin/service-hours"],
  },
};

export function getAdminTableConfig(tableName: AdminTableName): AdminTableConfig {
  return adminTableConfigs[tableName];
}
