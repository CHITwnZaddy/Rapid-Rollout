# Phase 1 dashboard and sales ops implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 SE dashboard, Manager role, Settings pages, KPI targets, stale thresholds, variance reasons, lifecycle updates, closeout rules, report click-throughs, and responsive UI polish from the approved design spec.

**Architecture:** Start with schema, role, RLS, and server-action rules so the UI cannot lie. Then add Settings pages, lifecycle/closeout behavior, dashboard metrics, report deep links, and responsive visual polish. Keep dashboard math in focused library modules with Vitest coverage before wiring pages.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/Postgres/RLS, server actions, Vitest, Recharts, shadcn-style local UI components.

---

## Source spec

Implementation must follow:

`docs/superpowers/specs/2026-05-01-phase-1-dashboard-sales-ops-design.md`

When the plan and spec disagree, stop and update the plan or spec before coding.

## Phase map

| Phase | Name | Risk | Why it comes here |
| --- | --- | --- | --- |
| 0 | Baseline and branch | safe/no behavior change | Avoid mixing this work with unrelated local changes |
| 1A | Schema, roles, RLS | higher-risk refactor | Every later screen depends on these rules |
| 1B | Settings pages | behavior-tightening | Managers need editable operating rules before dashboard math can be trusted |
| 1C | Lifecycle and closeout | behavior-tightening with schema impact | Proposal state and closeout rules define quota truth |
| 1D | Reports and dashboard data | behavior-tightening | Widgets need tested data functions before UI work |
| 1E | Dashboard UI and report routing | behavior-tightening | Build the visible workflow on tested data |
| 1F | Responsive and visual pass | safe/no behavior change | Polish after behavior is stable |
| 1G | Staging verification and PR | release-risk checkpoint | Migrations and RLS need staging proof before production |

## File map

### New files

| File | Responsibility |
| --- | --- |
| `supabase/migrations/<timestamp>_phase_1_sales_ops_dashboard.sql` | Tables, seed data, RLS policies, proposal closeout fields, lifecycle support |
| `src/lib/auth/roles.ts` | Shared role constants and predicates |
| `src/lib/auth/__tests__/roles.test.ts` | Role predicate tests |
| `src/lib/settings/sales-ops.ts` | Server-side loaders for KPI targets, stale thresholds, and variance reasons |
| `src/lib/settings/__tests__/sales-ops.test.ts` | Settings loader/query-shape tests |
| `src/app/(app)/admin/kpi-targets/page.tsx` | KPI Targets Settings page |
| `src/app/(app)/admin/kpi-targets/actions.ts` | KPI target mutations |
| `src/app/(app)/admin/kpi-targets/actions.test.ts` | KPI mutation authorization and validation tests |
| `src/app/(app)/admin/stale-thresholds/page.tsx` | Stale Thresholds Settings page |
| `src/app/(app)/admin/stale-thresholds/actions.ts` | Stale threshold mutations |
| `src/app/(app)/admin/stale-thresholds/actions.test.ts` | Stale threshold mutation tests |
| `src/app/(app)/admin/variance-reasons/page.tsx` | Variance Reasons Settings page |
| `src/app/(app)/admin/variance-reasons/actions.ts` | Variance reason mutations |
| `src/app/(app)/admin/variance-reasons/actions.test.ts` | Variance reason mutation tests |
| `src/lib/proposals/status.ts` | Lifecycle lists, buckets, stale behavior, closeout reason constants |
| `src/lib/proposals/status.test.ts` | Lifecycle and stale pure-function tests |
| `src/lib/proposals/closeout.ts` | Closeout validation and variance calculation |
| `src/lib/proposals/closeout.test.ts` | Closed Won, Closed Lost, and variance validation tests |
| `src/components/proposals/proposal-closeout-dialog.tsx` | Closed Won / Closed Lost form UI |
| `src/lib/dashboard/sales-ops.ts` | Dashboard metric calculations and query normalization |
| `src/lib/dashboard/sales-ops.test.ts` | Dashboard metric tests |
| `src/components/dashboard/dashboard-scope-filter.tsx` | My/team/SE scope selector |
| `src/components/dashboard/dashboard-date-filter.tsx` | Current Year, Current Quarter, Custom Range selector |
| `src/components/dashboard/dashboard-widget-link.tsx` | Shared clickable widget wrapper |
| `src/components/dashboard/value-by-stage-chart.tsx` | Value by stage chart |
| `src/components/dashboard/count-by-stage-chart.tsx` | Count by stage chart |

