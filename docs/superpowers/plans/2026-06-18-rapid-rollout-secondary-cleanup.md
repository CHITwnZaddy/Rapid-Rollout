# Rapid Rollout Secondary Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Finish the lower-priority service, report, export, and data-integrity cleanup items left after the first 8-ticket remediation pass.

**Architecture:** Keep the current fail-closed pricing contract. Move hook/page data assembly into testable helpers before changing UI wiring. Use Postgres RPCs only when app-side multi-step writes can leave inconsistent row order or partial state.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Postgres/Auth/RLS, Zod, Vitest in Node environment, shadcn/ui, Tailwind v4, ExcelJS dynamic imports.

---

## Completion status

**Status:** Complete. This plan is kept as a historical implementation record.

All 7 secondary tickets were implemented on `staging`, smoke tested, and promoted to production through separate PRs. Historical migration notes in `supabase/migrations` are intentionally preserved because they document shipped database history.

## Follow-up decision

Austin decided pricing math should fail hard when required rates are missing. That is a new runtime ticket because the original secondary plan intentionally left pure calculation helpers permissive after user-facing screens were gated.

## Completed primary plan audit

The current 8-ticket implementation plan is addressed on `staging` and has been promoted through PR #93.

| Original ticket | Commit | Status |
| --- | --- | --- |
| Ticket 1: Active rate-card loading | `a1cf191 fix: load active rate cards for pricing` | Complete |
| Ticket 2: Report/query fail-closed behavior | `3ec9f6a fix: fail closed on report query errors` | Complete |
| Ticket 3: Migration math guard | `5546905 fix: guard migration import capacity` | Complete |
| Ticket 4: Transactional migration reset | `5c4145d fix: reset migration services atomically` | Complete |
| Ticket 5: Scenario, bid-sheet, and scoped-service load states | `b5eff0a fix: block pricing screens on load errors` | Complete |
| Ticket 6: Dead code cleanup | `70618bb refactor: remove stale helper exports` | Complete |
| Ticket 7: Comment cleanup | `2b0be53 docs: trim stale implementation comments` | Complete |
| Ticket 8: Docs cleanup | `947f3eb docs: update scenario contract` | Complete |

Do not reopen those same tickets unless a regression is found. The work below is the remaining cleanup from the original review findings and the fresh scan after Ticket 8.

## Operating rules

- Work directly on `staging`.
- Do one ticket at a time.
- Commit each ticket separately.
- Push only after the ticket is complete and verified.
- Run targeted tests listed under each ticket before full verification.
- Run `npm run lint` and `npm run test` before each push.
- Pause before pushing any ticket that adds or changes `supabase/migrations/*.sql`, RLS policies, generated database types, or DB constraints.
- Keep runtime behavior unchanged unless the ticket explicitly says to change user-facing error handling.
- Do not commit the first plan file unless Austin explicitly asks. It is currently a local planning artifact.

## Subagent model

| Subagent | Role | Parallel-safe scope |
| --- | --- | --- |
| Gatekeeper | Supabase env, auth, admin-client, and middleware hardening | Ticket 1 |
| Migration Surveyor | Migration hook loaders, section parsing, and scoped-service RPC design | Tickets 2 and 7 |
| Report Auditor | Scenario breakout loader and report filter error behavior | Tickets 3 and 4 |
| Bid Sheet Mechanic | Bid-sheet view model and XLSX export polish | Ticket 5 |
| Contract Clerk | Parse-helper contract and docs cleanup | Ticket 6 |

Parallel dispatch rule: subagents may investigate in parallel, but only one agent edits a file at a time. The lead agent integrates patches, runs tests, owns commits, and performs the schema scan.

## Ticket 1: Supabase environment and admin-client hardening

**Purpose:** Replace non-null environment assertions with clear runtime errors and type the service-role client.

**Files:**
- Create: `src/lib/env.ts`
- Create: `src/lib/env.test.ts`
- Modify: `src/lib/supabase/server.ts`
- Modify: `src/lib/supabase/admin.ts`
- Modify: `src/lib/supabase/middleware.ts`

