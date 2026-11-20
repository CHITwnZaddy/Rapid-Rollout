import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { MigrationLineState } from "@/lib/migration/compute-totals-from-state";
import {
  assertMigrationWriteSaved,
  MigrationSaveRefusedError,
} from "./migration-persistence";

// The browser writes behind the migration autosave. They live here, not in
// the hook, so tests can run them against a fake client.
//
// Each write asks for { count: "exact" }. A write that matches no row (the row
// or its proposal was deleted, or the session ended) returns no error and zero
// rows, so the count is the only way to tell an unsaved write from a real one.

type MigrationClient = SupabaseClient<Database>;

export type MigrationConfigFields =
  Database["public"]["Tables"]["migration_config"]["Update"];

export type MigrationLineFields = Pick<
  MigrationLineState,
  "id" | "label" | "quantity" | "items_per_object" | "total_line_items"
>;

export async function writeMigrationConfig(
  supabase: MigrationClient,
  configId: string,
  fields: MigrationConfigFields
): Promise<void> {
  const { error, count } = await supabase
    .from("migration_config")
    .update(fields, { count: "exact" })
    .eq("id", configId);

  assertMigrationWriteSaved(
    { error, count },
    "Couldn't save migration configuration."
  );
}

export async function writeMigrationLine(
  supabase: MigrationClient,
  line: MigrationLineFields
): Promise<void> {
  const { error, count } = await supabase
    .from("migration_detail_lines")
    .update(
      {
        label: line.label,
        quantity: line.quantity,
        items_per_object: line.items_per_object,
        total_line_items: line.total_line_items,
      },
      { count: "exact" }
    )
    .eq("id", line.id);

  if (!error && count === 0) {
    // Zero rows usually means the row was removed after it was edited (Clear
    // Tab, or a row delete in another tab). Every signed-in user can read the
    // lines, so look the row up: gone means there is nothing left to save;
    // still there means the write didn't take effect.
    const { data, error: lookupError } = await supabase
      .from("migration_detail_lines")
      .select("id")
      .eq("id", line.id)
      .maybeSingle();

    if (lookupError) {
      throw new Error(
        `Couldn't save migration detail row. ${lookupError.message}`
      );
    }
    if (!data) {
      return;
    }
    throw new MigrationSaveRefusedError();
  }

  assertMigrationWriteSaved(
    { error, count },
    "Couldn't save migration detail row."
  );
}

export async function writeMigrationComputedTotal(
  supabase: MigrationClient,
  configId: string,
  computedTotalCost: number
): Promise<void> {
  const { error, count } = await supabase
    .from("migration_config")
    .update(
      {
        computed_total_cost: computedTotalCost,
        updated_at: new Date().toISOString(),
      },
      { count: "exact" }
    )
    .eq("id", configId);

  assertMigrationWriteSaved(
    { error, count },
    "Couldn't recompute migration totals."
  );
}
