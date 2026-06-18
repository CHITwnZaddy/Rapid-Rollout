# Rapid Rollout review cleanup implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fix the review findings from the Rapid Rollout structured review in small, independently verified tickets on `staging`.

**Architecture:** Keep pricing math in `src/lib/calculations/`, data assembly in `src/lib/reports/` or `src/lib/proposals/`, and mutations in Server Actions or Postgres RPCs. Pricing-critical rate-card reads must fail closed and only use active rows.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Postgres/Auth/RLS, Zod, Vitest, eslint, Tailwind/shadcn.

---

## Completion status

**Status:** Complete. This plan is kept as a historical implementation record.

All 8 tickets were implemented on `staging`, smoke tested, and promoted to production through separate PRs. Historical migration notes and review context should remain in the repo unless a future cleanup explicitly replaces them with a better archival format.

## Operating rules

- Work directly on `staging`.
- Do one ticket at a time.
- Commit each ticket separately.
- Push only after the ticket is complete and verified.
- Run `npm run lint` and `npm run test` before each push.
- Run targeted tests listed under each ticket before full verification.
- Pause before pushing Ticket 4 or any ticket that adds Supabase migrations, RLS changes, generated database type changes, or DB CHECK constraints.
- If a ticket grows past the named files, stop and reassess before widening scope.

## Subagent model

The lead agent acts as PM and final reviewer. Subagents can investigate or draft patches in parallel when their files do not overlap.

| Subagent | Role | Parallel-safe scope |
| --- | --- | --- |
| Rate Marshal | Rate-card query audit and active-rate patch drafts | Ticket 1, parts of Ticket 2 |
| Report Auditor | Report fetcher error behavior and tests | Ticket 2 |
| Migration Surveyor | Migration math guard and reset RPC design | Tickets 3 and 4 |
| UX Gatekeeper | Scenario, bid-sheet, and scoped-services load states | Ticket 5 |
| Code Janitor | Dead exports and stale helper sweep | Ticket 6 |
| Copy Desk | Comment and docs cleanup | Tickets 7 and 8 |

Parallel dispatch rule: subagents may investigate several tickets at once, but only one agent should edit a file at a time. The lead agent integrates patches, runs tests, and owns commits.

## Ticket 1: Active rate-card loading

**Purpose:** Pricing-critical reads must use active rate-card rows only.

**Files:**
- Modify: `src/lib/supabase/queries.ts`
- Modify: `src/lib/supabase/__tests__/queries.test.ts`
- Modify: `src/lib/proposals/proposal-subtotal.ts`
- Modify: `src/lib/reports/data.ts`
- Check callers in `src/app/(app)/proposals/[id]/page.tsx`, `src/app/(app)/proposals/[id]/bid-sheet/page.tsx`, `src/app/(app)/proposals/[id]/scenarios/[type]/page.tsx`, `src/app/(app)/proposals/[id]/migration/actions.ts`, `src/lib/hooks/use-migration-config.ts`, `src/lib/hooks/use-scenario-breakout.ts`

**Subagents:**
- Rate Marshal: trace every `.from("rate_cards")` query used in pricing, classify as pricing-critical or admin/display-only, and return a file/line list.
- Report Auditor can run in parallel and inspect report rate reads only.

**Steps:**

- [x] Write failing tests in `src/lib/supabase/__tests__/queries.test.ts`:

```ts
it("queries only active required rate rows", async () => {
  const client = mockClient({
    data: [
      { lookup_key: "Master|Program Manager", rate: 180, status: "Active" },
    ],
    error: null,
  });

  await fetchRequiredRates(client, ["Master|Program Manager"]);

  expect(client.from).toHaveBeenCalledWith("rate_cards");
  expect(query.eq).toHaveBeenCalledWith("status", "Active");
});
```

- [x] Update the mock query helper so it supports `.eq("status", "Active")`.
- [x] Modify `fetchRequiredRates` to select `lookup_key, rate`, filter `status = Active`, and keep the missing-key error behavior.
- [x] Update `src/lib/proposals/proposal-subtotal.ts` rate query to filter active rows.
- [x] Update rate queries in `src/lib/reports/data.ts` to filter active rows where they feed migration pricing.
- [x] Run targeted tests:

```bash
npm run test -- src/lib/supabase/__tests__/queries.test.ts src/app/(app)/proposals/[id]/bid-sheet/actions.test.ts src/lib/reports/__tests__/data.test.ts
```