**Steps:**

- [x] Add tests for required env lookup.

```ts
// src/lib/env.test.ts
import { describe, expect, it } from "vitest";
import { getRequiredEnv } from "./env";

describe("getRequiredEnv", () => {
  it("returns a configured environment variable", () => {
    expect(getRequiredEnv({ EXAMPLE_KEY: "value" }, "EXAMPLE_KEY")).toBe("value");
  });

  it("throws a clear error when the value is missing", () => {
    expect(() => getRequiredEnv({}, "MISSING_KEY")).toThrow(
      "Missing required environment variable: MISSING_KEY"
    );
  });
});
```

- [x] Implement the helper.

```ts
// src/lib/env.ts
export function getRequiredEnv(
  env: Record<string, string | undefined>,
  key: string
): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
```

- [x] Use `getRequiredEnv(process.env, "NEXT_PUBLIC_SUPABASE_URL")` and `getRequiredEnv(process.env, "NEXT_PUBLIC_SUPABASE_ANON_KEY")` in `src/lib/supabase/server.ts` and `src/lib/supabase/middleware.ts`.
- [x] Use `getRequiredEnv(process.env, "SUPABASE_SERVICE_ROLE_KEY")` in `src/lib/supabase/admin.ts`.
- [x] Type the admin client:

```ts
import type { Database } from "@/types/database";

return createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
```

- [x] In `src/lib/supabase/middleware.ts`, keep redirect behavior for signed-out users but capture auth service errors:

```ts
const {
  data: { user },
  error: userError,
} = await supabase.auth.getUser();

if (userError) {
  console.error("Supabase auth user lookup failed", userError.message);
}
```

- [x] Run targeted tests:

```bash
npm run test -- src/lib/env.test.ts
```

- [x] Run full verification:

```bash
npm run lint
npm run test
```

- [x] Commit:

```bash
git add src/lib/env.ts src/lib/env.test.ts src/lib/supabase/server.ts src/lib/supabase/admin.ts src/lib/supabase/middleware.ts
git commit -m "chore: harden supabase environment setup"
```

**Acceptance criteria:**
- Missing Supabase env vars fail with a named error.
- Admin client is typed with `Database`.
- Middleware still redirects signed-out users as before.

## Ticket 2: Migration load errors and section validation

**Purpose:** Stop treating Supabase load failures as missing legacy migration rows, and reject unknown migration sections before calculation.

**Files:**
- Modify: `src/lib/hooks/use-migration-config.ts`
- Modify: `src/lib/calculations/adapters.ts`
- Modify: `src/lib/calculations/__tests__/adapters.test.ts`
- Create: `src/lib/migration/load-migration-state.ts`
- Create: `src/lib/migration/load-migration-state.test.ts`

**Steps:**

- [x] Add a load helper that returns explicit errors.

