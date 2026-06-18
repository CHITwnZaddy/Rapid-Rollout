// Middleware and the admin layout check the role on every request.
// Customer lookup data can use a short shared cache window.
export const revalidate = 60;

import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/auth/page-guards";
import {
  AdminDataTable,
  type AdminRow,
} from "@/components/admin/data-table";
import { getAdminTableConfig } from "@/components/admin/data-table-config";

export default async function CustomersPage() {
  await requireAdminPage();

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