- [x] Run full verification:

```bash
npm run lint
npm run test
```

- [x] Commit:

```bash
git add src/lib/supabase/queries.ts src/lib/supabase/__tests__/queries.test.ts src/lib/proposals/proposal-subtotal.ts src/lib/reports/data.ts
git commit -m "fix: require active pricing rates"
```

**Acceptance criteria:**
- Active required rates load normally.
- Missing active rows fail closed even when inactive rows exist.
- Admin rate-card screens still show/edit rate cards as before.

## Ticket 2: Report/query fail-closed behavior

**Purpose:** Reports must show query failures as errors, not empty business results.

**Files:**
- Modify: `src/lib/reports/data.ts`
- Modify: `src/lib/reports/__tests__/data.test.ts`
- Modify: `src/lib/hooks/use-report-state.ts`
- Modify report pages under `src/app/(app)/reports/`
- Modify: `src/app/(app)/dashboard/page.tsx`

**Subagents:**
- Report Auditor: draft `Result<T>` or thrown-error changes in `src/lib/reports/data.ts` and tests.
- UX Gatekeeper: inspect report pages for current error rendering and list required UI changes.

**Steps:**

- [x] Change report fetchers to throw `Error` on Supabase errors:

```ts
function assertNoSupabaseError(error: { message: string } | null, label: string): void {
  if (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}
```

- [x] Apply that helper to:
  - `fetchReportProposals`
  - `fetchRevenueReportBaseRows`
  - `fetchMigrationCostInputs`
  - `fetchRevenueAggregateInputs`
  - `fetchHoursAggregateInputs`
  - `fetchCustomerMap`
  - `fetchStatusHistoryMap`
- [x] Replace tests that expect empty rows/maps on error with rejection tests:

```ts
await expect(fetchRevenueReportBaseRows(client, {})).rejects.toThrow(
  "proposal_revenue_report_base"
);
```

- [x] Keep empty results only for successful queries that return `[]`.
- [x] Update report pages that call `useReportState(...).run()` so thrown errors surface through the existing toast path.
- [x] Update `dashboard/page.tsx` server-side handling. If a dashboard-critical fetch fails, render an error card instead of zeroed metrics.
- [x] Run targeted tests:

```bash
npm run test -- src/lib/reports/__tests__/data.test.ts src/lib/reports/__tests__/proposal-aggregates.test.ts src/lib/reports/__tests__/revenue-report-consistency.test.ts
```

- [x] Run full verification:

```bash
npm run lint
npm run test
```

- [x] Commit:

```bash
git add src/lib/reports/data.ts src/lib/reports/__tests__/data.test.ts src/lib/hooks/use-report-state.ts src/app/(app)/reports src/app/(app)/dashboard/page.tsx
git commit -m "fix: fail closed on report query errors"
```

**Acceptance criteria:**
- Supabase errors in report fetchers produce visible errors.
- Successful empty queries still render empty states.
- Financial reports no longer treat missing migration/rate data as zero.

## Ticket 3: Migration math guard

**Purpose:** Migration calculations must reject invalid import capacity before division.

**Files:**
- Modify: `src/lib/calculations/migration-engine.ts`
- Modify: `src/lib/calculations/__tests__/migration-engine.test.ts`
- Modify: `src/lib/migration/compute-totals-from-state.ts`
- Modify: `src/lib/migration/compute-totals-from-state.test.ts`
- Check UI/server inputs in `src/components/migration/migration-config-form.tsx` and `src/lib/hooks/use-migration-config.ts`

**Subagents:**
- Migration Surveyor: draft failing tests for `lines_per_import_file` values `0`, `-1`, `NaN`, and `Infinity`.

**Steps:**

- [x] Add tests for invalid import-file capacity:

```ts
it("returns zero imports for invalid import-file capacity instead of Infinity", () => {
  expect(calculateLineImports(100, 0, 4)).toEqual({
    totalLineItems: 100,
    numImports: 0,
    hrsPerImport: 4,
    totalHours: 0,
  });
});
```

- [x] Implement a small guard:

```ts
function validImportCapacity(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}
```

- [x] Use that guard inside `calculateLineImports`.
- [x] Add `computeMigrationTotalsFromState` test proving invalid capacity returns `null` or bounded zero totals. Pick one behavior and keep it consistent.
- [x] Update UI save path to reject non-positive `lines_per_import_file` edits with a user-facing error.
- [x] Run targeted tests:

```bash
npm run test -- src/lib/calculations/__tests__/migration-engine.test.ts src/lib/migration/compute-totals-from-state.test.ts src/lib/hooks/migration-persistence.test.ts
```

- [x] Run full verification:

```bash
npm run lint
npm run test
```

- [x] Commit:

```bash
git add src/lib/calculations/migration-engine.ts src/lib/calculations/__tests__/migration-engine.test.ts src/lib/migration/compute-totals-from-state.ts src/lib/migration/compute-totals-from-state.test.ts src/components/migration/migration-config-form.tsx src/lib/hooks/use-migration-config.ts
git commit -m "fix: guard migration import capacity"
```

**Acceptance criteria:**
- No migration calculation can return `Infinity`.
- Invalid import capacity is blocked before persistence.
- Existing valid migration totals remain unchanged.

## Ticket 4: Transactional migration reset

**Purpose:** Clear Tab reset must update config and detail rows atomically.

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_reset_migration_services_rpc.sql`
- Modify: `src/app/(app)/proposals/[id]/migration/actions.ts`
- Modify: `src/app/(app)/proposals/[id]/migration/actions.test.ts`
- Modify: `src/types/database.ts` after Supabase type generation

**Subagents:**
- Migration Surveyor: draft the SQL function and tests in isolation.
- Lead agent must review SQL before applying or pushing.

**Steps:**

- [x] Draft SQL RPC:

```sql
create or replace function public.reset_migration_services(p_proposal_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  update public.migration_config
  set
    num_projects = 0,
    hrs_per_import = 0.75,
    lines_per_import_file = 2550,
    is_effort_included = false,
    is_workshop_included = false,
    complexity_factor = 1.0,
    sr_im_trips = 0,
    pm_trips = 0,
    doc_avg_mb_per_project = 150000,
    doc_mb_per_hour = 15000,
    core_requirements_hrs = 32,
    core_migration_plan_hrs = 32,
    core_validation_hrs = 20,
    core_final_qa_hrs = 16,
    core_pm_oversight_hrs = 20,
    computed_total_cost = 0,
    updated_at = now()
  where proposal_id = p_proposal_id;

  if not found then
    raise exception 'Missing migration_config row for proposal %', p_proposal_id;
  end if;

  delete from public.migration_detail_lines
  where proposal_id = p_proposal_id;

  insert into public.migration_detail_lines
    (proposal_id, section, label, quantity, items_per_object, total_line_items, row_order)
  values
    (p_proposal_id, 'project', 'Project Info/Detail', 0, 0, 0, 0),
    (p_proposal_id, 'project', 'Schedules', 0, 0, 0, 1),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 0),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 1),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 2),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 3),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 4),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 5),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 6),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 7),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 8),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 9),
    (p_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 10),
    (p_proposal_id, 'cost', 'Budgets', 1, 0, 0, 0),
    (p_proposal_id, 'cost', 'Commitments', 0, 0, 0, 1),
    (p_proposal_id, 'cost', 'Commitment Changes', 0, 0, 0, 2),
    (p_proposal_id, 'cost', 'Commitment Invoices', 0, 0, 0, 3),
    (p_proposal_id, 'cost', 'General Invoices', 0, 0, 0, 4),
    (p_proposal_id, 'cost', 'TBD', 0, 0, 0, 5),
    (p_proposal_id, 'cost', 'TBD', 0, 0, 0, 6),
    (p_proposal_id, 'cost', 'TBD', 0, 0, 0, 7),
    (p_proposal_id, 'cost', 'TBD', 0, 0, 0, 8);
end;
$$;