### Existing files to modify

| File | Change |
| --- | --- |
| `src/types/database.ts` | Regenerate after migration |
| `src/lib/auth/require-admin.ts` | Add Manager/Admin helper |
| `src/lib/auth/__tests__/require-admin.test.ts` | Cover manager role |
| `src/lib/hooks/use-auth.ts` | Expose role consistently |
| `src/lib/hooks/use-require-admin.ts` | Replace or expand with role-aware hook |
| `src/components/layout/app-sidebar.tsx` | Rename Admin to Settings and add role-based items |
| `src/app/(app)/admin/layout.tsx` | Allow Manager into manager-owned Settings routes |
| `src/components/admin/data-table-config.ts` | Add config entries if reusing generic admin data table |
| `src/components/admin/actions.ts` | Support Manager/Admin table permissions if generic table is reused |
| `src/components/admin/actions.test.ts` | Add Manager/Admin permission tests |
| `src/lib/constants/statuses.ts` | Replace old statuses with approved lifecycle |
| `src/components/proposals/proposal-status.tsx` | Route terminal transitions through closeout dialog |
| `src/app/(app)/proposals/[id]/actions.ts` | Add closeout/correction actions |
| `src/app/(app)/proposals/[id]/actions.test.ts` | Add lifecycle and closeout tests |
| `src/app/(app)/proposals/[id]/page.tsx` | Show Created Date, closeout fields, variance, correction affordance |
| `src/app/(app)/proposals/lifecycle-states.test.ts` | Update status enum and remove Void tests |
| `src/app/(app)/reports/proposal-log/page.tsx` | Accept query-param presets for status, owner, date range, stale bucket where relevant |
| `src/app/(app)/reports/stale-proposals/page.tsx` | Use editable stale thresholds and query-param presets |
| `src/app/(app)/reports/portfolio-value/page.tsx` | Keep status rules in sync or retire from dashboard dependency |
| `src/lib/reports/data.ts` | Add shared owner/date/status filter support |
| `src/lib/reports/__tests__/data.test.ts` | Lock query shape for new filters |
| `src/app/(app)/dashboard/page.tsx` | Replace current count-card dashboard |
| `src/app/(app)/layout.tsx` | Support collapsible/hideable sidebar |
| `src/components/ui/badge.tsx` | Add softer semantic variants if needed |

## Phase 0: baseline and branch

### Task 0.1: Confirm working tree and create feature branch

**Files:**
- Read: working tree only

- [ ] Run:

```bash
git status --short
```

- [ ] Confirm only expected docs are untracked:

```text
?? docs/superpowers/
```

- [ ] Create branch:

```bash
git switch -c codex/phase-1-dashboard-sales-ops
```

- [ ] Run baseline checks:

```bash
npm run test
npm run lint
```

- [ ] Commit the approved spec and plan:

```bash
git add docs/superpowers/specs/2026-05-01-phase-1-dashboard-sales-ops-design.md docs/superpowers/plans/2026-05-01-phase-1-dashboard-sales-ops-implementation.md
git commit -m "docs: add phase 1 sales ops dashboard plan"
```

## Phase 1A: schema, roles, and RLS

### Task 1.1: Add shared role helpers

**Files:**
- Create: `src/lib/auth/roles.ts`
- Create: `src/lib/auth/__tests__/roles.test.ts`
- Modify: `src/lib/auth/require-admin.ts`
- Modify: `src/lib/auth/__tests__/require-admin.test.ts`

- [ ] Write tests for role predicates:

