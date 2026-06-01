import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260601042929_restore_migration_detail_bootstrap.sql"
);

describe("create_proposal_bundle migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("keeps all scenario tabs in the proposal bootstrap", () => {
    expect(sql).toContain("(v_proposal_id, 'P1', true)");
    expect(sql).toContain("(v_proposal_id, 'P2', false)");
    expect(sql).toContain("(v_proposal_id, 'P3', false)");
    expect(sql).toContain("(v_proposal_id, 'P4', false)");
    expect(sql).toContain("(v_proposal_id, 'Opt1', false)");
    expect(sql).toContain("(v_proposal_id, 'Opt2', false)");
  });

  it("restores default migration detail rows during proposal creation", () => {
    expect(sql).toContain("INSERT INTO migration_detail_lines");
    expect(sql).toContain(
      "(v_proposal_id, 'project', 'Project Info/Detail', 0, 0, 0, 0)"
    );
    expect(sql).toContain("(v_proposal_id, 'project', 'Schedules', 0, 0, 0, 1)");
    expect(sql).toContain(
      "(v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 10)"
    );
    expect(sql).toContain("(v_proposal_id, 'cost', 'Budgets', 1, 0, 0, 0)");
    expect(sql).toContain("(v_proposal_id, 'cost', 'TBD', 0, 0, 0, 8)");
  });

  it("backfills proposals that have no migration detail rows", () => {
    expect(sql).toContain("WITH target_proposals AS");
    expect(sql).toContain("FROM public.proposals p");
    expect(sql).toContain("FROM public.migration_detail_lines mdl");
    expect(sql).toContain("CROSS JOIN default_lines");
  });
});
