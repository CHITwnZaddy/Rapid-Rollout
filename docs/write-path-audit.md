# Write Path Audit

This document inventories the remaining write paths in Rapid Rollout after the
Phase 1-5 stabilization work.

Why this exists:

- The repo now has a mixed write model.
- Some high-risk flows already use server actions or Postgres RPCs.
- Other pages still write directly from the browser with lighter error
  handling.
- The risk is no longer "pricing math is obviously wrong." The risk is "a save
  path behaves differently from the others and drifts silently."

## Risk Labels

| Label | Meaning |
| --- | --- |
| `Safe / no behavior change` | Documentation or cleanup that should not change saved behavior |
| `Behavior-tightening` | Keeps the same business intent, but changes how saves, errors, or validation behave |
| `Higher-risk refactor` | Changes the write architecture, storage contract, or recovery behavior |

## Current Target Shape

The write paths we trust most now look like this:

| Pattern | Why it is safer | Current examples |
| --- | --- | --- |
| Server action | Centralized auth checks, clearer error contract, easier revalidation | [src/app/(app)/proposals/[id]/actions.ts](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/app/(app)/proposals/[id]/actions.ts) complexity-factor updates and delete flow |
| Postgres RPC | Atomic multi-write behavior, especially when reporting truth depends on it | [src/app/(app)/proposals/[id]/actions.ts](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/app/(app)/proposals/[id]/actions.ts) status transition, [src/app/(app)/proposals/new/actions.ts](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/app/(app)/proposals/new/actions.ts) proposal creation |
| Client write with explicit error handling and delayed local state update | Lower drift risk when a save fails | [src/components/admin/data-table.tsx](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/components/admin/data-table.tsx) |

## Remaining Write Paths

### 1. Scenario Grid

| Item | Value |
| --- | --- |
| File | [src/components/scenarios/scenario-grid.tsx](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/components/scenarios/scenario-grid.tsx) |
| What it writes | `scenario_lines` and `scenarios.summary_total_*` |
| Write style | Client-side Supabase upsert + update |
| User feedback | Save badge only |
| Main risk | No surfaced error handling for failed writes |
| Risk label | `Behavior-tightening` |

Current behavior:

- The grid updates local state immediately.
- A debounced save batches changed rows into one `upsert`.
- Scenario summary totals are saved in a second client-side `update`.
- There is no visible error path if either request fails.

Why this matters:

- This path is better than the original one-row-at-a-time model.
- It is still weaker than the server-action/RPC paths because the UI can imply
  "saved" without giving the user a real recovery path when Supabase rejects a
  write.

Recommendation:

- Short term: add explicit error handling and a retry state to the current
  client flow.
- Later: consider a server-backed save endpoint if scenario editing needs
  stronger auditing or cross-table guarantees.

### 2. Scoped Services

| Item | Value |
| --- | --- |
| File | [src/app/(app)/proposals/[id]/scoped-services/page.tsx](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/app/(app)/proposals/[id]/scoped-services/page.tsx) |
| What it writes | `scoped_services` rows |
| Write style | Client-side insert / update / delete |
| User feedback | None on success, none on failure |
| Main risk | UI state is updated before DB success is confirmed |
| Risk label | `Behavior-tightening` |

Current behavior:

- `addLine()` inserts directly from the browser and appends the returned row if
  a row comes back.
- `updateLine()` updates local state first, then writes to Supabase.
- `removeLine()` deletes from Supabase, then removes the row from state without
  checking for an error.

Why this matters:

- This page still uses the older "trust the browser write" pattern.
- The user can believe a scoped-services edit was accepted even if the DB write
  failed or partially failed.

Recommendation:

- Move this page toward the admin-table safety model first.
- Minimum fix: capture and surface `insert/update/delete` errors and stop
  mutating local state on failed writes.
- Better fix: use server actions for add/update/remove so the page follows the
  same save contract as the scenario/scoped CF controls.

### 3. Bid Sheet

