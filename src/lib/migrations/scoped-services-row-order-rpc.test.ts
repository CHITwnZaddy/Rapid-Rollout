import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260618194500_scoped_services_row_order_rpc.sql"
);

describe("delete_scoped_service_line migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("defines the delete RPC as a security-invoker function for authenticated callers", () => {
    expect(sql).toContain(
      "create or replace function public.delete_scoped_service_line("
    );
    expect(sql).toContain("security invoker");
    expect(sql).not.toContain("security definer");
    expect(sql).toContain(
      "revoke execute on function public.delete_scoped_service_line(uuid, uuid) from public"
    );
    expect(sql).toContain(
      "revoke execute on function public.delete_scoped_service_line(uuid, uuid) from anon"
    );
    expect(sql).toContain(
      "grant execute on function public.delete_scoped_service_line(uuid, uuid) to authenticated"
    );
  });

  it("deletes the scoped service line before resequencing remaining proposal rows", () => {
    const deleteIndex = sql.indexOf("delete from public.scoped_services");
    const updateIndex = sql.indexOf("update public.scoped_services");

    expect(deleteIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(deleteIndex);
    expect(sql).toContain("if not found then");
    expect(sql).toContain(
      "Scoped service line % was not found for proposal %"
    );
    expect(sql).toContain(
      "row_number() over (order by row_order, id) - 1 as next_row_order"
    );
  });
});