grant execute on function public.reset_migration_services(uuid) to authenticated;
```

- [x] Replace action-side config update, delete, and insert with:

```ts
const { error } = await supabase.rpc("reset_migration_services", {
  p_proposal_id: parsed.data,
});
```

- [x] Update action test to assert a single RPC call and path revalidation.
- [x] Regenerate or manually update `src/types/database.ts` for the new RPC.
- [x] Run targeted tests:

```bash
npm run test -- src/app/(app)/proposals/[id]/migration/actions.test.ts src/lib/migrations/create-proposal-bundle.test.ts
```

- [x] Run full verification:

```bash
npm run lint
npm run test
```

- [x] Stop and ask Austin before push because this ticket includes a Supabase migration and database type changes.

- [x] Commit after approval:

```bash
git add supabase/migrations src/app/(app)/proposals/[id]/migration/actions.ts src/app/(app)/proposals/[id]/migration/actions.test.ts src/types/database.ts
git commit -m "fix: reset migration services atomically"
```

**Acceptance criteria:**
- Reset is one database transaction.
- A failed reset leaves existing rows intact.
- RLS still enforces proposal write permissions.

## Ticket 5: Scenario, bid-sheet, and scoped-service load states

**Purpose:** User-facing pricing screens must stop rendering editable pricing UI when required data failed to load.

**Files:**
- Modify: `src/app/(app)/proposals/[id]/scenarios/[type]/page.tsx`
- Modify: `src/app/(app)/proposals/[id]/bid-sheet/page.tsx`
- Modify: `src/app/(app)/proposals/[id]/scoped-services/page.tsx`
- Add or update tests under the closest existing page/action test files

**Subagents:**
- UX Gatekeeper: inspect each page and draft the load/error state matrix.
- Rate Marshal: verify each page uses active, pricing-critical rates from Ticket 1.

**Steps:**

- [x] Add scenario page guards for `scenario_lines`, `service_hours`, and `rate_cards` query errors.
- [x] Add scenario page guard for missing internal cost rate.
- [x] Add bid-sheet hard failures for scenario, scoped, proposal, migration config, migration lines, and rates errors.
- [x] Add scoped-services load error state for scoped rows, rate cards, and proposal factor.
- [x] Ensure `ScenarioGrid`, bid sheet totals, and scoped service inputs render only after required data loads.
- [x] Run targeted tests:

```bash
npm run test -- src/app/(app)/proposals/[id]/bid-sheet/actions.test.ts src/app/(app)/proposals/[id]/scoped-services/actions.test.ts src/app/(app)/proposals/[id]/actions.test.ts
```

- [x] Run full verification:

```bash
npm run lint
npm run test
```

- [x] Commit:

```bash
git add src/app/(app)/proposals/[id]/scenarios/[type]/page.tsx src/app/(app)/proposals/[id]/bid-sheet/page.tsx src/app/(app)/proposals/[id]/scoped-services/page.tsx
git commit -m "fix: block pricing screens on load errors"
```

**Acceptance criteria:**
- Pricing pages never calculate from empty rate maps after query failure.
- Users see a clear error state with retry guidance.
- Existing successful page behavior remains intact.

## Ticket 6: Dead code cleanup

**Purpose:** Remove stale exports and test-only runtime helpers after current behavior is protected.

**Files:**
- Modify: `src/lib/validation/bid-sheet.ts`
- Modify: `src/lib/validation/proposal.ts`
- Modify: `src/lib/validation/scenario-grid.ts`
- Modify: `src/lib/validation/migration.ts`
- Modify: `src/lib/validation/scoped-services.ts`
- Possibly modify: `src/lib/validation/parse-supabase.ts`
- Possibly modify: `src/lib/exports/scenario-breakout.ts`
- Possibly modify: `src/lib/calculations/migration-engine.ts`
- Possibly modify: `src/lib/scenarios/persist-scenario-grid.ts`

**Subagents:**
- Code Janitor: run `rg` for every candidate export and return a safe-delete list with evidence.

**Steps:**

- [x] Re-run references:

```bash
rg -n "bidSheetDiscountSchema|BidSheetDiscount|NewProposalInput|SaveScenarioGridInput|AddMigrationDetailLineInput|RemoveMigrationDetailLineInput|AddScopedServiceLineInput|UpdateScopedServiceLineInput|DeleteScopedServiceLineInput|parseSupabaseResult|buildScenarioBreakoutRows|DEFAULT_PROJECT_LINES|buildScenarioGridUpsertPayload" src scripts docs prd specs README.md
```

- [x] Remove exports with no runtime or documented contract.
- [x] Update tests that only existed to pin deleted helpers.
- [x] Run targeted tests for touched modules.
- [x] Run full verification:

```bash
npm run lint
npm run test
```

- [x] Commit:

```bash
git add src/lib/validation src/lib/exports src/lib/calculations src/lib/scenarios
git commit -m "refactor: remove stale helper exports"
```

**Acceptance criteria:**
- No deleted identifier has a runtime reference.
- Tests still cover the behavior through the public path.

## Ticket 7: Comment cleanup

**Purpose:** Remove implementation-history noise after code and tests carry the contract.

**Files:**
- Modify: `src/lib/hooks/use-scenario-breakout.ts`
- Modify: `src/app/(app)/proposals/[id]/migration/actions.ts`
- Modify: `src/app/(app)/proposals/[id]/actions.ts`
- Modify: `src/components/scenarios/scenario-grid.tsx`
- Modify other files found by search

**Subagents:**
- Copy Desk: identify comments that describe old phases, old bugs, team-request history, or obvious code.

**Steps:**

- [x] Search for stale comment markers:

```bash
rg -n "Phase|team request|Previously|old implementation|bug class|remediation|Not atomic|future|kept for|eslint-disable" src
```

- [x] Keep comments that explain business rules or security boundaries.
- [x] Delete comments that narrate implementation history now covered by tests.
- [x] Resolve `react-hooks/exhaustive-deps` suppressions in `scenario-grid.tsx` if a small stable-ref cleanup is enough.
- [x] Run:

```bash
npm run lint
npm run test
```

- [x] Commit:

```bash
git add src
git commit -m "docs: trim stale implementation comments"
```

**Acceptance criteria:**
- Comments explain current behavior, business rules, or security.
- Historical phase notes are gone from runtime code.

## Ticket 8: Docs cleanup

**Purpose:** Bring README, PRD, specs, and design docs into line with current six-scenario behavior.

**Files:**
- Modify: `README.md`
- Modify: `docs/software-design-document.md`
- Modify: `specs/001-rapid-rollout-baseline/spec.md`
- Modify: `prd/README.md`
- Modify: `prd/pages/05-proposal-summary.md`
- Modify: `prd/pages/07-scenario-grids.md`
- Modify: `prd/pages/12-report-proposal-log.md`
- Modify: `prd/pages/14-report-proposal-hours.md`
- Modify: `prd/appendix/enum-dictionary.md`
- Modify: `prd/appendix/api-inventory.md`

**Subagents:**
- Copy Desk: run the stale scenario search and update docs only.

**Steps:**

- [x] Search stale four-scenario references:

```bash
rg -n "four scenario|P1/P2/Opt1/Opt2|P1`, `P2`, `Opt1`, `Opt2|P4|Phase 4" README.md docs prd specs
```

- [x] Replace current product references with six scenarios:

```text
P1, P2, P3, Opt1, Opt2, Opt3
```

- [x] Preserve historical migration notes in `supabase/migrations` and docs that are explicitly historical.
- [x] Run:

```bash
npm run lint
npm run test
```

- [x] Commit:

```bash
git add README.md docs specs prd
git commit -m "docs: update scenario contract"
```

**Acceptance criteria:**
- Current docs describe six scenarios.
- Historical docs remain accurate when they describe past migrations.
- No runtime files change in this ticket.

## Suggested execution order

1. Ticket 1: Active rate-card loading.
2. Ticket 2: Report/query fail-closed behavior.
3. Ticket 3: Migration math guard.
4. Ticket 4: Transactional migration reset.
5. Ticket 5: Scenario, bid-sheet, and scoped-service load states.
6. Ticket 6: Dead code cleanup.
7. Ticket 7: Comment cleanup.
8. Ticket 8: Docs cleanup.

## Parallelization map

Initial parallel research before Ticket 1:
- Rate Marshal: rate-card query map.
- Report Auditor: report error behavior map.
- Migration Surveyor: migration math and reset risk map.
- UX Gatekeeper: pricing screen load-state map.
- Code Janitor: stale export map.
- Copy Desk: stale docs/comment map.

Sequential patch order:
- Tickets 1, 2, 3, and 4 should patch sequentially because pricing behavior and migration state touch shared assumptions.
- Ticket 5 starts after Tickets 1 and 2 because load states depend on the final fail-closed contract.
- Tickets 6, 7, and 8 can run after Ticket 5 and can be split across agents.

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

- Spec coverage: all 8 agreed tickets are represented.
- Rollback: every ticket has one commit boundary.
- Supabase risk: Ticket 4 is isolated and requires explicit approval before push.
- Parallel work: investigation can run in parallel; patch integration stays sequential for shared files.
- No open placeholder steps remain.