| Item | Value |
| --- | --- |
| File | [src/app/(app)/proposals/[id]/bid-sheet/page.tsx](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/app/(app)/proposals/[id]/bid-sheet/page.tsx) |
| What it writes | `bid_sheets.customer_id`, `discount_percent`, `discount_dollars`, `notes` |
| Write style | Client-side update |
| User feedback | Partial; some errors toast, some do not |
| Main risk | Inconsistent save contract across fields |
| Risk label | `Behavior-tightening` |

Current behavior:

- `discount_percent` and `discount_dollars` validate input and toast on DB
  failure.
- `customer_id` changes do not surface a DB error.
- `notes` updates do not surface a DB error.
- The page also contains a self-heal insert when the `bid_sheets` row is
  missing. That is documented separately in the legacy self-heal review.

Why this matters:

- This page is revenue-critical.
- Inconsistent save handling is especially risky here because pricing is
  already subtle and the page is user-visible.

Recommendation:

- Normalize all bid-sheet field writes to one save contract.
- Short term: add error handling for customer and notes updates.
- Medium term: move bid-sheet writes behind a server action so auditability and
  recovery behavior are consistent.

### 4. Migration Config And Detail Lines

| Item | Value |
| --- | --- |
| File | [src/lib/hooks/use-migration-config.ts](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/lib/hooks/use-migration-config.ts) |
| What it writes | `migration_config`, `migration_detail_lines` |
| Write style | Client-side queued persistence controller plus direct insert/delete |
| User feedback | Minimal; no strong surfaced DB failure path |
| Main risk | The queue is better than before, but add/remove/create flows still rely on browser writes |
| Risk label | `Behavior-tightening` |

Current behavior:

- Config updates and line updates now flow through the persistence controller.
- That removed the earlier "one timer cancels another" bug.
- But initial config creation, default-line creation, add-line, and remove-line
  behavior are still direct client writes.
- The hook does not currently surface a first-class "save failed" state to the
  UI.

Why this matters:

- This path is much safer than it was before.
- It is still one of the most complex client write flows in the repo.
- Complex client write flows are where subtle Supabase/RLS/network failures are
  hardest for users to interpret.

Recommendation:

- Do not rip out the queue immediately. It solved a real problem.
- Next tightening step: expose persistence failures and distinguish
  "editing locally" from "persisted remotely."
- Longer term: evaluate whether config/line add-remove paths should move to a
  server action or RPC contract.

### 5. Admin Table

| Item | Value |
| --- | --- |
| File | [src/components/admin/data-table.tsx](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/components/admin/data-table.tsx) |
| What it writes | `customers`, `rate_cards`, `service_hours` |
| Write style | Client-side insert / update / delete |
| User feedback | Explicit toasts and local state updates only after success |
| Main risk | Still client-side, but much safer than before |
| Risk label | `Monitor only` |

Why this is lower risk now:

- The page no longer fakes successful writes.
- It blocks overlapping edits.
- It validates editable values before saving.

Recommendation:

- Keep this as the current client-side reference implementation.
- Only move it server-side if broader audit or permissions needs justify that
  extra complexity.

## Prioritized Recommendations

| Priority | Recommendation | Risk label | Why |
| --- | --- | --- | --- |
| 1 | Harden Scoped Services and Bid Sheet write error handling | `Behavior-tightening` | These are still direct client writes on important proposal pages |
| 2 | Expose migration persistence failure state in the UI | `Behavior-tightening` | The queue prevents data loss, but the UX still hides too much about remote save state |
| 3 | Add explicit scenario-grid error handling | `Behavior-tightening` | Scenario edits are central and currently rely on a silent save badge |
| 4 | Decide which proposal-page writes should become server actions | `Higher-risk refactor` | This should happen after the audit, not by habit |

## What I Would Not Do Next

- I would not move every client-side write to a server action all at once.
- I would not remove the migration persistence controller just because it is
  client-side; it fixed a real concurrency bug.
- I would not touch schema/storage names as part of this audit PR.
