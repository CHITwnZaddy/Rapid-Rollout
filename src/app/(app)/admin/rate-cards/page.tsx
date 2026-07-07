// Rate cards change rarely, so lookup-table caching is safe here.
export const revalidate = 300;

import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/auth/page-guards";
import { AdminDataTable } from "@/components/admin/data-table";
import {
  adminRowsSchema,
  getAdminTableConfig,
} from "@/components/admin/data-table-config";
import { safeParseSupabaseResult } from "@/lib/validation/parse-supabase";

export default async function RateCardsPage() {
  await requireAdminPage();

  const supabase = await createClient();
  const result = await supabase
    .from("rate_cards")
    .select("*")
    .order("rate_card_name");
  const parsed = safeParseSupabaseResult(adminRowsSchema, result);
  const config = getAdminTableConfig("rate_cards");

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Rate Cards</h1>
      {parsed.ok ? (
        <AdminDataTable
          tableName="rate_cards"
          columns={config.columns}
          initialData={parsed.data}
        />
      ) : (
        <p className="rounded-md border py-12 text-center text-sm text-muted-foreground">
          Unable to load rate cards. Refresh to retry.
        </p>
      )}
    </div>
  );
}
