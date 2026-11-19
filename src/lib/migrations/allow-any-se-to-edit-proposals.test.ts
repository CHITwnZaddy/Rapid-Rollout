import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase/migrations");
const MIGRATION_FILE = "20261119220158_allow_any_se_to_edit_proposals.sql";
// The definition of save_scenario_grid this migration replaces.
const PREVIOUS_SAVE_SCENARIO_GRID_FILE = "20260424170010_020_save_scenario_grid.sql";

// PostgreSQL stores identifiers truncated to NAMEDATALEN - 1 = 63 bytes, so a
// policy created with a longer name lives under its first 63 characters and
// must be dropped by that stored name.
const MAX_IDENTIFIER_LENGTH = 63;
const storedName = (name: string) => name.slice(0, MAX_IDENTIFIER_LENGTH);

const LOCKED_TABLES = [
  "proposals",
  "proposal_status_history",
  "scenarios",
  "scenario_lines",
  "bid_sheets",
  "scoped_services",
  "migration_config",
  "migration_detail_lines",
];
const CHILD_TABLES = LOCKED_TABLES.slice(2);
// Rows only create_proposal_bundle creates and only the proposal-delete
// cascade removes: INSERT and DELETE on these stay owner-or-admin.
const STRUCTURAL_TABLES = [
  "scenarios",
  "scenario_lines",
  "bid_sheets",
  "migration_config",
];

type TableAndName = [table: string, name: string];
type NewPolicy = [table: string, command: string, name: string];

const NEW_POLICIES: NewPolicy[] = [
  ["scenarios", "UPDATE", "Authenticated users can update scenarios"],
  ["scenario_lines", "UPDATE", "Authenticated users can update scenario_lines"],
  ["bid_sheets", "UPDATE", "Authenticated users can update bid_sheets"],
  ["scoped_services", "INSERT", "Authenticated users can insert scoped_services"],
  ["scoped_services", "UPDATE", "Authenticated users can update scoped_services"],
  ["scoped_services", "DELETE", "Authenticated users can delete scoped_services"],
  ["migration_config", "UPDATE", "Authenticated users can update migration_config"],
  [
    "migration_detail_lines",
    "INSERT",
    "Authenticated users can insert migration_detail_lines",
  ],
  [
    "migration_detail_lines",
    "UPDATE",
    "Authenticated users can update migration_detail_lines",
  ],
  [
    "migration_detail_lines",
    "DELETE",
    "Authenticated users can delete migration_detail_lines",
  ],
  ["proposals", "UPDATE", "Authenticated users can update proposals"],
  [
    "proposal_status_history",
    "INSERT",
    "Authenticated users can insert own proposal_status_history",
  ],
];

// The owner-only write policies this migration replaces, spelled exactly as
// they are stored in pg_policies.
const REPLACED_POLICIES: TableAndName[] = [
  ["scenarios", "Users can update scenarios via owned proposal or admin"],
  ["scenario_lines", "Users can update scenario_lines via owned proposal or admin"],
  ["bid_sheets", "Users can update bid_sheets via owned proposal or admin"],
  ["scoped_services", "Users can insert scoped_services via owned proposal or admin"],
  ["scoped_services", "Users can update scoped_services via owned proposal or admin"],
  ["scoped_services", "Users can delete scoped_services via owned proposal or admin"],
  ["migration_config", "Users can update migration_config via owned proposal or admin"],
  [
    "migration_detail_lines",
    "Users can insert migration_detail_lines via owned proposal or a",
  ],
  [
    "migration_detail_lines",
    "Users can update migration_detail_lines via owned proposal or a",
  ],
  [
    "migration_detail_lines",
    "Users can delete migration_detail_lines via owned proposal or a",
  ],
  ["proposals", "Users can update own proposals or manager"],
  [
    "proposal_status_history",
    "Users can insert proposal_status_history via owned proposal or ",
  ],
];

// Policies that must survive untouched (the self-check requires them).
const KEPT_POLICIES: TableAndName[] = [
  ...STRUCTURAL_TABLES.flatMap((table): TableAndName[] => [
    [table, `Users can insert ${table} via owned proposal or admin`],
    [table, `Users can delete ${table} via owned proposal or admin`],
  ]),
  ["proposals", "Users can delete own proposals or admin"],
  ["proposals", "Users can insert own proposals"],
];

