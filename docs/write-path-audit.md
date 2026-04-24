# Write Path Audit

This document inventories the remaining write paths in Rapid Rollout after the
Phase 1-10 stabilization work.

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

## Stabilized Write Paths

### 1. Scenario Grid

| Item | Value |
| --- | --- |
| File | [src/components/scenarios/scenario-grid.tsx](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/components/scenarios/scenario-grid.tsx) |
| What it writes | `scenario_lines` and `scenarios.summary_total_*` |
| Write style | Client -> server action -> RPC |
| User feedback | Save badge plus explicit retryable error state |
| Main risk | No longer a top open risk; now server-backed and atomic |
| Risk label | `Stabilized` |

Current behavior:

- The grid updates local state immediately.
- A debounced save batches changed scope selections and sends them to the
  server action.
- The server recomputes the full canonical line set and persists it through the
  `save_scenario_grid(...)` RPC.
- Failed saves now surface an explicit error state and a retry action.

Why this matters:

- This used to be the highest-risk browser-owned proposal editing flow.
- It is now the reference implementation for a server-backed core proposal
  mutation path.

Recommendation:

- Keep the current retry/error handling and server-backed contract.
- Do not regress this back to browser-owned persistence.

## Remaining Write Paths

### 2. Scoped Services

| Item | Value |
| --- | --- |
| File | [src/app/(app)/proposals/[id]/scoped-services/page.tsx](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/app/(app)/proposals/[id]/scoped-services/page.tsx) |
| What it writes | `scoped_services` rows |
| Write style | Client-side insert / update / delete |
| User feedback | Explicit toasts and rollback on failed writes |
| Main risk | Still browser-owned persistence on a proposal-editing page |
| Risk label | `Behavior-tightening` |

Current behavior:

- `addLine()` inserts directly from the browser and only appends the returned
  row after success.
- `updateLine()` updates local state optimistically, then rolls back on DB
  failure.
- `removeLine()` surfaces delete failures and only removes the row after DB
  success.

Why this matters:

- This page is much safer than it used to be.
- The remaining question is whether it should stay a hardened client flow or
  eventually move to a server-side contract for consistency.

Recommendation:

- Keep the current behavior-tightened client flow for now.
- Revisit server actions only if we decide proposal editing should converge on a
  single persistence model.

### 3. Bid Sheet

| Item | Value |
| --- | --- |
| File | [src/app/(app)/proposals/[id]/bid-sheet/page.tsx](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/app/(app)/proposals/[id]/bid-sheet/page.tsx) |
| What it writes | `bid_sheets.customer_id`, `discount_percent`, `discount_dollars`, `notes` |
| Write style | Client-side update |
| User feedback | Explicit field-level saving states and surfaced failures |
| Main risk | Still browser-owned persistence on a revenue-critical page |
| Risk label | `Behavior-tightening` |

Current behavior:

- `discount_percent` and `discount_dollars` validate input and surface DB
  failure.
- `customer_id` and `notes` now surface save failures consistently.
- The page no longer auto-creates missing `bid_sheets` rows on load.

Why this matters:

- This page is revenue-critical.
- It is much safer now, but still uses browser writes rather than a shared
  server-side contract.

Recommendation:

- Keep the current normalized save behavior.
- Later, decide whether bid-sheet writes should move behind a server action or
  remain a hardened client page.

### 4. Migration Config And Detail Lines

| Item | Value |
| --- | --- |
| File | [src/lib/hooks/use-migration-config.ts](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/lib/hooks/use-migration-config.ts) |
| What it writes | `migration_config`, `migration_detail_lines` |
| Write style | Client-side queue for config/inline edits plus server actions for add/remove |
| User feedback | Save status, explicit error text, and retry action |
| Main risk | Config and inline edits are still client-queued, but the highest-risk row mutations are now server-backed |
| Risk label | `Behavior-tightening` |

Current behavior:

- Config updates and line updates flow through the persistence controller.
- The page now surfaces save status, failure text, and retry behavior.
- Initial self-heal creation paths were removed.
- Add-line and remove-line flush queued edits first, then run through server
  actions that recompute `computed_total_cost` and return canonical rows.

Why this matters:

- This path is much safer than it was before.
- The main remaining question is whether config/inline edits ever need the same
  server-backed treatment, not whether row mutations are still dangerously
  browser-owned.

Recommendation:

- Keep the queue. It solved a real concurrency bug.
- Do not move add/remove back into the browser.
- Only revisit this area if we choose a broader “all proposal writes converge
  on server actions” architecture phase.

### 5. Admin Table

| Item | Value |
| --- | --- |
| File | [src/components/admin/data-table.tsx](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/components/admin/data-table.tsx) |
| What it writes | `customers`, `rate_cards`, `service_hours` |
| Write style | Client-side insert / update / delete |
| User feedback | Explicit toasts and local state updates only after success |
| Main risk | Still client-side, but much safer than before |
| Risk label | `Low urgency` |

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
| 1 | Decide whether Bid Sheet should converge on a server-action contract | `Higher-risk refactor` | It is now the highest-priority remaining browser-owned revenue write path |
| 2 | Decide whether Scoped Services should converge on a server-action contract | `Higher-risk refactor` | It is stable, but still browser-owned and recalculates cost client-side |
| 3 | Keep migration config/inline edits on the queue unless broader convergence is explicitly prioritized | `Safe / no behavior change` | The queue is solving a real problem and row mutations are already server-backed |
| 4 | Keep the admin table as the low-risk client-side reference | `Safe / no behavior change` | It remains a low-risk browser-write implementation |

## What I Would Not Do Next

- I would not move every client-side write to a server action all at once.
- I would not remove the migration persistence controller just because it is
  client-side; it fixed a real concurrency bug.
- I would not re-open Scenario Grid or migration add/remove unless we find a
  new concrete failure mode there.
- I would not touch schema/storage names as part of this audit PR.
