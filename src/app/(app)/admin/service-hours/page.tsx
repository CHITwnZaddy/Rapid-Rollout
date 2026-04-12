export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { AdminDataTable, type ColumnDef } from "@/components/admin/data-table";

const columns: ColumnDef[] = [
  { key: "service_name", label: "Service Name", type: "text" },
  { key: "scope_value", label: "Scope Value", type: "text" },
  { key: "scope_label", label: "Scope Label", type: "text" },
  { key: "sr_im_hours", label: "Sr. IM Hrs", type: "number", width: "100px" },
  { key: "pm_hours", label: "PM Hrs", type: "number", width: "100px" },
  { key: "ba_hours", label: "BA Hrs", type: "number", width: "100px" },
  { key: "service_group", label: "Group", type: "text" },
  { key: "status", label: "Status", type: "text", width: "100px" },
  { key: "lookup_key", label: "Lookup Key", type: "text" },
];

export default async function ServiceHoursPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("service_hours")
    .select("*")
    .order("service_name");

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Service Hours</h1>
      <AdminDataTable
        tableName="service_hours"
        columns={columns}
        initialData={(data as Record<string, unknown>[]) ?? []}
        createDefaults={{
          service_name: "New Service",
          scope_value: "Included",
          scope_label: "Included",
          sr_im_hours: 0,
          pm_hours: 0,
          ba_hours: 0,
          service_group: "Core",
          status: "Active",
          lookup_key: `NewService|Included_${Date.now()}`,
        }}
      />
    </div>
  );
}