type PolicyStatement = {
  verb: "CREATE" | "DROP";
  name: string;
  table: string;
  command: string;
  roles: string | null;
  using: string | null;
  withCheck: string | null;
  index: number;
};

type LivePolicy = { table: string; name: string; command: string };

/** Removes `--` comments (no string literal in the migrations contains `--`). */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

/** Collapses runs of whitespace so multi-line SQL compares as one line. */
function squash(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const key = (table: string, name: string) => `${table}.${name}`;

function parsePolicyStatements(sql: string): PolicyStatement[] {
  const statement =
    /\b(CREATE|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?"([^"]+)"\s+ON\s+(?:public\.)?(\w+)([^;]*);/gi;

  return [...sql.matchAll(statement)].map((match) => {
    const rest = match[4] ?? "";
    const head = rest.match(
      /^\s*(?:AS\s+\w+\s+)?(?:FOR\s+(\w+)\s*)?(?:TO\s+([\w\s,]+?)\s*)?(?=\bUSING\b|\bWITH\s+CHECK\b|$)/i
    );
    const usingAt = rest.search(/\bUSING\b/i);
    const withCheckAt = rest.search(/\bWITH\s+CHECK\b/i);
    const hasUsing = usingAt >= 0 && (withCheckAt < 0 || usingAt < withCheckAt);

    return {
      verb: match[1].toUpperCase() as "CREATE" | "DROP",
      name: match[2],
      table: match[3],
      command: (head?.[1] ?? "ALL").toUpperCase(),
      roles: head?.[2] ? squash(head[2]) : null,
      using: hasUsing
        ? squash(rest.slice(usingAt + "USING".length, withCheckAt >= 0 ? withCheckAt : undefined))
        : null,
      withCheck:
        withCheckAt >= 0
          ? squash(rest.slice(withCheckAt).replace(/^WITH\s+CHECK/i, ""))
          : null,
      index: match.index ?? -1,
    };
  });
}

function readMigration(file: string): string {
  return readFileSync(join(migrationsDir, file), "utf8");
}

/**
 * Replays every CREATE/DROP POLICY in the given migrations, in order, and
 * returns the policies that end up in place (keyed by table and stored name).
 */
function replayPolicies(files: string[]): Map<string, LivePolicy> {
  const live = new Map<string, LivePolicy>();
  for (const file of files) {
    for (const policy of parsePolicyStatements(stripComments(readMigration(file)))) {
      const name = storedName(policy.name);
      if (policy.verb === "DROP") {
        live.delete(key(policy.table, name));
      } else {
        live.set(key(policy.table, name), {
          table: policy.table,
          name,
          command: policy.command,
        });
      }
    }
  }
  return live;
}

function countByTable(live: Map<string, LivePolicy>): Record<string, number> {
  return Object.fromEntries(
    LOCKED_TABLES.map((table) => [
      table,
      [...live.values()].filter((policy) => policy.table === table).length,
    ])
  );
}

/** The self-check's "owner-only write policy still present" predicate. */
function isStaleOwnerOnlyWritePolicy(policy: LivePolicy): boolean {
  const ownerOnly = policy.name.includes("via owned proposal");
  return (
    (ownerOnly && policy.command === "UPDATE") ||
    (ownerOnly &&
      ["scoped_services", "migration_detail_lines", "proposal_status_history"].includes(
        policy.table
      )) ||
    policy.name === "Users can update own proposals or manager"
  );
}

const sortPairs = (pairs: string[][]) =>
  [...pairs].map((pair) => pair.join(" | ")).sort();

/** Returns the statement that starts at `start` and ends at the next `$$;`. */
function dollarQuotedStatement(sql: string, start: string): string {
  const begin = sql.indexOf(start);
  expect(begin, `${start} not found`).toBeGreaterThan(-1);
  const end = sql.indexOf("$$;", begin);
  expect(end).toBeGreaterThan(begin);
  return sql.slice(begin, end + "$$;".length);
}

