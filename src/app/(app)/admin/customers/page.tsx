// Phase 2.7 — admin page, middleware + layout double-check the
// admin role on every request. Content is shared lookup data;
// 60s revalidation is safe.
export const revalidate = 60;

import { createClient } from "@/lib/supabase/server";
import {
  AdminDataTable,
  type AdminRow,
} from "@/components/admin/data-table";
import { getAdminTableConfig } from "@/components/admin/data-table-config";

export default async function CustomersPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("*")
    .order("company_name");
  const config = getAdminTableConfig("customers");

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Customers</h1>
      <AdminDataTable
        tableName="customers"
        columns={config.columns}
        initialData={(data as AdminRow[]) ?? []}
      />
    </div>
  );
}
