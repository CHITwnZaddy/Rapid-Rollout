import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Pin the LATEST migration that redefines create_proposal_bundle —
// it supersedes earlier versions of the function.
const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260610140000_remove_phase_4_add_option_3.sql"
);

describe("create_proposal_bundle migration", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("keeps all scenario tabs in the proposal bootstrap", () => {
    expect(sql).toContain("(v_proposal_id, 'P1', true)");
    expect(sql).toContain("(v_proposal_id, 'P2', false)");
    expect(sql).toContain("(v_proposal_id, 'P3', false)");
    expect(sql).toContain("(v_proposal_id, 'Opt1', false)");
    expect(sql).toContain("(v_proposal_id, 'Opt2', false)");
    expect(sql).toContain("(v_proposal_id, 'Opt3', false)");
    expect(sql).not.toContain("(v_proposal_id, 'P4', false)");
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

  it("guards the P4 delete and backfills Opt3 for existing proposals", () => {
    expect(sql).toContain("RAISE EXCEPTION");
    expect(sql).toContain("WITH missing_scenarios AS");
    expect(sql).toContain("SELECT proposal_id, 'Opt3', false");
    expect(sql).toContain(
      "CHECK (scenario_type IN ('P1', 'P2', 'P3', 'Opt1', 'Opt2', 'Opt3'))"
    );
  });
});