```ts
import { describe, expect, it } from "vitest";
import { isAdminRole, isManagerRole, isManagerOrAdminRole } from "../roles";

describe("auth roles", () => {
  it.each(["admin", "manager", "user", undefined])(
    "classifies role %s",
    (role) => {
      expect(isAdminRole(role)).toBe(role === "admin");
      expect(isManagerRole(role)).toBe(role === "manager");
      expect(isManagerOrAdminRole(role)).toBe(
        role === "admin" || role === "manager"
      );
    }
  );
});
```

- [ ] Add `src/lib/auth/roles.ts`:

```ts
export const APP_ROLES = ["user", "manager", "admin"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function isAdminRole(role: unknown): role is "admin" {
  return role === "admin";
}

export function isManagerRole(role: unknown): role is "manager" {
  return role === "manager";
}

export function isManagerOrAdminRole(role: unknown): role is "manager" | "admin" {
  return role === "manager" || role === "admin";
}
```

- [ ] Add `assertManagerOrAdmin()` in `src/lib/auth/require-admin.ts` using `isManagerOrAdminRole(user.app_metadata?.role)`.

- [ ] Extend `src/lib/auth/__tests__/require-admin.test.ts`:

```ts
import { assertAdmin, assertAuthenticated, assertManagerOrAdmin, AuthError } from "../require-admin";
```

Add cases:

```ts
describe("assertManagerOrAdmin", () => {
  it("returns the user when role is manager", async () => {
    getUserMock.mockResolvedValue({
      data: { user: userWith("manager") },
      error: null,
    });
    const user = await assertManagerOrAdmin();
    expect(user.app_metadata?.role).toBe("manager");
  });

  it("returns the user when role is admin", async () => {
    getUserMock.mockResolvedValue({
      data: { user: userWith("admin") },
      error: null,
    });
    const user = await assertManagerOrAdmin();
    expect(user.app_metadata?.role).toBe("admin");
  });

  it("throws FORBIDDEN when role is user", async () => {
    getUserMock.mockResolvedValue({
      data: { user: userWith("user") },
      error: null,
    });
    await expect(assertManagerOrAdmin()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
```

- [ ] Run:

```bash
npm run test -- src/lib/auth
```

- [ ] Commit:

```bash
git add src/lib/auth
git commit -m "feat: add manager role helpers"
```

### Task 1.2: Add sales ops schema migration

**Files:**
- Create: `supabase/migrations/<timestamp>_phase_1_sales_ops_dashboard.sql`
- Modify after generation: `src/types/database.ts`

- [ ] Create a migration with:
  - `kpi_year_targets`
  - `kpi_user_targets`
  - `proposal_stale_thresholds`
  - `proposal_variance_reasons`
  - proposal closeout columns
  - Closed Lost columns
  - manager-aware RLS policies
  - seed rows from the spec

- [ ] Use this table shape:

```sql
CREATE TABLE kpi_year_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL UNIQUE,
  label TEXT NOT NULL,
  team_quota NUMERIC(14,2) NOT NULL CHECK (team_quota >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE kpi_user_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL REFERENCES kpi_year_targets(year) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_amount NUMERIC(14,2) NOT NULL CHECK (target_amount >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year, user_id)
);

CREATE TABLE proposal_stale_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL UNIQUE,
  threshold_days INTEGER NOT NULL CHECK (threshold_days > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE proposal_variance_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] Add proposal columns:

```sql
ALTER TABLE proposals
  ADD COLUMN sold_price NUMERIC(14,2),
  ADD COLUMN loe_value NUMERIC(14,2),
  ADD COLUMN loe_signed_date DATE,
  ADD COLUMN variance_reason_code TEXT REFERENCES proposal_variance_reasons(code),
  ADD COLUMN variance_note TEXT,
  ADD COLUMN closed_lost_reason TEXT,
  ADD COLUMN closed_lost_note TEXT,
  ADD COLUMN closed_financials_corrected_at TIMESTAMPTZ,
  ADD COLUMN closed_financials_corrected_by UUID REFERENCES auth.users(id);
