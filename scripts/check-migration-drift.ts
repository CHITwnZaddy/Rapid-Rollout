/**
 * QA-01 — Migration drift check.
 *
 * Compares the set of migration filenames in `supabase/migrations/*.sql`
 * against `supabase_migrations.schema_migrations.name` on the target
 * database. Exits 1 on drift (and prints repo-only / db-only diffs).
 *
 * Authentication: uses a direct Postgres connection via the `SUPABASE_DB_URL`
 * env var. We query the `supabase_migrations` schema directly, which is not
 * reliably reachable through PostgREST.
 *
 * Fork fallback: if `SUPABASE_DB_URL` is absent, prints a skip message and
 * exits 0 — forks do not have access to repo secrets, and this check is not
 * safety-critical for them.
 *
 * Usage (CI): `tsx scripts/check-migration-drift.ts`
 */
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type PgClient = {
  connect: () => Promise<void>;
  query: (sql: string) => Promise<{ rows: Array<{ name: string }> }>;
  end: () => Promise<void>;
};
type PgModule = {
  Client: new (config: { connectionString: string }) => PgClient;
};

// Documented drift exceptions from OPS-01: prod tracking was backfilled for
// these 5 migrations under their legacy unprefixed names; renaming tracking
// to match the repo was explicitly rejected. Repo remains source of truth.
const KNOWN_DRIFT_PAIRS: ReadonlyArray<{ repo: string; db: string }> = [
  { repo: "006a_add_customer_ownership_and_fix_rls", db: "add_customer_ownership_and_fix_rls" },
  { repo: "021_fix_trigger_search_path", db: "fix_trigger_search_path" },
  { repo: "022_internal_cost_rate_config", db: "internal_cost_rate_config" },
  { repo: "023_rls_perf_and_indexes", db: "rls_perf_and_indexes" },
  { repo: "024_service_hours_sort_order", db: "service_hours_sort_order" },
];

async function main(): Promise<void> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.log(
      "skipping migration drift check (no DB credentials available — expected on forks)"
    );
    return;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = resolve(here, "..", "supabase", "migrations");

  const repoNames = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.replace(/\.sql$/, ""))
    .sort();

  // Dynamic import so the script can be typechecked even when `pg` is not
  // installed locally. CI installs pg just-in-time for this job.
  // @ts-expect-error QA-01: `pg` is installed ad-hoc in the CI migrations-drift-check job, not as a repo-wide dep
  const pg = (await import("pg")) as PgModule;
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  let dbNames: string[];
  try {
    const { rows } = await client.query(
      "SELECT name FROM supabase_migrations.schema_migrations ORDER BY name"
    );
    dbNames = rows.map((r) => r.name).sort();
  } finally {
    await client.end();
  }

  const repoSet = new Set(repoNames);
  const dbSet = new Set(dbNames);

  for (const pair of KNOWN_DRIFT_PAIRS) {
    if (repoSet.has(pair.repo) && dbSet.has(pair.db)) {
      repoSet.delete(pair.repo);
      dbSet.delete(pair.db);
      console.log(
        `migration drift check: accepting documented exception: ${pair.repo} <-> ${pair.db}`
      );
    }
  }

  const repoOnly = repoNames.filter((n) => repoSet.has(n) && !dbSet.has(n));
  const dbOnly = dbNames.filter((n) => dbSet.has(n) && !repoSet.has(n));

  if (repoOnly.length === 0 && dbOnly.length === 0) {
    console.log(
      `migration drift check: OK (${repoNames.length} migrations match)`
    );
    return;
  }

  console.error("migration drift detected:");
  if (repoOnly.length > 0) {
    console.error(`  repo-only (${repoOnly.length}):`);
    for (const n of repoOnly) console.error(`    + ${n}`);
  }
  if (dbOnly.length > 0) {
    console.error(`  db-only (${dbOnly.length}):`);
    for (const n of dbOnly) console.error(`    - ${n}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("migration drift check failed:", err);
  process.exit(1);
});
