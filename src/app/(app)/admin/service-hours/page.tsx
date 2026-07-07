// Service hours change rarely, so lookup-table caching is safe here.
export const revalidate = 300;

import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/auth/page-guards";
import { AdminDataTable } from "@/components/admin/data-table";
import {
  adminRowsSchema,
  getAdminTableConfig,
} from "@/components/admin/data-table-config";
import { safeParseSupabaseResult } from "@/lib/validation/parse-supabase";

export default async function ServiceHoursPage() {
  await requireAdminPage();

  const supabase = await createClient();
  const result = await supabase
    .from("service_hours")
    .select("*")
    .order("service_name");
  const parsed = safeParseSupabaseResult(adminRowsSchema, result);
  const config = getAdminTableConfig("service_hours");

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Service Hours</h1>
      {parsed.ok ? (
        <AdminDataTable
          tableName="service_hours"
          columns={config.columns}
          initialData={parsed.data}
        />
      ) : (
        <p className="rounded-md border py-12 text-center text-sm text-muted-foreground">
          Unable to load service hours. Refresh to retry.
        </p>
      )}
    </div>
  );
}
