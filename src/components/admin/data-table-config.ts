import { type ColumnDef } from "./data-table-utils";

export type AdminTableName = "customers" | "rate_cards" | "service_hours";
export type AdminRow = Record<string, unknown> & { id: string };

type AdminTableAuth = "authenticated" | "admin";

export type AdminTableConfig = {
  columns: ColumnDef[];
  createDefaults: Record<string, unknown>;
  auth: AdminTableAuth;
  revalidatePaths: string[];
};

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
    },
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
    },
    auth: "admin",
    revalidatePaths: ["/admin/rate-cards"],
  },
  service_hours: {
    columns: [
      { key: "service_name", label: "Service Name", type: "text" },
      { key: "scope_value", label: "Scope Value", type: "text" },
      { key: "scope_label", label: "Scope Label", type: "text" },
      { key: "sr_im_hours", label: "Sr. IM Hrs", type: "number", width: "100px" },
      { key: "pm_hours", label: "PM Hrs", type: "number", width: "100px" },
      { key: "ba_hours", label: "BA Hrs", type: "number", width: "100px" },
      { key: "service_group", label: "Group", type: "text" },
      { key: "status", label: "Status", type: "text", width: "100px" },
      { key: "lookup_key", label: "Lookup Key", type: "text" },
    ],
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
    },
    auth: "admin",
    revalidatePaths: ["/admin/service-hours"],
  },
};

export function getAdminTableConfig(tableName: AdminTableName): AdminTableConfig {
  return adminTableConfigs[tableName];
}
