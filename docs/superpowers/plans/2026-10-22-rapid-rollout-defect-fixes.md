# Rapid Rollout Defect Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement ticket-by-ticket. Steps use checkbox (`- [ ]`) syntax. Write the test first where it applies. Branch workflow per `AGENTS.md`: one PR per ticket (or per batch where noted) **targeting `staging`**, Austin verifies the Vercel staging deploy, then a promotion PR `staging → main`, then the back-merge routine. **Pause and get explicit approval before any ticket marked SCHEMA** (migration files, RLS, `src/types/database.ts`); apply those migrations to staging first, then production, per `docs/deploy-and-migrations.md`.

**Goal:** Fix the defects found in the 2026-10-22 code and production review (report: `rapid-rollout-findings-2026-10-22.md`, attached to the review session). Every finding below was verified in the source on `main @ a6feb24` and, where marked *(live)*, against the production Supabase project. None of the fixes change pricing math; the engines under `src/lib/calculations/` stay untouched.

**Tech Stack:** Next.js 16.2.3 App Router, React 19, Supabase Postgres/Auth/RLS (@supabase/ssr 0.10, supabase-js 2.103), Zod 4, Vitest, shadcn/ui on Base UI, Tailwind v4, ExcelJS.

---

## Context

- Static gates are clean on `main` (tsc, eslint, 487 tests, `next build`). `main` and `staging` are content-identical. Both Supabase projects have all 39 migrations; RLS policies and function grants match the repo; security advisor reports zero findings.
- Production has 8 auth users: 3 admins have signed in; **5 invited users never completed their invite** (April ×4, August ×1) and their invite tokens are long expired. All active users today are admins, which is why the "silent no-op write" class (Batch 2) has not been noticed yet: admins pass every RLS policy.
- Live RLS facts the plan relies on: `proposals` UPDATE = owner or manager/admin; `proposals` DELETE = owner or admin; every proposal child table (`scenarios`, `scenario_lines`, `bid_sheets`, `scoped_services`, `migration_config`, `migration_detail_lines`) INSERT/UPDATE/DELETE = owner or **admin only** (not manager); `customers` UPDATE = creator or admin, DELETE = creator-with-no-proposals or admin. A Supabase `.update()/.delete()` whose rows are filtered by RLS returns **no error and zero rows**.
- Live FK facts: `proposal_status_history.changed_by`, `proposal_stale_thresholds.updated_by`, `proposals.closed_financials_corrected_by` reference `auth.users(id)` with `ON DELETE NO ACTION`; `proposals.created_by` has **no** FK; `profiles.id` cascades; `customers.created_by` is SET NULL.
- Two things cannot be verified from the repo and are handled as a checklist (Ticket 5): the Supabase email templates and the "Require current password when changing password" Auth setting.

## Decisions needed from Austin (before the ticket that cites them)

| # | Decision | Recommendation | Cited by | Austin's call (2026-10-22) |
| --- | --- | --- | --- | --- |
| D1 | How "Remove user" should work: **soft delete** (no schema change; audit rows keep the actor id; email becomes reusable) vs **hard delete + FK migration** (`ON DELETE SET NULL` on three columns) | Soft delete | Ticket 4 | **Soft delete** |
| D2 | Dashboard window semantics: should pipeline widgets (open value, stage charts, stale, on hold) show the **current snapshot regardless of creation date**, with the date window applying only to closed-won revenue / variance by LoE signed date? | Yes (snapshot for pipeline, LoE-signed window for revenue) | Ticket 9 | **Yes, as recommended** |
| D3 | Closed Won: reject **blank** sold price / LoE value only (keep the current "zero or greater" rule), or require **> 0**? | Reject blank; allow 0 only with an explicit confirmation | Ticket 12 | **Reject blank; 0 only with explicit confirmation** |
| D4 | Non-owner editing: hide/disable edit controls for SEs who did not create the proposal (admins keep full edit), or keep the UI open and rely on the new error messages? | Disable + banner | Ticket 7 | **Keep the controls enabled and keep the banner: SEs back each other up.** Open follow-up: the live RLS lets only the owner or an admin write the proposal child tables, so a backup SE's edits are rejected at the database today; Ticket 7 must either widen those policies to all authenticated users (SCHEMA ticket, pause for approval) or the banner must say the edit will be refused. |

## Suggested batching & order