function splitFunction(definition: string): { header: string; body: string } {
  const bodyStart = definition.indexOf("AS $$");
  expect(bodyStart).toBeGreaterThan(-1);
  return {
    header: squash(definition.slice(0, bodyStart)),
    body: squash(definition.slice(bodyStart + "AS $$".length, -"$$;".length)),
  };
}

describe("allow_any_se_to_edit_proposals migration", () => {
  const rawSql = readMigration(MIGRATION_FILE);
  const sql = stripComments(rawSql);
  const statements = parsePolicyStatements(sql);
  const drops = statements.filter((statement) => statement.verb === "DROP");
  const creates = statements.filter((statement) => statement.verb === "CREATE");
  const dropKeys = drops.map((drop) => key(drop.table, drop.name));

  const earlierFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql") && file < MIGRATION_FILE)
    .sort();
  const earlierSql = earlierFiles
    .map((file) => stripComments(readMigration(file)))
    .join("\n");
  const liveBefore = replayPolicies(earlierFiles);
  const liveAfter = replayPolicies([...earlierFiles, MIGRATION_FILE]);

  const createFor = (table: string, name: string) => {
    const policy = creates.find(
      (create) => create.table === table && create.name === name
    );
    expect(policy, `CREATE POLICY "${name}" ON ${table}`).toBeDefined();
    return policy!;
  };

  describe("transaction and locking", () => {
    it("runs in one transaction that starts with BEGIN; and ends with COMMIT;", () => {
      expect(sql.trimStart().startsWith("BEGIN;")).toBe(true);
      expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
      expect(sql.match(/^BEGIN;$/gm)).toHaveLength(1);
      expect(sql.match(/^COMMIT;$/gm)).toHaveLength(1);
      expect(sql).not.toMatch(/\b(ROLLBACK|START TRANSACTION|SAVEPOINT)\b/i);
    });

    it("sets a transaction-local lock_timeout before taking any lock", () => {
      const lockTimeoutAt = sql.search(/^SET LOCAL lock_timeout = '\d+s';$/m);
      expect(lockTimeoutAt).toBeGreaterThan(sql.indexOf("BEGIN;"));
      expect(lockTimeoutAt).toBeLessThan(sql.indexOf("LOCK TABLE"));
    });

    it("locks the eight tables up front, proposals first", () => {
      const lock = sql.match(/LOCK TABLE\s+([\s\S]*?)\s+IN ACCESS EXCLUSIVE MODE;/);
      expect(lock).not.toBeNull();
      const tables = lock![1].split(",").map((table) => table.trim());

      expect(tables[0]).toBe("public.proposals");
      expect([...tables].sort()).toEqual(
        LOCKED_TABLES.map((table) => `public.${table}`).sort()
      );
      expect(sql.match(/\bLOCK TABLE\b/g)).toHaveLength(1);
      expect(sql.indexOf("LOCK TABLE")).toBeLessThan(drops[0].index);
    });
  });

  describe("policies that stay restricted", () => {
    it("never drops, alters or recreates the proposals INSERT and DELETE policies", () => {
      for (const name of [
        "Users can delete own proposals or admin",
        "Users can insert own proposals",
      ]) {
        expect(dropKeys).not.toContain(key("proposals", name));
        expect(creates.map((create) => create.name)).not.toContain(name);
        expect(liveAfter.has(key("proposals", name))).toBe(true);
      }
      expect(sql).not.toMatch(/\bALTER\s+POLICY\b/i);
      expect(
        creates
          .filter((create) => create.table === "proposals")
          .map((create) => create.command)
      ).toEqual(["UPDATE"]);
      expect(
        drops.filter((drop) => drop.table === "proposals").map((drop) => drop.name)
      ).toEqual([
        "Users can update own proposals or manager",
        "Authenticated users can update proposals",
      ]);
    });

    it("keeps INSERT and DELETE owner-or-admin on scenarios, scenario_lines, bid_sheets and migration_config", () => {
      for (const table of STRUCTURAL_TABLES) {
        for (const verb of ["insert", "delete"]) {
          const name = `Users can ${verb} ${table} via owned proposal or admin`;
          expect(dropKeys).not.toContain(key(table, name));
          expect(liveBefore.has(key(table, name))).toBe(true);
          expect(liveAfter.has(key(table, name))).toBe(true);
        }

        expect(
          drops.filter((drop) => drop.table === table).map((drop) => drop.name)
        ).toEqual([
          `Users can update ${table} via owned proposal or admin`,
          `Authenticated users can update ${table}`,
        ]);
        expect(
          creates.filter((create) => create.table === table).map((create) => create.command)
        ).toEqual(["UPDATE"]);
      }
    });

    it("adds no UPDATE or DELETE policy on proposal_status_history (append-only)", () => {
      expect(
        creates
          .filter((create) => create.table === "proposal_status_history")
          .map((create) => create.command)
      ).toEqual(["INSERT"]);
      expect(
        [...liveAfter.values()]
          .filter((policy) => policy.table === "proposal_status_history")
          .map((policy) => policy.command)
          .sort()
      ).toEqual(["INSERT", "SELECT"]);
    });
  });

  describe("new policies", () => {
    it("creates exactly the expected policies, each for the authenticated role", () => {
      expect(
        sortPairs(creates.map((create) => [create.table, create.command, create.name]))
      ).toEqual(sortPairs(NEW_POLICIES));

      for (const create of creates) {
        expect(create.roles, create.name).toBe("authenticated");
        expect(create.name.length, create.name).toBeLessThanOrEqual(
          MAX_IDENTIFIER_LENGTH
        );
      }
    });

    it("only lets child-table rows be written while their proposal exists", () => {
      for (const create of creates.filter((policy) => CHILD_TABLES.includes(policy.table))) {
        const clauses = [create.using, create.withCheck].filter(
          (clause): clause is string => clause !== null
        );

        if (create.command === "INSERT") {
          expect(create.using, create.name).toBeNull();
          expect(create.withCheck, create.name).not.toBeNull();
        } else if (create.command === "DELETE") {
          expect(create.using, create.name).not.toBeNull();
          expect(create.withCheck, create.name).toBeNull();
        } else {
          expect(create.command, create.name).toBe("UPDATE");
          expect(create.using, create.name).not.toBeNull();
          expect(create.withCheck, create.name).toBe(create.using);
        }

        for (const clause of clauses) {
          expect(clause, create.name).toMatch(/^\( EXISTS \(/);
          expect(clause, create.name).toContain("public.proposals");
          expect(clause, create.name).not.toMatch(/created_by|auth_is_admin|app_metadata/);
          if (create.table === "scenario_lines") {
            expect(clause).toContain(
              "JOIN public.proposals ON proposals.id = scenarios.proposal_id"
            );
            expect(clause).toContain("WHERE scenarios.id = scenario_lines.scenario_id");
          } else {
            expect(clause, create.name).toMatch(
              new RegExp(`\\.id = ${create.table}\\.proposal_id\\b`)
            );
          }
        }
      }
    });

    it("opens proposals UPDATE to any signed-in user", () => {
      const policy = createFor("proposals", "Authenticated users can update proposals");
      expect(policy.command).toBe("UPDATE");
      expect(policy.using).toBe("((SELECT auth.uid()) IS NOT NULL)");
      expect(policy.withCheck).toBe("((SELECT auth.uid()) IS NOT NULL)");
    });

    it("lets status history be inserted only as the caller, stamped now, for an existing proposal", () => {
      const policy = createFor(
        "proposal_status_history",
        "Authenticated users can insert own proposal_status_history"
      );
      expect(policy.command).toBe("INSERT");
      expect(policy.using).toBeNull();
      expect(policy.withCheck).toBe(
        "( changed_by = (SELECT auth.uid()) AND changed_at = now() AND EXISTS ( SELECT 1 FROM public.proposals WHERE proposals.id = proposal_status_history.proposal_id ) )"
      );
    });
  });

  describe("dropped policy names", () => {
    it("drops every replaced policy by its exact live name", () => {
      for (const [table, name] of REPLACED_POLICIES) {
        expect(dropKeys, name).toContain(key(table, name));
        expect(liveBefore.has(key(table, name)), `${table}.${name} is live`).toBe(true);
        expect(liveAfter.has(key(table, name)), `${table}.${name} is gone`).toBe(false);
      }
    });

    it("uses the 63-character stored names for the truncated policies", () => {
      for (const verb of ["insert", "update", "delete"]) {
        const stored = `Users can ${verb} migration_detail_lines via owned proposal or a`;
        expect(stored).toHaveLength(MAX_IDENTIFIER_LENGTH);
        expect(
          storedName(`Users can ${verb} migration_detail_lines via owned proposal or admin`)
        ).toBe(stored);
        expect(rawSql).toContain(
          `DROP POLICY IF EXISTS "${stored}" ON public.migration_detail_lines;`
        );
      }

      // Created as "... or manager"; stored with a trailing space.
      const statusHistory = "Users can insert proposal_status_history via owned proposal or ";
      expect(statusHistory).toHaveLength(MAX_IDENTIFIER_LENGTH);
      expect(statusHistory.endsWith("proposal or ")).toBe(true);
      expect(
        storedName("Users can insert proposal_status_history via owned proposal or manager")
      ).toBe(statusHistory);
      expect(rawSql).toContain(
        `DROP POLICY IF EXISTS "${statusHistory}" ON public.proposal_status_history;`
      );

      for (const drop of drops) {
        expect(drop.name.length, drop.name).toBeLessThanOrEqual(MAX_IDENTIFIER_LENGTH);
      }
    });

    it("drops only the replaced policies and the new names (so the file can be re-run)", () => {
      expect([...dropKeys].sort()).toEqual(
        [
          ...REPLACED_POLICIES.map(([table, name]) => key(table, name)),
          ...NEW_POLICIES.map(([table, , name]) => key(table, name)),
        ].sort()
      );
      expect(drops.every((drop) => /^DROP POLICY IF EXISTS /.test(sql.slice(drop.index)))).toBe(
        true
      );

      for (const create of creates) {
        const drop = drops.find(
          (candidate) => candidate.table === create.table && candidate.name === create.name
        );
        expect(drop, create.name).toBeDefined();
        expect(drop!.index).toBeLessThan(create.index);
      }
    });
  });

  describe("ownership and correction-stamp guard", () => {
    const guard = splitFunction(
      dollarQuotedStatement(sql, "CREATE OR REPLACE FUNCTION public.guard_proposal_ownership()")
    );

    it("is a SECURITY INVOKER trigger function with an empty search_path", () => {
      expect(guard.header).toBe(
        "CREATE OR REPLACE FUNCTION public.guard_proposal_ownership() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''"
      );
      expect(sql).not.toMatch(/SECURITY DEFINER/i);
      // With an empty search_path every function call must be schema-qualified.
      expect(guard.body).not.toMatch(/(?<!public\.)\b(auth_is_admin|is_manager_or_admin)\(/);
    });

    it("lets only the API roles through to the checks", () => {
      expect(guard.body).toContain(
        "IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;"
      );
    });

    it("refuses any change to a proposal's id", () => {
      expect(guard.body).toContain(
        "IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'A proposal''s id can''t be changed.' USING ERRCODE = '42501'; END IF;"
      );
    });

    it("raises 42501 unless an admin changes created_by", () => {
      expect(guard.body).toContain(
        "IF NEW.created_by IS DISTINCT FROM OLD.created_by AND NOT (SELECT public.auth_is_admin()) THEN RAISE EXCEPTION 'Only an admin can change who owns a proposal.' USING ERRCODE = '42501'; END IF;"
      );
    });

    it("raises 42501 unless a manager or admin changes the closed-won correction stamp", () => {
      expect(guard.body).toContain(
        "IF (NEW.closed_financials_corrected_at IS DISTINCT FROM OLD.closed_financials_corrected_at OR NEW.closed_financials_corrected_by IS DISTINCT FROM OLD.closed_financials_corrected_by) AND NOT (SELECT public.is_manager_or_admin()) THEN RAISE EXCEPTION 'Only a manager or an admin can correct closed-won financials.' USING ERRCODE = '42501'; END IF;"
      );
      expect(guard.body.match(/RAISE EXCEPTION/g)).toHaveLength(4);
      expect(guard.body.match(/USING ERRCODE = '42501';/g)).toHaveLength(4);
      expect(guard.body.endsWith("RETURN NEW; END;")).toBe(true);
    });

    it("also refuses a correction stamp pre-filled on INSERT unless a manager or admin creates the proposal", () => {
      expect(guard.body).toContain(
        "IF TG_OP = 'INSERT' THEN IF (NEW.closed_financials_corrected_at IS NOT NULL OR NEW.closed_financials_corrected_by IS NOT NULL) AND NOT (SELECT public.is_manager_or_admin()) THEN RAISE EXCEPTION 'Only a manager or an admin can correct closed-won financials.' USING ERRCODE = '42501'; END IF; RETURN NEW; END IF;"
      );
      // The INSERT branch returns before any reference to OLD.
      expect(guard.body.indexOf("TG_OP = 'INSERT'")).toBeLessThan(guard.body.indexOf("OLD."));
      expect(squash(sql)).toContain(
        "CREATE OR REPLACE TRIGGER trg_guard_proposal_ownership_insert BEFORE INSERT ON public.proposals FOR EACH ROW WHEN ( NEW.closed_financials_corrected_at IS NOT NULL OR NEW.closed_financials_corrected_by IS NOT NULL ) EXECUTE FUNCTION public.guard_proposal_ownership();"
      );
    });

    it("calls helpers the authenticated role can execute", () => {
      expect(earlierSql).toContain("FUNCTION public.auth_is_admin()");
      expect(earlierSql).toContain("FUNCTION public.is_manager_or_admin()");
      expect(earlierSql).toContain(
        "GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO authenticated;"
      );
      expect(earlierSql).toContain(
        "GRANT EXECUTE ON FUNCTION public.is_manager_or_admin() TO authenticated;"
      );
    });

    it("is revoked from PUBLIC, anon and authenticated and never granted", () => {
      expect(sql).toContain(
        "REVOKE ALL ON FUNCTION public.guard_proposal_ownership() FROM PUBLIC, anon, authenticated;"
      );
      expect(sql).not.toMatch(/GRANT[^;]*guard_proposal_ownership/i);
    });

    it("fires BEFORE UPDATE OF the guarded columns with a matching WHEN clause", () => {
      const trigger = squash(sql).match(
        /CREATE OR REPLACE TRIGGER trg_guard_proposal_ownership BEFORE UPDATE OF ([\w, ]+) ON public\.proposals FOR EACH ROW WHEN \( (.+?) \) EXECUTE FUNCTION public\.guard_proposal_ownership\(\);/
      );
      expect(trigger).not.toBeNull();

      const columns = trigger![1].split(",").map((column) => column.trim());
      expect(columns).toEqual([
        "id",
        "created_by",
        "closed_financials_corrected_at",
        "closed_financials_corrected_by",
      ]);

      const conditions = trigger![2].split(" OR ");
      expect(conditions).toEqual(
        columns.map((column) => `OLD.${column} IS DISTINCT FROM NEW.${column}`)
      );

      for (const column of columns.slice(2)) {
        expect(earlierSql).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
      }
    });
  });

  describe("parent-key guard on the child tables", () => {
    // RLS can't compare old and new rows, so without this guard an UPDATE that
    // only checks "the parent exists" would let a user move a structural row
    // onto a proposal they own and delete it there.
    const guard = splitFunction(
      dollarQuotedStatement(sql, "CREATE OR REPLACE FUNCTION public.guard_proposal_child_parent()")
    );
    const PARENT_KEYS: Array<[string, string]> = [
      ["scenarios", "proposal_id"],
      ["scenario_lines", "scenario_id"],
      ["bid_sheets", "proposal_id"],
      ["scoped_services", "proposal_id"],
      ["migration_config", "proposal_id"],
      ["migration_detail_lines", "proposal_id"],
    ];

    it("is a SECURITY INVOKER trigger function with an empty search_path that raises 42501 for the API roles", () => {
      expect(guard.header).toBe(
        "CREATE OR REPLACE FUNCTION public.guard_proposal_child_parent() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''"
      );
      expect(guard.body).toContain(
        "IF current_user IN ('anon', 'authenticated') THEN RAISE EXCEPTION 'A proposal''s rows can''t be moved to another proposal or re-keyed.' USING ERRCODE = '42501'; END IF; RETURN NEW;"
      );
    });

    it("is revoked from PUBLIC, anon and authenticated and never granted", () => {
      expect(sql).toContain(
        "REVOKE ALL ON FUNCTION public.guard_proposal_child_parent() FROM PUBLIC, anon, authenticated;"
      );
      expect(sql).not.toMatch(/GRANT[^;]*guard_proposal_child_parent/i);
    });

    it.each(PARENT_KEYS)("guards %s.id and %s with a BEFORE UPDATE OF trigger and a matching WHEN clause", (table, column) => {
      expect(squash(sql)).toContain(
        `CREATE OR REPLACE TRIGGER trg_guard_${table}_parent BEFORE UPDATE OF id, ${column} ON public.${table} FOR EACH ROW WHEN (OLD.id IS DISTINCT FROM NEW.id OR OLD.${column} IS DISTINCT FROM NEW.${column}) EXECUTE FUNCTION public.guard_proposal_child_parent();`
      );
    });
  });

  describe("save_scenario_grid", () => {
    const next = splitFunction(
      dollarQuotedStatement(sql, "CREATE OR REPLACE FUNCTION public.save_scenario_grid(")
    );
    const previous = splitFunction(
      dollarQuotedStatement(
        stripComments(readMigration(PREVIOUS_SAVE_SCENARIO_GRID_FILE)),
        "CREATE OR REPLACE FUNCTION save_scenario_grid("
      )
    );

    it("no longer checks who owns the proposal", () => {
      expect(next.body).not.toContain("created_by");
      expect(next.body).not.toContain("app_metadata");
      expect(next.body).not.toMatch(/\bproposals\b/);
      expect(next.body).toContain(
        "RAISE EXCEPTION 'Scenario not found. Reload the page and try again.';"
      );
    });

    it("keeps the signature, SECURITY INVOKER, search_path and the scenario row lock", () => {
      expect(next.header).toBe(
        "CREATE OR REPLACE FUNCTION public.save_scenario_grid( p_scenario_id UUID, p_lines JSONB, p_summary_total_hours NUMERIC, p_summary_total_cost NUMERIC ) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY INVOKER SET search_path = public"
      );
      expect(next.header.replace("public.save_scenario_grid", "save_scenario_grid")).toBe(
        previous.header
      );
      expect(next.body).toContain(
        "PERFORM 1 FROM scenarios WHERE scenarios.id = p_scenario_id FOR UPDATE OF scenarios; IF NOT FOUND THEN"
      );
      expect(next.body).toContain(
        "IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in to save scenario changes.'; END IF;"
      );
    });

    it("is otherwise the previous definition, unchanged", () => {
      const ownerJoin = "JOIN proposals ON proposals.id = scenarios.proposal_id";
      const ownerPredicate =
        "AND ( proposals.created_by = auth.uid() OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' )";
      const oldMessage = "'Scenario not found or you do not have permission to edit it.'";
      for (const fragment of [ownerJoin, ownerPredicate, oldMessage]) {
        expect(previous.body).toContain(fragment);
      }

      const expected = squash(
        previous.body
          .replace(ownerJoin, "")
          .replace(ownerPredicate, "")
          .replace(oldMessage, "'Scenario not found. Reload the page and try again.'")
      );
      expect(next.body).toBe(expected);
    });

    it("leaves the function's grants alone", () => {
      expect(sql).not.toMatch(/\b(GRANT|REVOKE)\b[^;]*save_scenario_grid/i);
      expect(sql).not.toMatch(/DROP\s+FUNCTION/i);
    });
  });

  describe("self-check", () => {
    const doAt = sql.indexOf("DO $$");
    const selfCheck = squash(sql.slice(doAt, sql.lastIndexOf("COMMIT;")));

    it("runs inside the transaction after every policy and function change", () => {
      expect(doAt).toBeGreaterThan(-1);
      expect(sql.indexOf("DO $$", doAt + 1)).toBe(-1);
      expect(doAt).toBeGreaterThan(statements[statements.length - 1].index);
      expect(doAt).toBeGreaterThan(sql.indexOf("FUNCTION public.save_scenario_grid("));
      expect(doAt).toBeGreaterThan(sql.indexOf("TRIGGER trg_guard_proposal_ownership"));
      expect(doAt).toBeLessThan(sql.lastIndexOf("COMMIT;"));
      expect(selfCheck.endsWith("END; $$;")).toBe(true);
    });

    it("fails if a guard trigger is missing", () => {
      for (const trigger of [
        "('proposals', 'trg_guard_proposal_ownership')",
        "('proposals', 'trg_guard_proposal_ownership_insert')",
        "('scenarios', 'trg_guard_scenarios_parent')",
        "('scenario_lines', 'trg_guard_scenario_lines_parent')",
        "('bid_sheets', 'trg_guard_bid_sheets_parent')",
        "('scoped_services', 'trg_guard_scoped_services_parent')",
        "('migration_config', 'trg_guard_migration_config_parent')",
        "('migration_detail_lines', 'trg_guard_migration_detail_lines_parent')",
      ]) {
        expect(selfCheck).toContain(trigger);
      }
      expect(selfCheck).toContain("RAISE EXCEPTION 'Guard triggers are missing: %', v_missing;");
    });

    it("fails if an owner-only write policy survived", () => {
      expect(selfCheck).toContain(
        "(policyname LIKE '%via owned proposal%' AND cmd = 'UPDATE') OR (policyname LIKE '%via owned proposal%' AND tablename IN ('scoped_services', 'migration_detail_lines', 'proposal_status_history')) OR policyname = 'Users can update own proposals or manager'"
      );
      expect(selfCheck).toContain(
        "RAISE EXCEPTION 'Owner-only proposal write policies are still present: %', v_stale;"
      );

      // The predicate matches exactly the replaced policies before the
      // migration and nothing after it.
      expect(
        sortPairs(
          [...liveBefore.values()]
            .filter(isStaleOwnerOnlyWritePolicy)
            .map((policy) => [policy.table, policy.name])
        )
      ).toEqual(sortPairs(REPLACED_POLICIES));
      expect([...liveAfter.values()].filter(isStaleOwnerOnlyWritePolicy)).toEqual([]);
    });

    it("fails if a kept owner-or-admin policy is missing", () => {
      const block = selfCheck.match(/FROM \(VALUES (.+?) \) AS e\(tbl, pol\)/);
      expect(block).not.toBeNull();
      const kept = [...block![1].matchAll(/\('(\w+)', '([^']+)'\)/g)].map((match) => [
        match[1],
        match[2],
      ]);

      expect(sortPairs(kept)).toEqual(sortPairs(KEPT_POLICIES));
      for (const [table, name] of kept) {
        expect(liveAfter.has(key(table, name)), `${table}.${name}`).toBe(true);
      }
      expect(selfCheck).toContain(
        "RAISE EXCEPTION 'Policies that must stay owner-or-admin are missing: %', v_missing;"
      );
    });

    it("expects the policy counts the migration history produces", () => {
      const block = selfCheck.match(/FROM \(VALUES (.+?) \) AS e\(tbl, expected\)/);
      expect(block).not.toBeNull();
      const expectedCounts = Object.fromEntries(
        [...block![1].matchAll(/\('(\w+)', (\d+)\)/g)].map((match) => [
          match[1],
          Number(match[2]),
        ])
      );

      expect(expectedCounts).toEqual(countByTable(liveAfter));
      expect(expectedCounts).toEqual({
        scenarios: 4,
        scenario_lines: 4,
        bid_sheets: 4,
        scoped_services: 4,
        migration_config: 4,
        migration_detail_lines: 4,
        proposals: 4,
        proposal_status_history: 2,
      });
      expect(selfCheck).toContain(
        "RAISE EXCEPTION 'Unexpected policy count after migration: %', v_wrong;"
      );
    });
  });
});
