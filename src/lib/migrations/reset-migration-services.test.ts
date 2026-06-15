import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260615232220_reset_migration_services_rpc.sql"
);

describe("reset_migration_services migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("defines the reset RPC as a security-invoker function for authenticated callers", () => {
    expect(sql).toContain(
      "create or replace function public.reset_migration_services(p_proposal_id uuid)"
    );
    expect(sql).toContain("security invoker");
    expect(sql).not.toContain("security definer");
    expect(sql).toContain(
      "revoke execute on function public.reset_migration_services(uuid) from public"
    );
    expect(sql).toContain(
      "revoke execute on function public.reset_migration_services(uuid) from anon"
    );
    expect(sql).toContain(
      "grant execute on function public.reset_migration_services(uuid) to authenticated"
    );
  });

  it("resets the migration config and fails when the config row is missing", () => {
    expect(sql).toContain("num_projects = 0");
    expect(sql).toContain("hrs_per_import = 0.75");
    expect(sql).toContain("lines_per_import_file = 2550");
    expect(sql).toContain("computed_total_cost = 0");
    expect(sql).toContain("if not found then");
    expect(sql).toContain("Missing migration_config row for proposal %");
  });

  it("replaces detail rows with the seeded migration defaults", () => {
    expect(sql).toContain("delete from public.migration_detail_lines");
    expect(sql).toContain("insert into public.migration_detail_lines");
    expect(sql).toContain(
      "(p_proposal_id, 'project', 'Project Info/Detail', 0, 0, 0, 0)"
    );
    expect(sql).toContain("(p_proposal_id, 'project', 'Schedules', 0, 0, 0, 1)");
    expect(sql).toContain(
      "(p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 10)"
    );
    expect(sql).toContain("(p_proposal_id, 'cost', 'Budgets', 1, 0, 0, 0)");
    expect(sql).toContain("(p_proposal_id, 'cost', 'TBD', 0, 0, 0, 8)");
  });
});
