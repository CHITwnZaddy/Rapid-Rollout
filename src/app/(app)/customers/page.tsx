// Customer data is shared across all users; middleware gates auth.
export const revalidate = 60;

import { createClient } from "@/lib/supabase/server";
import { AdminDataTable } from "@/components/admin/data-table";
import {
  adminRowsSchema,
  getAdminTableConfig,
} from "@/components/admin/data-table-config";
import { safeParseSupabaseResult } from "@/lib/validation/parse-supabase";

export default async function CustomersPage() {
  const supabase = await createClient();
  const result = await supabase
    .from("customers")
    .select("*")
    .order("company_name");
  const parsed = safeParseSupabaseResult(adminRowsSchema, result);
  const config = getAdminTableConfig("customers");

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Customers</h1>
      {parsed.ok ? (
        <AdminDataTable
          tableName="customers"
          columns={config.columns}
          initialData={parsed.data}
        />
      ) : (
        <p className="rounded-md border py-12 text-center text-sm text-muted-foreground">
          Unable to load customers. Refresh to retry.
        </p>
      )}
    </div>
  );
}
