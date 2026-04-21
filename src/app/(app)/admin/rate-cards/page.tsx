// Phase 2.7 — rate cards change rarely; 5 minute revalidation
// matches the recommended stale time for lookup tables.
export const revalidate = 300;

import { createClient } from "@/lib/supabase/server";
import {
  AdminDataTable,
  type AdminRow,
  type ColumnDef,
} from "@/components/admin/data-table";

const columns: ColumnDef[] = [
  { key: "rate_card_name", label: "Rate Card", type: "text" },
  { key: "activity", label: "Activity / Role", type: "text" },
  { key: "rate", label: "Rate ($/hr)", type: "number", width: "120px" },
  { key: "role_category", label: "Category", type: "text" },
  { key: "status", label: "Status", type: "text", width: "100px" },
  { key: "lookup_key", label: "Lookup Key", type: "text" },
];

export default async function RateCardsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rate_cards")
    .select("*")
    .order("rate_card_name");

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Rate Cards</h1>
      <AdminDataTable
        tableName="rate_cards"
        columns={columns}
        initialData={(data as AdminRow[]) ?? []}
        createDefaults={{
          rate_card_name: "Master",
          activity: "New Role",
          rate: 0,
          role_category: "Professional Services",
          status: "Active",
          lookup_key: "Master|NewRole__AUTO__",
        }}
      />
    </div>
  );
}