```ts
type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => unknown;
  };
};

export type MigrationLoadResult<Config, Line> =
  | { ok: true; config: Config; lines: Line[] }
  | { ok: false; error: string };

export async function loadMigrationState<Config, Line>(
  supabase: SupabaseLike,
  proposalId: string
): Promise<MigrationLoadResult<Config, Line>> {
  const configQuery = supabase
    .from("migration_config")
    .select("*") as {
      eq: (column: string, value: string) => {
        single: () => Promise<{ data: Config | null; error: { message: string } | null }>;
      };
    };

  const configResult = await configQuery.eq("proposal_id", proposalId).single();
  if (configResult.error) {
    return {
      ok: false,
      error: `Couldn't load migration configuration. ${configResult.error.message}`,
    };
  }
  if (!configResult.data) {
    return {
      ok: false,
      error:
        "This proposal is missing its migration configuration row. New proposals should no longer enter this state, so this likely indicates legacy bad data.",
    };
  }

  const linesQuery = supabase
    .from("migration_detail_lines")
    .select("*") as {
      eq: (column: string, value: string) => {
        order: (column: string) => {
          order: (column: string) => Promise<{ data: Line[] | null; error: { message: string } | null }>;
        };
      };
    };

  const linesResult = await linesQuery
    .eq("proposal_id", proposalId)
    .order("section")
    .order("row_order");

  if (linesResult.error) {
    return {
      ok: false,
      error: `Couldn't load migration detail rows. ${linesResult.error.message}`,
    };
  }
  if (!linesResult.data || linesResult.data.length === 0) {
    return {
      ok: false,
      error:
        "This proposal is missing its migration detail rows. New proposals should no longer enter this state, so this likely indicates legacy bad data.",
    };
  }

  return { ok: true, config: configResult.data, lines: linesResult.data };
}
```

- [x] Add tests for config query errors, missing config, line query errors, missing lines, and successful load in `src/lib/migration/load-migration-state.test.ts`.
- [x] Replace the direct config/detail queries in `useMigrationConfig` with `loadMigrationState`.
- [x] Add section parser tests in `src/lib/calculations/__tests__/adapters.test.ts`:

```ts
expect(() =>
  toEngineLine({
    section: "unknown",
    label: "Bad",
    quantity: 1,
    items_per_object: 1,
    total_line_items: 1,
  })
).toThrow("Unknown migration detail section: unknown");
```

- [x] Update `toEngineLine` to narrow sections without an unsafe cast.

```ts
function parseMigrationSection(section: string): "project" | "workflow" | "cost" {
  if (section === "project" || section === "workflow" || section === "cost") {
    return section;
  }
  throw new Error(`Unknown migration detail section: ${section}`);
}
```

- [x] Run targeted tests:

```bash
npm run test -- src/lib/migration/load-migration-state.test.ts src/lib/calculations/__tests__/adapters.test.ts
```

- [x] Run full verification:

```bash
npm run lint
npm run test
```

- [x] Commit:

```bash
git add src/lib/hooks/use-migration-config.ts src/lib/calculations/adapters.ts src/lib/calculations/__tests__/adapters.test.ts src/lib/migration/load-migration-state.ts src/lib/migration/load-migration-state.test.ts
git commit -m "fix: surface migration load errors"
```

**Acceptance criteria:**
- Config and line query failures show real Supabase error messages.
- Missing rows still show the legacy-data message.
- Unknown migration sections cannot enter the calculation engine.

## Ticket 3: Scenario breakout fail-closed loader

**Purpose:** Move scenario-breakout data assembly out of the hook and fail closed on every report query error.

**Files:**
- Create: `src/lib/reports/scenario-breakout-data.ts`
- Create: `src/lib/reports/__tests__/scenario-breakout-data.test.ts`
- Modify: `src/lib/hooks/use-scenario-breakout.ts`

**Steps:**

- [x] Create `loadScenarioBreakoutData` with this public result shape:

```ts
export type ScenarioBreakoutDataResult =
  | {
      ok: true;
      scenarioGroups: ScenarioGroup[];
      scopedLines: ScopedLine[];
      migrationConfig: MigrationConfig | null;
      migrationLines: MigrationLine[];
      migrationBreakdownRows: MigrationBreakdownRow[];
      migrationLiveTotal: number;
    }
  | { ok: false; error: string };
