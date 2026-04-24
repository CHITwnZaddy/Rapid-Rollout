// Phase 2.7 — service hours change rarely; 5 minute revalidation
// matches the recommended stale time for lookup tables.
export const revalidate = 300;

import { createClient } from "@/lib/supabase/server";
import {
  AdminDataTable,
  type AdminRow,
} from "@/components/admin/data-table";
import { getAdminTableConfig } from "@/components/admin/data-table-config";

export default async function ServiceHoursPage() {
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