```

- [ ] Seed required reference data from the spec.

- [ ] Add helper SQL functions for role checks using `auth.jwt() -> 'app_metadata' ->> 'role'`.

- [ ] Add RLS:
  - SE can read active stale thresholds and active variance reasons.
  - Manager/Admin can read and write KPI tables, stale thresholds, and variance reasons.
  - Manager/Admin can read Change Log.
  - Existing proposal ownership policies must be reviewed and widened for Manager/Admin read access if needed by dashboard/reporting.

- [ ] Run local syntax check if available:

```bash
npm run db:status
```

- [ ] Apply to staging only:

```bash
npm run db:push:staging
```

- [ ] Regenerate database types using the repo's existing Supabase type workflow. If no script exists, use the Supabase CLI command already used in this repo and write the output to `src/types/database.ts`.

- [ ] Commit:

```bash
git add supabase/migrations src/types/database.ts
git commit -m "feat: add sales ops dashboard schema"
```

## Phase 1B: Settings pages

### Task 2.1: Rename Admin nav group to Settings and gate items by role

**Files:**
- Modify: `src/components/layout/app-sidebar.tsx`
- Modify: `src/app/(app)/admin/layout.tsx`
- Modify: `src/lib/hooks/use-auth.ts`
- Modify: `src/lib/hooks/use-require-admin.ts`

- [ ] Add role-aware UI state:
  - SE sees no Settings group.
  - Manager sees Change Log, KPI Targets, Stale Thresholds, Variance Reasons.
  - Admin sees all Settings items.

- [ ] Keep existing Admin-only pages Admin-only by URL.

- [ ] Run:

```bash
npm run lint
```

- [ ] Commit:

```bash
git add src/components/layout/app-sidebar.tsx src/app/'(app)'/admin/layout.tsx src/lib/hooks
git commit -m "feat: add role-based settings navigation"
```

### Task 2.2: Add KPI Targets Settings page

**Files:**
- Create: `src/app/(app)/admin/kpi-targets/page.tsx`
- Create: `src/app/(app)/admin/kpi-targets/actions.ts`
- Create: `src/app/(app)/admin/kpi-targets/actions.test.ts`
- Create or modify: `src/lib/settings/sales-ops.ts`
- Create or modify: `src/lib/settings/__tests__/sales-ops.test.ts`

- [ ] Write action tests proving:
  - SE cannot save KPI targets.
  - Manager can save KPI targets.
  - Admin can save KPI targets.
  - Negative target values are rejected.
  - Year must be a calendar year.

- [ ] Build page with editable rows for:
  - Team quota by year.
  - SE target by year.
  - Active flag.

- [ ] Use FY labels for display and calendar year for math.

- [ ] Run:

```bash
npm run test -- src/app/'(app)'/admin/kpi-targets src/lib/settings
```

- [ ] Commit:

```bash
git add src/app/'(app)'/admin/kpi-targets src/lib/settings
git commit -m "feat: add KPI target settings"
```

### Task 2.3: Add Stale Thresholds Settings page

**Files:**
- Create: `src/app/(app)/admin/stale-thresholds/page.tsx`
- Create: `src/app/(app)/admin/stale-thresholds/actions.ts`
- Create: `src/app/(app)/admin/stale-thresholds/actions.test.ts`

- [ ] Write tests proving:
  - SE cannot save thresholds.
  - Manager/Admin can save thresholds.
  - Threshold days must be positive integers.
  - On Hold is not saved as a stale threshold.

- [ ] Build page with editable threshold days for:
  - Discovery
  - Scoping
  - Proposal Draft
  - Sent for Review
  - Negotiations
  - Awaiting Sig

- [ ] Run targeted tests.

- [ ] Commit:

```bash
git add src/app/'(app)'/admin/stale-thresholds
git commit -m "feat: add stale threshold settings"
```

### Task 2.4: Add Variance Reasons Settings page

**Files:**
- Create: `src/app/(app)/admin/variance-reasons/page.tsx`
- Create: `src/app/(app)/admin/variance-reasons/actions.ts`
- Create: `src/app/(app)/admin/variance-reasons/actions.test.ts`

- [ ] Write tests proving:
  - SE cannot edit reasons.
  - Manager/Admin can edit active state, labels, descriptions, and sort order.
  - Reason code cannot be blank.
  - No `Other` seed exists.

- [ ] Build page around seeded reasons:
  - AE discount
  - Scope removed
  - Pricing correction
  - Client negotiation

- [ ] Run targeted tests.

- [ ] Commit:

```bash
git add src/app/'(app)'/admin/variance-reasons
git commit -m "feat: add variance reason settings"
```

## Phase 1C: lifecycle and closeout

### Task 3.1: Replace proposal statuses

**Files:**
- Modify: `src/lib/constants/statuses.ts`
- Create: `src/lib/proposals/status.ts`
- Create: `src/lib/proposals/status.test.ts`
- Modify: `src/app/(app)/proposals/lifecycle-states.test.ts`
- Modify: `supabase/migrations/<timestamp>_phase_1_sales_ops_dashboard.sql` or add follow-up migration if needed

- [ ] Replace statuses with:

```ts
export const PROPOSAL_STATUSES = [
  "Discovery",
  "Scoping",
  "Proposal Draft",
  "Sent for Review",
  "Negotiations",
  "Awaiting Sig",
  "Closed Won",
  "Closed Lost",
  "On Hold",
] as const;
```

- [ ] Add lifecycle bucket helpers in `src/lib/proposals/status.ts`.

- [ ] Update tests so Void is gone.

- [ ] Run:

```bash
npm run test -- src/app/'(app)'/proposals/lifecycle-states.test.ts src/lib/proposals/status.test.ts
```

- [ ] Commit:

```bash
git add src/lib/constants/statuses.ts src/lib/proposals src/app/'(app)'/proposals/lifecycle-states.test.ts supabase/migrations
git commit -m "feat: update proposal lifecycle statuses"
```

### Task 3.2: Add closeout validation

**Files:**
- Create: `src/lib/proposals/closeout.ts`
- Create: `src/lib/proposals/closeout.test.ts`

- [ ] Add pure validation functions:
  - `calculateVariance(soldPrice, loeValue)`
  - `validateClosedWonCloseout(input)`
  - `validateClosedLostCloseout(input)`
  - `requiresUnderVarianceReason(soldPrice, loeValue)`

- [ ] Test:
  - Closed Won requires LoE signed date.
  - Under variance requires reason and note.
  - Equal variance does not require reason or note.
  - Positive variance does not require reason or note.
  - Closed Lost requires reason and note.
  - Notes trim whitespace and require at least 10 characters when required.

- [ ] Run:

```bash
npm run test -- src/lib/proposals/closeout.test.ts
```

- [ ] Commit:

```bash
git add src/lib/proposals/closeout.ts src/lib/proposals/closeout.test.ts
git commit -m "feat: add proposal closeout validation"
```

### Task 3.3: Wire closeout into proposal status changes

**Files:**
- Modify: `src/components/proposals/proposal-status.tsx`
- Create: `src/components/proposals/proposal-closeout-dialog.tsx`
- Modify: `src/app/(app)/proposals/[id]/actions.ts`
- Modify: `src/app/(app)/proposals/[id]/actions.test.ts`
- Modify: `src/app/(app)/proposals/[id]/page.tsx`

- [ ] Route Closed Won and Closed Lost through closeout dialog.

- [ ] Add server actions:
  - `closeProposalWon`
  - `closeProposalLost`
  - `correctClosedProposalFinancials`

- [ ] Keep ordinary non-terminal status changes using `transition_proposal_status`.

- [ ] Write server-action tests:
  - SE cannot close won without LoE date.
  - SE cannot close lost without reason/note.
  - Under variance requires reason/note.
  - SE cannot correct closed financials.
  - Manager/Admin can correct closed financials.
  - Correction writes Change Log.

- [ ] Show immutable Created Date on proposal detail.

- [ ] Show closeout fields and variance on proposal detail after close.

- [ ] Run targeted tests.

- [ ] Commit:

```bash
git add src/components/proposals src/app/'(app)'/proposals/'[id]'
git commit -m "feat: enforce proposal closeout rules"
```

## Phase 1D: report filters and dashboard data

### Task 4.1: Extend shared report loaders

**Files:**
- Modify: `src/lib/reports/data.ts`
- Modify: `src/lib/reports/__tests__/data.test.ts`

- [ ] Add owner/scope filtering:
  - `mine`
  - `team`
  - specific SE id for Manager/Admin

- [ ] Add date range filtering.

- [ ] Add status array filtering for open statuses and clicked stage.

- [ ] Write query-shape tests before implementation.

- [ ] Run:

```bash
npm run test -- src/lib/reports/__tests__/data.test.ts
```

- [ ] Commit:

```bash
git add src/lib/reports/data.ts src/lib/reports/__tests__/data.test.ts
git commit -m "feat: add report preset filters"
```

### Task 4.2: Add dashboard metric library

**Files:**
- Create: `src/lib/dashboard/sales-ops.ts`
- Create: `src/lib/dashboard/sales-ops.test.ts`

- [ ] Build pure functions for:
  - open proposal value
  - value by stage
  - count by stage
  - stale count
  - On Hold count
  - quota progress
  - variance rollups

- [ ] Test:
  - Awaiting Sig is open pipeline but not quota progress.
  - Closed Won counts by LoE signed date.
  - Quota revenue uses `sold_price`.
  - Stale uses days in current status and editable threshold.
  - On Hold is excluded from stale and counted separately.

- [ ] Run:

```bash
npm run test -- src/lib/dashboard/sales-ops.test.ts
```

- [ ] Commit:

```bash
git add src/lib/dashboard
git commit -m "feat: add sales ops dashboard metrics"
```

### Task 4.3: Update Proposal Log and Stale Proposals report presets

**Files:**
- Modify: `src/app/(app)/reports/proposal-log/page.tsx`
- Modify: `src/app/(app)/reports/stale-proposals/page.tsx`
- Modify: `src/lib/reports/status-history.ts`
- Modify: `src/lib/reports/__tests__/status-history.test.ts`

- [ ] Proposal Log must read query parameters for:
  - status
  - owner/scope
  - date range

- [ ] Stale Proposals must read query parameters for:
  - stale bucket
  - owner/scope

- [ ] Applied filters must be visible after navigation.

- [ ] Run report tests.

- [ ] Commit:

```bash
git add src/app/'(app)'/reports src/lib/reports
git commit -m "feat: add report deep-link presets"
```

## Phase 1E: dashboard UI

### Task 5.1: Build dashboard controls and widgets

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- Create: `src/components/dashboard/dashboard-scope-filter.tsx`
- Create: `src/components/dashboard/dashboard-date-filter.tsx`
- Create: `src/components/dashboard/dashboard-widget-link.tsx`
- Create: `src/components/dashboard/value-by-stage-chart.tsx`
- Create: `src/components/dashboard/count-by-stage-chart.tsx`

- [ ] Replace current count cards with:
  - Open Proposal Value
  - Value by Stage
  - Needs Follow-Up
  - Count by Stage

- [ ] Add default scope behavior:
  - SE starts on My proposals.
  - Manager/Admin starts on Team proposals.

- [ ] Add filters:
  - Current Year
  - Current Quarter
  - Custom Range

- [ ] Add widget links:
  - Open Proposal Value to Proposal Log with active statuses.
  - Stage bars to Proposal Log with clicked status.
  - Stale to Stale Proposals.
  - On Hold to Proposal Log with On Hold.

- [ ] Run:

```bash
npm run lint
npm run test -- src/lib/dashboard src/lib/reports
```

- [ ] Commit:

```bash
git add src/app/'(app)'/dashboard src/components/dashboard
git commit -m "feat: add sales ops dashboard"
```

## Phase 1F: responsive and visual pass

### Task 6.1: Make sidebar collapsible and phone-safe

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`