```

- [x] Move the Supabase queries from `useScenarioBreakout.runReport` into `loadScenarioBreakoutData`.
- [x] After each query, return an error instead of reading `data ?? []`:

```ts
function queryError(
  result: { error: { message: string } | null },
  label: string
): string | null {
  return result.error ? `${label} failed to load. ${result.error.message}` : null;
}
```

- [x] Add tests proving errors from `scenarios`, `scenario_lines`, `scoped_services`, `migration_config`, `migration_detail_lines`, and `proposals` each return `{ ok: false }`.
- [x] Add a successful-data test proving the helper returns ordered `SCENARIO_ORDER` groups and computes `migrationLiveTotal`.
- [x] Update `useScenarioBreakout` so `runReport` calls the helper, sets a visible error state, and does not mutate partial report state on failure.
- [x] Add `error` to the hook return object so the report page can render it if needed.
- [x] Run targeted tests:

```bash
npm run test -- src/lib/reports/__tests__/scenario-breakout-data.test.ts src/lib/exports/__tests__/scenario-breakout.test.ts
```

- [x] Run full verification:

```bash
npm run lint
npm run test
```

- [x] Commit:

```bash
git add src/lib/reports/scenario-breakout-data.ts src/lib/reports/__tests__/scenario-breakout-data.test.ts src/lib/hooks/use-scenario-breakout.ts
git commit -m "fix: fail closed on scenario breakout loads"
```

**Acceptance criteria:**
- Scenario breakout no longer builds a report from empty fallback arrays after query failure.
- Pricing/report aggregation moves out of the hook.
- Existing successful export behavior remains intact.

## Ticket 4: Report filter data error state

**Purpose:** Make shared report filters surface customer/auth load failures instead of silently rendering empty filters.

**Files:**
- Create: `src/lib/reports/filter-data.ts`
- Create: `src/lib/reports/__tests__/filter-data.test.ts`
- Modify: `src/lib/hooks/use-report-state.ts`
- Modify: report pages under `src/app/(app)/reports/`

**Steps:**

- [x] Create a testable loader:

```ts
export type ReportFilterData =
  | {
      ok: true;
      customers: { id: string; company_name: string }[];
      currentUserId: string | null;
    }
  | { ok: false; error: string };