| Batch | Tickets | What | Schema | PRs |
| --- | --- | --- | --- | --- |
| **1 — stop the bleeding** | 1, 2, 3, 4, 5 | font, service-hours Add Row, admin Users page, user removal, re-invites + Supabase dashboard checklist | No (D1 = soft delete) | Ticket 1 = [#146](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/146), Ticket 2 = [#148](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/148), Tickets 3–4 = [#147](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/147); ticket 5 is operational |
| **2 — silent no-op writes** | 6, 7 | affected-row checks everywhere, then ownership-aware UI | No | 1 PR each |
| **3 — dashboard & reports** | 8, 9, 10, 11 | stale thresholds, quota window, inclusive dates + DST, Proposal Log/Hours/Breakout | No | 1 PR for 8–9, 1 PR for 10–11 |
| **4 — proposal lifecycle** | 12, 13, 14 | closeout validation + delete ordering + Closed Lost, scenario grid resilience, correction UI | No | 1 PR each |
| **5 — admin tables & change log** | 15, 16 | status/lookup_key safety, delete guards, change-log actor + paging | No | 1 PR each |
| **6 — theme, latent, schema follow-ups** | 17, 18, 19 | theme vars, Zod alignment + small fixes, triggers/RPC hardening | 19 = SCHEMA | 1 PR each |

Recommended order: **1 → 2 → 3 → 4 → 5 → 6 → 8 → 9 → 10 → 12 → 13 → 7 → 11 → 14 → 15 → 16 → 17 → 18 → 19.** Tickets 1–4 are each under an hour and remove the most visible breakage.

---

## Ticket 1: Restore the Geist font (self-referencing `--font-sans`)  P1

> Status: implemented in [#146](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/146) (opened from the review session's task card); CI green, awaiting staging verification.

**Purpose:** `src/app/globals.css:10` declares `--font-sans: var(--font-sans);` inside `@theme inline`. A cyclic custom property is invalid at computed-value time, and the `html { @apply font-sans; }` rule (lines ~127-129) then resolves to the browser default serif font. Compiling the stylesheet with the project's Tailwind confirms `html{font-family:var(--font-sans)}` is the winning rule. Present since 2026-05-13 (`2fb9e12`); masked only for users who picked a Google font on `/admin/theme`.

**Files:** `src/app/globals.css`, (read-only) `src/app/layout.tsx`, `src/lib/theme.ts`.

**Steps:**
- [ ] Change line 10 to `--font-sans: var(--font-geist-sans);` (line 11 already maps `--font-mono: var(--font-geist-mono)`). Leave `--font-heading: var(--font-sans);`.
- [ ] Confirm the theme override path still wins: `applyFont` sets `--font-sans` inline on `<html>` and the font cookie `<style>` in `layout.tsx:40` sets `:root { --font-sans: ... }`; both are unlayered and must beat the `@theme inline` value. Verify in the compiled CSS that `:root, :host { --font-sans: var(--font-geist-sans) }` is emitted (layered or lower specificity) and that an inline style on `html` overrides it.
- [ ] Verification script (keep under `scripts/` only if useful, otherwise scratch): compile `globals.css` with `postcss` + `@tailwindcss/postcss` and assert the output no longer contains `--font-sans: var(--font-sans)`.
- [ ] Smoke on staging: load `/login` with no theme cookie and confirm Geist renders; pick "Inter" on `/admin/theme` and confirm it applies; choose "Geist (Default)" and confirm Geist returns.

**Risk:** Low. **Verify:** `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, staging visual check.

---

## Ticket 2: `/admin/service-hours` "Add Row" always fails (NOT NULL `sort_order`)  P1

> Status: implemented in [#148](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/148) (opened from the review session's task card); CI green, awaiting staging verification.

**Purpose:** `service_hours.sort_order` is `integer NOT NULL` with no default *(live)*; `createDefaults` for `service_hours` in `src/components/admin/data-table-config.ts` (~lines 76-86) never supplies it, so `addAdminTableRow` (`src/components/admin/actions.ts:133-138`) inserts NULL and Postgres rejects it. Migration `20260424195025_service_hours_sort_order.sql` (lines 21-22) said the admin UI would be updated in a follow-up; it never was.

**Files:** `src/components/admin/data-table-config.ts`, `src/components/admin/actions.ts`, `src/components/admin/data-table-utils.ts`, `src/components/admin/actions.test.ts`.

**Steps:**
- [ ] **Test-first:** in `actions.test.ts`, assert the `service_hours` insert payload includes a numeric `sort_order`.
- [ ] Add `{ key: "sort_order", label: "Sort", type: "number", width: "80px" }` to the `service_hours` column config so the value is visible and editable (it drives module order in `create_proposal_bundle`, which orders by `MIN(sort_order)` per `service_name`).
- [ ] Add an optional `computeCreateDefaults?: (supabase) => Promise<Record<string, unknown>>` hook to `AdminTableConfig`; for `service_hours` return `{ sort_order: (max(sort_order) ?? -1) + 1 }` from a `select("sort_order").order("sort_order", { ascending: false }).limit(1)`. Merge it over the static `createDefaults` in `addAdminTableRow`.
- [ ] Re-check the other two configs against their NOT NULL columns *(live)*: `rate_cards` (rate_card_name, activity, rate, role_category, status, lookup_key — all covered) and `customers` (company_name — covered). No change expected.

**Risk:** Low. **Verify:** unit test; on staging add a service-hours row, confirm it appears with the next sort value and that a new proposal lists the new module last.

---

## Ticket 3: Admin Users page — demotion no-op, invite list, list cap, manager role  P1

> Status: implemented in [#147](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/147) together with Ticket 4.

**Purpose:** Four defects in `src/app/(app)/admin/users/`:
1. Demoting to "User" sends `updateUserById(id, { app_metadata: {} })` (`actions.ts` ~119-122). GoTrue merges `app_metadata` key by key, so `role: "admin"` survives; the UI shows "User" until reload and every guard still treats the person as admin.
2. A newly invited user never appears: `users-client.tsx:43` seeds `useState(initialUsers)` once and `handleInvite` never appends, so admins re-invite and get "already registered" (and burn the shared email-sender cap).
3. `listUsers()` uses GoTrue's default page of 50.
4. The role select only offers admin/user even though the app has a `manager` role with its own surfaces; a manager renders as "User".

**Files:** `src/app/(app)/admin/users/actions.ts`, `users-client.tsx`, `actions.test.ts`, `src/lib/auth/roles.ts` (read-only).

**Steps:**
- [ ] **Test-first:** add `actions.test.ts` cases: demotion sends `{ app_metadata: { role: null } }`; promotion to manager sends `{ role: "manager" }`; `inviteUser` returns the created user; `listUsers` requests `perPage: 1000`.
- [ ] Demotion: send `{ app_metadata: { role: null } }` for `user` (GoTrue deletes a key set to null); accept `"manager"` in the role schema and send `{ role: "manager" }`.
- [ ] `inviteUser`: return `{ ok: true, user: { id, email, role, created_at } }`; in `users-client.tsx` append it to local state (or derive rows from props with `useEffect` keyed on `initialUsers`).
- [ ] `listUsers`: pass `{ perPage: 1000 }` (or page through `nextPage` until exhausted) and sort by created_at.
- [ ] Role select: add "Manager"; render the stored role verbatim (`admin | manager | user`), defaulting missing to "User".
- [ ] Copy: the "role takes effect on next sign-in" note is accurate (RLS reads the JWT); keep it.

**Risk:** Low–Medium (service-role calls; all gated by `assertAdmin`). **Verify:** unit tests; on staging demote a test admin and confirm `/admin` redirects after re-login; invite a test address and confirm it appears immediately.

---

## Ticket 4: "Remove user" fails for anyone who ever touched a proposal  P1  *(decision D1 = soft delete; no schema change)*

> Status: implemented in [#147](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/147) (soft delete).

**Purpose:** `deleteUser` hard-deletes via `admin.auth.admin.deleteUser(id)` (`actions.ts:148`). Live FKs `proposal_status_history.changed_by`, `proposal_stale_thresholds.updated_by`, `proposals.closed_financials_corrected_by` are `ON DELETE NO ACTION`, and every proposal bootstrap / status change inserts a history row, so Postgres rejects the delete → "Database error deleting user". The dialog promises "Their proposals will remain".

**Files:** `src/app/(app)/admin/users/actions.ts`, `users-client.tsx`, `actions.test.ts`; if D1 = hard delete: new `supabase/migrations/<ts>_user_fk_on_delete_set_null.sql`, `src/types/database.ts`.

**Steps (D1 = soft delete, recommended):**
- [ ] **Test-first:** assert `deleteUser` calls `auth.admin.deleteUser(id, true)` and that `listUsers` filters out rows with `deleted_at`.
- [ ] Call `deleteUser(id, true)` (soft delete: GoTrue obfuscates email, clears credentials, revokes sessions; the uuid stays valid for audit FKs; `profiles` row stays so "Scoped by" keeps working).
- [ ] Filter `deleted_at` users out of `listUsers` and the KPI "SE" dropdown (`src/lib/settings/sales-ops.ts:52`).
- [ ] Dialog copy: "Their proposals and history will remain; they can no longer sign in."

**Steps (D1 = hard delete):**
- [ ] SCHEMA (pause for approval): migration altering the three columns to nullable + `ON DELETE SET NULL`; regenerate `src/types/database.ts`; apply to staging, verify, then production.
- [ ] Keep hard delete; add the same copy.

**Risk:** Medium (auth admin behaviour). **Verify:** on staging remove a test user who created a proposal; confirm success, proposal still listed, change log intact.

---

## Ticket 5: Operational — re-invite stale invitees + Supabase dashboard checklist  P1 (no code)

**Purpose:** 5 production users (April ×4, August ×1) hold expired invites *(live)*. Three of them carry `role` only in `user_metadata` (pre-fix invites); the August one has no role anywhere. The password-reset and invite flows depend on dashboard settings that the #144 commit itself lists as prerequisites.

**Steps (after Tickets 3–4 ship to production):**
- [ ] In the Supabase dashboard (production **and** staging): set the **Invite** template link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password` and the **Recovery** template link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` (per the comment in `src/app/auth/confirm/page.tsx`). Confirm Site URL is the production domain and that the Email OTP expiry is set to the maximum (24h) so invites survive a working day.
- [ ] Turn on **"Require current password when changing password"** (needed by `/account`, `src/app/(app)/account/actions.ts:64-67`). Then on staging: run a full invite, a full password reset, and a signed-in password change. If the invite/recovery `set-password` form is rejected with the toggle on, implement the fallback in a follow-up ticket: verify the current password with a cookie-less client (`createClient(url, anon, { auth: { persistSession: false } })` + `signInWithPassword`) and keep `updateUser({ password })` plain.
- [ ] From `/admin/users`, re-invite the five pending users; after they accept, set roles with the role select (re-invite does not update metadata on an existing user). Decide whether to delete the three April `user_metadata`-only accounts first so the re-invite creates clean rows.
- [ ] Record the outcome in `docs/deploy-and-migrations.md` or a new `docs/auth-runbook.md` (templates, settings, invite steps).

**Risk:** Low. **Verify:** each flow end-to-end on staging, then one real invite on production.

---

## Ticket 6: Affected-row checks on every mutation (the silent no-op class)  P1

**Purpose:** Child-table `.update()/.delete()` calls never check how many rows changed, so RLS-filtered writes by a manager or a non-owner SE return success: bid sheet (`proposals/[id]/bid-sheet/actions.ts:102-111`, page then recomputes totals with the unsaved value), complexity factors (`complexity-actions.ts` ~35-44, ~61-70; toast "Complexity factor saved."), scoped services line edit and Clear Tab (`scoped-services/actions.ts` ~302-327, ~404-414), migration config/lines from the browser (`src/lib/hooks/use-migration-config.ts` ~169-209 → "All migration changes are saved."), migration remove-row (RPC without `IF NOT FOUND`, `migration/actions.ts` ~395-432 reloads and reports "saved"), the generic admin table used by `/customers` (`src/components/admin/actions.ts:203-258`; `data-table.tsx:89-93` overlays the typed value, `:128-132` toasts "Row deleted."), and the sales-ops settings updates (`admin/stale-thresholds/actions.ts:49-57`, `admin/variance-reasons/actions.ts:50-59`).

**Files:** new `src/lib/supabase/affected-rows.ts`; the action/hook files above; their `*.test.ts` siblings.

**Steps:**
- [ ] **Test-first:** for each action module, add a case where the mocked update/delete resolves with `count: 0` (or `data: []`) and assert `{ ok: false, error: NOT_PERMITTED_MESSAGE }`.
- [ ] Add a tiny helper: `export const NOT_PERMITTED_MESSAGE = "You can only edit proposals you created. Ask the proposal owner or an admin."` and `assertAffectedRows(result: { error, count }, message?)` returning `{ ok: false, error }` when `error` or `count === 0`.
- [ ] Server actions: add `{ count: "exact" }` to every `.update()/.delete()` listed above and route the result through the helper (`withBidSheetMutation` covers the four bid-sheet updaters in one place). For the migration remove-row action, after the RPC re-check `.select("id").eq("id", lineId).maybeSingle()` and return the error if the row still exists (RPC hardening itself is Ticket 19).
- [ ] Browser-side migration saves: in `use-migration-config.ts` `saveConfig`/`saveLine`, append `.select("id")` and throw `NOT_PERMITTED_MESSAGE` when the returned array is empty so `migration-persistence.ts` surfaces it as a failed save instead of "saved".
- [ ] Generic admin table: same count check; for `customers` use a customer-specific message ("Only the person who created this customer, or an admin, can edit it."). In `data-table.tsx`, on `ok: false` revert the cell to the server value and toast the error; do not remove a row unless the delete reported `ok: true`.
- [ ] Bid-sheet page: only apply `setBidSheet(...)` after `result.ok`; on failure show the error and keep the previous value (`bid-sheet/page.tsx` ~364, ~393, ~409).
- [ ] Data note: 2 of 4 production customers have `created_by = NULL` *(live)*; only admins can edit them. Either leave as-is (admins maintain customers) or assign `created_by` to an admin via SQL (data-only, no DDL).

**Risk:** Medium — touches every write path, but each change is "add count, check count". **Verify:** full `vitest run`; on staging sign in as a non-admin test user and confirm every path above now shows the error and persists nothing; as owner confirm everything still saves.

---

## Ticket 7: Ownership-aware proposal UI  P2  *(decision D4)*

**Purpose:** Nothing in the proposal pages gates editing on ownership; `[id]/layout.tsx` reads `created_by` only to print "Scoped by". After Ticket 6 non-owners get errors instead of silent no-ops; this ticket stops them from trying.

**Files:** `src/app/(app)/proposals/[id]/layout.tsx`, new `src/lib/proposals/editability.ts`, the five tab pages and their client components (`scenario-grid.tsx`, `bid-sheet/page.tsx`, `scoped-services/page.tsx`, `migration/page.tsx`, `complexity-factor-input.tsx`, `editable-proposal-name.tsx`, `delete-proposal-button.tsx`, `proposal-status.tsx`).

**Steps:**
- [ ] Add `getProposalEditability(supabase, proposalId)` → `{ canEditContent: owner || admin, canChangeStatus: owner || manager || admin, canDelete: owner || admin }` mirroring the live RLS matrix; unit-test the matrix.
- [ ] Layout: show a muted banner "Read-only: this proposal belongs to <name>. Admins can edit it." when `!canEditContent`; hide Delete when `!canDelete`; keep status controls for managers.
- [ ] Each tab page computes the same flag server-side and passes `readOnly` to its client component; inputs `disabled`, autosave hooks skip scheduling when read-only.

**Risk:** Medium (UI surface). **Verify:** staging as owner / manager / other SE / admin.

---

## Ticket 8: Stale Proposals report must use the editable thresholds  P1

**Purpose:** `reports/stale-proposals/page.tsx:53` hardcodes `STALE_THRESHOLD_DAYS = 21` with `>=`; the dashboard uses `proposal_stale_thresholds` per status with `>` (`dashboard/page.tsx` `fetchStaleThresholds`, `sales-ops.ts:114`). The widget and the report it links to disagree; threshold edits change the dashboard only; the report ignores the `dateFrom/dateTo` the widget passes.

**Files:** `src/lib/reports/data.ts` (new `fetchStaleThresholds`), `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/reports/stale-proposals/page.tsx`, `src/lib/dashboard/sales-ops.ts`, tests.

**Steps:**
- [ ] **Test-first:** unit-test a shared `isStale(status, daysInStatus, thresholds)` with the seeded thresholds (Draft 5, Sent 3, Negotiations 3, Awaiting Sig 14, Discovery/Scoping 21) using `>`; add a report-page test fixture where a 10-day "Sent for Review" row is stale.
- [ ] Move `fetchStaleThresholds` + `StaleThresholdRowSchema` from the dashboard page into `src/lib/reports/data.ts`; export `isStale` from `sales-ops.ts` and use it in `calculateStaleCount`.
- [ ] Report: load thresholds in `runReport`, compute `threshold` per row with `isStale`, drop the constant, and show the per-status threshold in the row/tooltip and in the title suffix. Honour `dateFrom/dateTo` presets the dashboard passes (same `applyDateRange` as Ticket 10).

**Risk:** Low. **Verify:** dashboard "Needs follow-up" count equals the report's stale-bucket row count for the same scope and window.

---

## Ticket 9: Quota / closed-sold by LoE signed date; pipeline window semantics  P1  *(decision D2)*

**Purpose:** `dashboard/page.tsx` ~331-339 fetches proposals by `created_at` within the window and `calculateQuotaProgress` (`sales-ops.ts:124-146`) then filters by `loe_signed_date`, so a deal created last year and signed this year never counts, and older open proposals vanish from open value / stage charts under "Current year".

**Files:** `src/app/(app)/dashboard/page.tsx`, `src/lib/reports/data.ts`, `src/lib/dashboard/sales-ops.ts`, `sales-ops.test.ts`.

**Steps:**
- [ ] **Test-first:** fixture with a Closed Won deal created 2025-11-15, signed 2026-03-31 ($250k) + one created/signed 2026 ($100k) → FY2026 closed sold = $350k.
- [ ] Add `dateColumn: "loe_signed_date"` support to `fetchRevenueReportBaseRows`/`applyDateRange` (DATE column; bare `YYYY-MM-DD` bounds are correct there).
- [ ] Dashboard: fetch **two** sets — (a) pipeline rows: all non-closed statuses, no date filter (D2), scoped by owner; (b) closed rows: `status in (Closed Won, Closed Lost)` with `loe_signed_date` in the window. Feed (a) to open value / stage charts / stale / on-hold and (b) to quota and variance rollups. Keep the window label and the widget drill-down links consistent (`status=open` links drop the date params; closed links pass `dateColumn=loe_signed_date`).
- [ ] Update `prd/pages/02-dashboard.md` to state the semantics.

**Risk:** Medium (numbers change on the dashboard; that is the point). **Verify:** `sales-ops.test.ts`; staging comparison against a hand-computed figure.

---

## Ticket 10: Inclusive date-range end + DST-safe day counts  P2

**Purpose:** `src/lib/reports/data.ts:206` applies `.lte(dateColumn, "YYYY-MM-DD")` to `created_at`/`updated_at` (timestamptz), which Postgres reads as midnight UTC, so the last day of every range is excluded; `src/lib/ui/helpers.ts:31` already uses `T23:59:59.999Z`. Separately `status-history.ts:49-53` and `sales-ops.ts:64-69` floor raw milliseconds, losing a day across the spring DST change.

**Files:** `src/lib/reports/data.ts`, `src/lib/reports/__tests__/data.test.ts`, `src/lib/reports/status-history.ts`, `src/lib/dashboard/sales-ops.ts`, `src/lib/ui/helpers.ts`, tests.

**Steps:**
- [ ] **Test-first:** `data.test.ts` asserts `.lt(column, "<dateTo + 1 day>")` (or `.lte(column, dateTo + "T23:59:59.999Z")`) for timestamptz columns and a bare date for `loe_signed_date`.
- [ ] Implement in `applyDateRange` keyed on the column type; share one `endOfDayUtc(date)` helper with `helpers.ts`.
- [ ] Replace the ms-floor in both `daysBetween` implementations with a calendar-date difference (`Date.UTC(y,m,d)` on each side); unit-test 2026-03-01 → 2026-03-22 (Chicago) = 21.

**Risk:** Low. **Verify:** tests; the "Current quarter" dashboard includes a proposal created on quarter-end day.

---

## Ticket 11: Proposal Log preset, Proposal Hours keys, Scenario Breakout download  P2/P3

**Files:** `src/app/(app)/reports/proposal-log/page.tsx`, `reports/proposal-hours/page.tsx`, `src/components/reports/report-table.tsx`, `src/lib/exports/scenario-breakout.ts`, tests.

**Steps:**
- [ ] Proposal Log (`page.tsx:136-137`): seed `selectedStatuses` state from `statusPreset` once (`useState(() => statusPreset ?? ...)`), query from state only, and let the dropdown override the preset; keep the auto-run on arrival (`useEffect` ~174-186) but not on every later change.
- [ ] Proposal Hours (`page.tsx:143,178`): give rows a composite id (`${proposalId}-${scenario}`) so `report-table.tsx:245` keys are unique; stop emitting zero-hour rows for inactive scenarios (mirror the scoped/migration suppression at ~181-187) and recount "Results (N rows)".
- [ ] Scenario Breakout (`scenario-breakout.ts:258`): defer `URL.revokeObjectURL` with `setTimeout` exactly like `src/lib/reports/export-xlsx.ts:275`.

**Risk:** Low. **Verify:** manual on staging; existing report tests.

---

## Ticket 12: Closeout validation, delete ordering, Closed Lost cleanup  P2  *(decision D3)*

**Purpose:** (a) `proposal-closeout-dialog.tsx:49-50,67-74` seeds blank inputs and submits `Number("")` = 0; `src/lib/proposals/closeout.ts:69-75` accepts 0, so Closed Won can be recorded at $0 with no variance reason. (b) `crud-actions.ts:130-168` inserts the DELETE audit row before the count-checked delete, leaving phantom DELETE entries when a non-owner is refused. (c) `lifecycle-actions.ts:124-134` (Closed Lost) nulls LoE fields but not `sold_price`.

**Files:** `src/components/proposals/proposal-closeout-dialog.tsx`, `src/lib/proposals/closeout.ts`, `closeout.test.ts`, `src/app/(app)/proposals/[id]/crud-actions.ts`, `lifecycle-actions.ts`, their tests.

**Steps:**
- [ ] **Test-first:** `closeout.test.ts`: `soldPrice: null`/`NaN` → error "Sold price is required"; per D3 either 0 allowed or `> 0` required.
- [ ] Validator input types become `number | null`; the dialog passes `null` for blank strings and shows inline errors before submit.
- [ ] Delete: compare `proposal.created_by` to `user.id` (or admin role) **before** writing the audit row; return the permission error early. Keep the audit-before-delete order for owners (FK stays live).
- [ ] Closed Lost: also set `sold_price: null` and clear `closed_financials_corrected_at/by`.

**Risk:** Low. **Verify:** unit tests; staging closeout with blank fields is rejected.

---

## Ticket 13: Scenario grid stays saveable when a referenced service-hours row is deactivated  P2

**Purpose:** `scenario-grid-actions.ts` ~118-175 loads only `status = 'Active'` service hours and `buildCanonicalScenarioGridLines` (`src/lib/scenarios/persist-scenario-grid.ts:48-60`) throws for any **unchanged** line whose stored `scope_selection` is no longer Active, so every edit on that scenario fails until Clear Tab wipes it; meanwhile the grid shows "-" while `summary_total_*` keep the old hours.

**Files:** `src/lib/scenarios/persist-scenario-grid.ts`, `persist-scenario-grid.test.ts`, `src/app/(app)/proposals/[id]/scenario-grid-actions.ts`, `src/components/scenarios/scenario-grid.tsx`.

**Steps:**
- [ ] **Test-first:** unchanged line referencing an inactive scope keeps its stored hours when an `allServiceHoursMap` is supplied; a **changed** line selecting an inactive scope still throws.
- [ ] Load all service-hours rows (Active + Inactive) for resolving unchanged lines; validate only lines present in `changes` against the Active map. Pass both maps to the builder.
- [ ] Grid: render inactive selections with a warning badge ("no longer offered") instead of "-", and only recalculate when the user changes that line.

**Risk:** Medium (pricing path, but the engine is untouched; tests + `excel-parity` cover it). **Verify:** vitest; staging: deactivate a scope, edit another line on an affected scenario, save succeeds.

---

## Ticket 14: Closed-financials correction UI  P2

**Purpose:** `lifecycle-actions.ts:144-198` (`correctClosedFinancials`) is audited and tested but has no caller; the only way to fix a bad sold price is to reopen and re-close, which adds spurious status-history rows and never sets `closed_financials_corrected_*` (the summary "Correction" field is always "—").

**Files:** `src/components/proposals/proposal-closeout-dialog.tsx` (or a new `correct-financials-dialog.tsx`), `proposal-status.tsx`, `[id]/layout.tsx`.

**Steps:**
- [ ] On a closed proposal, show "Correct financials" to managers/admins; dialog pre-filled from current values; submit calls `correctClosedFinancials`; success refreshes the header and summary.
- [ ] Reuse the Ticket 12 validator for the fields.

**Risk:** Low. **Verify:** staging; change log shows the correction row with the actor.

---

## Ticket 15: Admin rate-card / service-hours safety  P2

**Purpose:** `status` and `lookup_key` are free text in `data-table-config.ts` (~50-51, ~73-74); pricing filters `.eq("status","Active")` in 12 places and looks up the hard-coded keys in `src/lib/rate-card-keys.ts` by exact string, so a typo ("active", trailing space) or an edited Sr. IM key blanks proposal pricing; deleting a rate card still referenced by `scoped_services.rate_card_lookup_key` re-prices those lines at $0 (`scoped-services/page.tsx:87`). Admin deleting a customer with proposals gets a raw FK error.

**Files:** `src/components/admin/data-table-config.ts`, `data-table-utils.ts`, `data-table.tsx`, `actions.ts`, tests.

**Steps:**
- [ ] Add a `type: "select"` column kind with `options: ["Active", "Inactive"]` for `status` on both tables.
- [ ] Make `lookup_key` read-only in the UI and derive it server-side on create/update: `rate_card_name|activity` for rate cards, `service_name|scope_value` for service hours (the convention from the seed script / migration 012). Cascade the derived key to `scoped_services.rate_card_lookup_key` rows that referenced the old key (owner/admin RLS applies — do it inside the same admin action with the service-role client only if needed, and log it to `change_log`).
- [ ] Refuse to delete or deactivate a rate card whose key is in `rate-card-keys.ts` or is referenced by any `scoped_services` row; return a message listing the count. Refuse to delete a customer with proposals with a friendly message instead of the FK error.

**Risk:** Medium. **Verify:** unit tests; staging.

---

## Ticket 16: Change log actor and paging  P3

**Purpose:** `admin/change-log/page.tsx:32-36` never selects `changed_by`, does not join `profiles`, caps at 100 rows with no paging; "Deleted By" only works for proposal deletions.

**Steps:**
- [ ] Select `changed_by`, batch-load `profiles(display_name)` for the page, show the actor column for every row.
- [ ] Add `?page=` (or cursor on `created_at,id`) with 50 rows per page and a filter by `table_name`.

**Risk:** Low.

---

## Ticket 17: Theme polish  P3

**Purpose:** `src/lib/theme.ts:162-188,264-270` never themes `--popover`, `--popover-foreground`, `--destructive`, `--ring`, `--sidebar-border` (dialogs/menus/toasts stay white in "Dark Mode"); `hexToOklch("#12")` yields NaN while typing (`theme-client.tsx:115-125` applies on every keystroke); colours apply in `useEffect` (flash of default palette); reset re-applies `DEFAULT_THEME` inline instead of removing properties.

**Steps:**
- [ ] Map popover/destructive/ring/sidebar-border from the nearest themed colour (popover = card, ring = primary, sidebar-border = border) and add them to presets.
- [ ] Guard `handleColorChange` with the hex regex from `src/lib/validation/theme.ts` before applying.
- [ ] Reset: `removeProperty` for every themed var and clear localStorage instead of writing a "Default" blob.
- [ ] Flash: inline a tiny pre-hydration script in `layout.tsx` that applies the saved theme from localStorage (allowed by the report-only CSP today; note the nonce requirement if CSP is enforced later).

**Risk:** Low.

---

## Ticket 18: Latent and small fixes  P3

**Steps:**
- [ ] Zod: make `summary_total_hours/cost`, `discount_percent`, `scoped_services.cost`, `created_at/updated_at` `.nullable()` with coalescing in `src/lib/validation/proposal.ts` (36-41, 49-69, 90-96, 110) so one legacy NULL cannot blank the proposals list or bid sheet; add a test with a NULL row.
- [ ] `proposals/new/page.tsx:115-117`: copy says "4 scenarios"; the bundle creates six.
- [ ] Error boundary: add a `reportClientError({ refCode, digest, message, url })` server action called from `(app)/error.tsx` and `global-error.tsx` so the reference code reaches server logs.
- [ ] Non-owner status change surfaces raw RLS text (`transition_proposal_status`); map `row-level security` errors in `lifecycle-actions.ts` to the Ticket 6 message.
- [ ] Migration page: validate complexity factor client-side against the DB CHECK (0.50–9.99); have Clear Tab cancel pending debounced saves before calling the reset RPC; surface unmount-time save failures via `sonner` instead of state setters.
- [ ] Optional perf: wrap the server `getUser()` in React `cache()` per request (`src/lib/supabase/server.ts`) so layout + page + guards share one Auth round-trip; the proxy keeps its own call. ~600 `GET /auth/v1/user` calls were observed in one active hour *(live)*.

---

## Ticket 19: SCHEMA follow-ups (pause for approval; staging first)  P3

**Steps:**
- [ ] `proposals.updated_at` is never bumped (no trigger on `proposals` *(live)*, nothing writes it), so the list "sorted by updated_at" is creation order: add a `BEFORE UPDATE` trigger using `moddatetime` (or a small plpgsql function with pinned `search_path`) on `proposals`, `bid_sheets`, `scenarios`, `scoped_services`, `migration_config`; additionally bump `proposals.updated_at` from the child-table triggers if "last edited" should reflect grid/bid-sheet edits.
- [ ] `delete_migration_detail_line`: add `IF NOT FOUND THEN RAISE EXCEPTION` after the DELETE (match `scoped_services_row_order_rpc`).
- [ ] Only if D1 = hard delete: the FK `ON DELETE SET NULL` migration from Ticket 4.
- [ ] Performance advisor INFO items: index `proposal_stale_thresholds.updated_by` and `proposals.closed_financials_corrected_by`.
- [ ] Regenerate `src/types/database.ts` after each migration; run `scripts/check-migration-drift.ts` in CI.

---

## Out of scope (intentional)

- Pricing engine changes (`src/lib/calculations/*`): nothing found; leave the Excel-parity contract alone.
- Security-review items from `docs/code-review-2026-10-07.md` (Next.js patch, dependency cleanup, MFA, CSP enforcement, Sentry) — separate plan; Ticket 17's inline script should be revisited when CSP is enforced.
- Replacing browser-side Supabase reads/writes on the bid-sheet, scoped-services and migration pages with server actions — larger refactor; Ticket 6 fixes the correctness gap without it.
- Vercel runtime-error review — blocked until the Vercel connector is re-authorized for the `constructing-connections` team.