- [ ] Desktop: sidebar visible by default.
- [ ] Tablet: sidebar can collapse.
- [ ] Phone: sidebar opens from a menu button.
- [ ] Main content uses full width without clipping.

- [ ] Run lint.

- [ ] Commit:

```bash
git add src/app/'(app)'/layout.tsx src/components/layout/app-sidebar.tsx
git commit -m "feat: add responsive settings navigation"
```

### Task 6.2: Apply softer visual status language

**Files:**
- Modify: `src/lib/constants/statuses.ts`
- Modify: `src/components/ui/badge.tsx` if needed
- Modify: dashboard/report components using status colors

- [ ] Add softer semantic variants:
  - sage for Closed Won
  - amber for stale
  - rose for under variance
  - slate for On Hold
  - neutral for draft/discovery states

- [ ] Make every color signal paired with label, icon, position, or filter behavior.

- [ ] Run visual smoke checks in browser at:
  - desktop width
  - iPad width
  - iPhone width

- [ ] Commit:

```bash
git add src/lib/constants/statuses.ts src/components src/app/'(app)'/dashboard src/app/'(app)'/reports
git commit -m "style: refine sales ops dashboard visuals"
```

## Phase 1G: staging verification and PR

### Task 7.1: Full local verification

**Files:**
- All changed files