```

- [x] Implement `loadReportFilterData(supabase)` so auth and customer errors return `{ ok: false }`.
- [x] Update `useReportFilterData` to return:

```ts
return { supabase, customers, currentUserId, loading, error, retry };
```

- [x] Update each report page that uses `useReportFilterData` to render the existing report error card when `error` is present.
- [x] Add tests for auth error, customer query error, and success path.
- [x] Run targeted tests:

```bash
npm run test -- src/lib/reports/__tests__/filter-data.test.ts src/lib/reports/__tests__/data.test.ts
```

- [x] Run full verification:

```bash
npm run lint
npm run test
```

- [x] Commit:

```bash
git add src/lib/reports/filter-data.ts src/lib/reports/__tests__/filter-data.test.ts src/lib/hooks/use-report-state.ts src/app/(app)/reports
git commit -m "fix: show report filter load errors"
```

**Acceptance criteria:**
- Customer filter query failures are visible.
- Auth lookup failures are visible.
- Successful report filter behavior stays unchanged.

## Ticket 5: Bid-sheet view model and XLSX export cleanup

**Purpose:** Pull bid-sheet pricing assembly out of the client page and fix export formatting for all six scenario labels.

**Files:**
- Create: `src/lib/proposals/bid-sheet-view-model.ts`
- Create: `src/lib/proposals/bid-sheet-view-model.test.ts`
- Modify: `src/app/(app)/proposals/[id]/bid-sheet/page.tsx`
- Modify: `src/lib/reports/export-xlsx.ts`

**Steps:**

- [x] Create a pure builder:

```ts
export function buildBidSheetViewModel(input: {
  scenarios: ScenarioData[];
  migrationTotal: number;
  scopedTotal: number;
  credit: number;
  discountPercent: number;
}) {
  const { proposalSubtotal, pricing } = calculateProposalPricingSummary(input);
  const bidLineItems = [
    ...input.scenarios.map((scenario) => {
      const factor = Number(scenario.complexity_factor ?? 1) || 1;
      return {
        label: scenario.scenario_type,
        displayLabel: getScenarioDisplayName(scenario.scenario_type),
        clientPrice: applyComplexity(Number(scenario.summary_total_cost), factor),
        totalHours: applyComplexity(Number(scenario.summary_total_hours), factor),
      };
    }),
    { label: "Scoped Services", displayLabel: "Scoped Services", clientPrice: input.scopedTotal, totalHours: 0 },
    { label: "Migration Services", displayLabel: "Migration Services", clientPrice: input.migrationTotal, totalHours: 0 },
  ].filter((item) => item.clientPrice > 0 || item.totalHours > 0);

  return { proposalSubtotal, pricing, bidLineItems };
}
```

- [x] Add tests proving `P3` and `Opt3` are included when populated.
- [x] Replace the inline `calculateProposalPricingSummary` and `bidLineItems` block in the bid-sheet page with `buildBidSheetViewModel`.
- [x] Update bid-sheet export styling arrays to include `Phase 3` and `Option 3` wherever `Phase 1`, `Phase 2`, `Option 1`, and `Option 2` are listed.
- [x] In `src/lib/reports/export-xlsx.ts`, delay object URL cleanup:

```ts
anchor.click();
window.setTimeout(() => URL.revokeObjectURL(url), 0);
```

- [x] Apply the same delayed cleanup pattern in the bid-sheet XLSX export.
- [x] Run targeted tests:

```bash
npm run test -- src/lib/proposals/bid-sheet-view-model.test.ts src/lib/proposals/proposal-subtotal.test.ts
```

- [x] Run full verification:

```bash
npm run lint
npm run test
```

- [x] Commit:

```bash
git add src/lib/proposals/bid-sheet-view-model.ts src/lib/proposals/bid-sheet-view-model.test.ts src/app/(app)/proposals/[id]/bid-sheet/page.tsx src/lib/reports/export-xlsx.ts
git commit -m "refactor: extract bid sheet view model"
```

**Acceptance criteria:**
- Bid-sheet pricing assembly is testable without rendering React.
- Phase 3 and Option 3 get the same XLSX formatting as the other scenario rows.
- Object URLs are revoked after the browser has a chance to start the download.

## Ticket 6: Supabase parse-helper contract cleanup

**Purpose:** Remove the unused throwing parse helper or make the documentation match the helper the app actually uses.

**Files:**
- Modify: `src/lib/validation/parse-supabase.ts`
- Modify: `README.md`
- Modify: `specs/001-rapid-rollout-baseline/spec.md`
- Modify: `prd/pages/06-bid-sheet.md`

**Recommendation:** Delete `SupabaseParseError` and `parseSupabaseResult`, keep `safeParseSupabaseResult`, and update docs to say server/client paths use structured parse results.

**Steps:**

- [x] Confirm current references:

```bash
rg -n "parseSupabaseResult|safeParseSupabaseResult|SupabaseParseError" src docs prd specs README.md
```

- [x] Delete `SupabaseParseError` and `parseSupabaseResult` from `src/lib/validation/parse-supabase.ts`.
- [x] Keep this public helper:

```ts
export function safeParseSupabaseResult<T>(
  schema: ZodType<T>,
  result: { data: unknown; error: { message: string } | null }
):
  | { ok: true; data: T }
  | { ok: false; error: string } {
  if (result.error) {
    return { ok: false, error: result.error.message };
  }
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return { ok: true, data: parsed.data };
}
```

- [x] Update README layout text from `parseSupabaseResult helper` to `safeParseSupabaseResult helper`.
- [x] Update `FR-111` wording in the baseline spec to avoid naming the deleted helper:

```md
**FR-111**: System MUST return structured results from server actions and parse Supabase responses with Zod helpers before rendering user-facing data; raw Supabase errors MUST NOT leak to the UI.
```

- [x] Run targeted search again and confirm only `safeParseSupabaseResult` remains.
- [x] Run full verification:

```bash
npm run lint
npm run test
```

- [x] Commit:

```bash
git add src/lib/validation/parse-supabase.ts README.md specs/001-rapid-rollout-baseline/spec.md prd/pages/06-bid-sheet.md
git commit -m "refactor: keep one supabase parse helper"
```

**Acceptance criteria:**
- No unused parse helper remains.
- Docs name the helper contract accurately.
- Existing parse call sites keep their structured result behavior.

## Ticket 7: Scoped-services transactional row ordering

**Purpose:** Make scoped-service delete/resequence atomic so row order cannot be partially updated after a delete.

**Files:**
- Create: `supabase/migrations/20260618194500_scoped_services_row_order_rpc.sql`
- Modify: `src/app/(app)/proposals/[id]/scoped-services/actions.ts`
- Modify: `src/app/(app)/proposals/[id]/scoped-services/actions.test.ts`
- Modify: `src/types/database.ts` after Supabase type generation

**Subagents:**
- Migration Surveyor drafts the SQL and the action test.
- Lead agent reviews SQL, runs dry-run migration checks, and pauses before push.

**Steps:**

- [x] Draft an RPC that deletes one scoped-service row and resequences remaining rows in one transaction.

```sql
create or replace function public.delete_scoped_service_line(
  p_proposal_id uuid,
  p_line_id uuid
)
returns void
language plpgsql
security invoker
as $$
begin
  delete from public.scoped_services
  where id = p_line_id
    and proposal_id = p_proposal_id;

  if not found then
    raise exception 'Scoped service line % was not found for proposal %', p_line_id, p_proposal_id;
  end if;

  with ordered as (
    select
      id,
      row_number() over (order by row_order, id) - 1 as next_row_order
    from public.scoped_services
    where proposal_id = p_proposal_id
  )
  update public.scoped_services s
  set row_order = ordered.next_row_order
  from ordered
  where s.id = ordered.id;
