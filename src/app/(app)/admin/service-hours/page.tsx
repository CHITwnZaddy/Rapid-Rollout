// Service hours change rarely, so lookup-table caching is safe here.
export const revalidate = 300;

import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/auth/page-guards";
import {
  AdminDataTable,
  type AdminRow,
} from "@/components/admin/data-table";
import { getAdminTableConfig } from "@/components/admin/data-table-config";

export default async function ServiceHoursPage() {
  await requireAdminPage();

  const supabase = await createClient();
  const { data } = await supabase
    .from("service_hours")
    .select("*")
    .order("service_name");
  const config = getAdminTableConfig("service_hours");

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Service Hours</h1>
      <AdminDataTable
        tableName="service_hours"
        columns={config.columns}
        initialData={(data as AdminRow[]) ?? []}
      />
    </div>
  );
}
