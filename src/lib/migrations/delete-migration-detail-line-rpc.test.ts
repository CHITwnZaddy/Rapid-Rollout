import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260619180000_delete_migration_detail_line_rpc.sql"
);

describe("delete_migration_detail_line migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("defines the delete RPC as a security-invoker function for authenticated callers", () => {
    expect(sql).toContain(
      "create or replace function public.delete_migration_detail_line("
    );
    expect(sql).toContain("security invoker");
    expect(sql).not.toContain("security definer");
    expect(sql).toContain(
      "revoke execute on function public.delete_migration_detail_line(uuid, uuid) from public"
    );
    expect(sql).toContain(
      "revoke execute on function public.delete_migration_detail_line(uuid, uuid) from anon"
    );
    expect(sql).toContain(
      "grant execute on function public.delete_migration_detail_line(uuid, uuid) to authenticated"
    );
  });

  it("deletes the row before resequencing, scoped to the deleted row's section", () => {
    const deleteIndex = sql.indexOf("delete from public.migration_detail_lines");
    const updateIndex = sql.indexOf("update public.migration_detail_lines");

    expect(deleteIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(deleteIndex);
    expect(sql).toContain(
      "Migration detail row % was not found for proposal %"
    );
    expect(sql).toContain(
      "row_number() over (order by row_order, id) - 1 as next_row_order"
    );
    // Resequencing must be confined to the deleted row's section.
    expect(sql).toContain("and section = v_section");
  });
});