end;
$$;

grant execute on function public.delete_scoped_service_line(uuid, uuid) to authenticated;
```

- [x] Replace app-side delete plus resequence loop with the RPC call.
- [x] Keep the post-RPC reload of scoped lines so the UI receives canonical rows.
- [x] Update action tests to assert a single RPC call and reload.
- [x] Generate or update `src/types/database.ts`.
- [x] Run targeted tests:

```bash
npm run test -- src/app/(app)/proposals/[id]/scoped-services/actions.test.ts
```

- [x] Run full verification:

```bash
npm run lint
npm run test
```

- [x] Run schema scan before any merge:

```bash
gh pr diff --name-only
```

- [x] Stop and ask Austin before pushing or merging because this ticket changes Supabase schema/functions.
- [x] Commit after approval:

```bash
git add supabase/migrations src/app/(app)/proposals/[id]/scoped-services/actions.ts src/app/(app)/proposals/[id]/scoped-services/actions.test.ts src/types/database.ts
git commit -m "fix: resequence scoped services atomically"
```

**Acceptance criteria:**
- Delete and resequence happen inside one database transaction.
- Failed delete leaves row order untouched.
- Existing add/update behavior remains unchanged.

## Suggested execution order

1. Ticket 1: Supabase environment and admin-client hardening.
2. Ticket 2: Migration load errors and section validation.
3. Ticket 3: Scenario breakout fail-closed loader.
4. Ticket 4: Report filter data error state.
5. Ticket 5: Bid-sheet view model and XLSX export cleanup.
6. Ticket 6: Supabase parse-helper contract cleanup.
7. Ticket 7: Scoped-services transactional row ordering.

## Items intentionally not ticketed

- Historical migration notes in `supabase/migrations` should stay historical.
- The first 8-ticket plan should be kept as a historical implementation record.

## Final verification before every push

```bash
git status --short --branch
npm run lint
npm run test
```

For schema tickets:

```bash
gh pr diff --name-only
```

If schema files changed, pause and ask Austin before push or merge.

## Self-review

- Spec coverage: every remaining issue from the pasted review is either ticketed above or marked intentionally not ticketed.
- Rollback: each ticket has a separate commit boundary.
- Supabase risk: Ticket 7 is isolated and has an explicit pause before push or merge.
- Test strategy: hook-heavy work is routed through testable loaders/builders because Vitest runs in Node.
- No runtime ticket depends on the untracked first plan file.
