// Phase 2.7 — rate cards change rarely; 5 minute revalidation
// matches the recommended stale time for lookup tables.
export const revalidate = 300;

import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/auth/page-guards";
import {
  AdminDataTable,
  type AdminRow,
} from "@/components/admin/data-table";
import { getAdminTableConfig } from "@/components/admin/data-table-config";

export default async function RateCardsPage() {
  await requireAdminPage();

  const supabase = await createClient();
  const { data } = await supabase
    .from("rate_cards")
    .select("*")
    .order("rate_card_name");
  const config = getAdminTableConfig("rate_cards");

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Rate Cards</h1>
      <AdminDataTable
        tableName="rate_cards"
        columns={config.columns}
        initialData={(data as AdminRow[]) ?? []}
      />
    </div>
  );
}