- [ ] Run:

```bash
npm run test
npm run lint
npm run build
git diff --check
```

- [ ] Start the app:

```bash
npm run dev
```

- [ ] Browser-check:
  - SE dashboard default.
  - Manager dashboard default.
  - Settings nav visibility by role.
  - KPI save as Manager.
  - Stale threshold save as Manager.
  - Variance reason save as Manager.
  - Closed Won with equal variance.
  - Closed Won with under variance.
  - Closed Lost with reason/note.
  - Dashboard widget click-through.
  - Desktop/tablet/phone layout.

### Task 7.2: Staging verification

**Files:**
- Migration and app behavior

- [ ] Confirm Supabase CLI auth:

```bash
supabase projects list
```

- [ ] Link and verify staging:

```bash
npm run db:link:staging
npm run db:status
```

- [ ] Push migrations to staging:

```bash
npm run db:push:staging
```

- [ ] Confirm:
  - Seeded KPI years exist.
  - Seeded stale thresholds exist.
  - Seeded variance reasons exist.
  - Manager RLS works.
  - SE write access is blocked for Settings tables.
  - Admin still works.

### Task 7.3: Open PR

**Files:**
- All changed files

- [ ] Push branch:

```bash
git push -u origin codex/phase-1-dashboard-sales-ops
```

