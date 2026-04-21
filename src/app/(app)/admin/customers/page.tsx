// Phase 2.7 — admin page, middleware + layout double-check the
// admin role on every request. Content is shared lookup data;
// 60s revalidation is safe.
export const revalidate = 60;

import { createClient } from "@/lib/supabase/server";
import {
  AdminDataTable,
  type AdminRow,
  type ColumnDef,
} from "@/components/admin/data-table";

const columns: ColumnDef[] = [
  { key: "company_name", label: "Company Name", type: "text" },
  { key: "address_line1", label: "Address 1", type: "text" },
  { key: "address_line2", label: "Address 2", type: "text" },
  { key: "city", label: "City", type: "text" },
  { key: "state", label: "State", type: "text", width: "80px" },
  { key: "zip", label: "Zip", type: "text", width: "100px" },
];

export default async function CustomersPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("*")
    .order("company_name");

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Customers</h1>
      <AdminDataTable
        tableName="customers"
        columns={columns}
        initialData={(data as AdminRow[]) ?? []}
        createDefaults={{
          company_name: "New Company",
          address_line1: "",
          city: "",
          state: "",
          zip: "",
        }}
      />
    </div>
  );
}