- [ ] Create PR:

```bash
gh pr create --title "feat: add phase 1 sales ops dashboard" --body "Summary:
- Add Manager role, sales ops Settings, closeout rules, dashboard metrics, report presets, and responsive dashboard UI.

Test plan:
- npm run test
- npm run lint
- npm run build
- staging migration verification"
```

- [ ] Do not merge until Austin smoke tests.

- [ ] Before merge, run:

```bash
gh pr diff <PR_NUMBER> --name-only
```

- [ ] If files under `supabase/migrations/*.sql` or `src/types/database.ts` changed, pause and get explicit approval before merge.

## Kill switches

| Signal | Stop condition |
| --- | --- |
| Migration fails on staging | Stop before UI work that depends on new tables |
| Manager RLS cannot be proven | Stop before exposing Settings pages |
| Closeout tests are flaky | Stop before dashboard quota widgets |
| Dashboard math disagrees with Proposal Log totals | Stop before visual polish |
| Responsive nav breaks desktop workflow | Stop and revert only the nav commit |

## Review checkpoints

| Checkpoint | Austin reviews |
| --- | --- |
| After Phase 1A | Schema, roles, and RLS direction |
| After Phase 1B | Settings access and editable admin data |
| After Phase 1C | Lifecycle and closeout behavior |
| After Phase 1E | Dashboard behavior and report routing |
| After Phase 1F | Visual design and responsive behavior |

