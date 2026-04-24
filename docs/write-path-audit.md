# Write Path Audit

This document inventories the current write paths in Rapid Rollout after the
proposal write-path stabilization work through PR 50.

Why this exists:

- The repo now has a mixed write model.
- Some high-risk flows already use server actions or Postgres RPCs.
- The main proposal and admin write paths now run through server actions or
  Postgres RPCs, with one deliberate migration queue asymmetry remaining.
- The main risk is no longer "pricing math is obviously wrong."
- The remaining risk is mostly "repo guidance or lower-priority paths drift
  away from the stabilized server-backed patterns."

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
| Client queue with explicit error handling and server-backed row mutations | Preserves a proven concurrency fix while still moving the riskiest row mutations to the server | [src/lib/hooks/use-migration-config.ts](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/lib/hooks/use-migration-config.ts) |

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

## Stabilized Proposal Write Paths

### 2. Scoped Services

| Item | Value |
| --- | --- |
| File | [src/app/(app)/proposals/[id]/scoped-services/page.tsx](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/app/(app)/proposals/[id]/scoped-services/page.tsx) |
| What it writes | `scoped_services` rows |
| Write style | Client -> server actions |
| User feedback | Explicit toasts, local draft editing, canonical server rows |
| Main risk | No longer a top open risk; now server-backed |
| Risk label | `Stabilized` |

Current behavior:

- Add, update, and delete all run through page-local server actions.
- The page keeps local draft editing for description and hours, then saves on
  blur.
- The server recalculates `cost` from `hours * rate` and returns canonical
  rows.
- Delete resequences `row_order` densely before returning the updated line set.

Why this matters:

- This used to be one of the main browser-owned proposal editing flows.
- It now follows the same server-backed direction as Scenario Grid and Bid
  Sheet, while keeping the UI behavior stable.

Recommendation:

- Keep the current server-backed contract.
- Do not move `cost` recomputation back into the browser.

### 3. Bid Sheet

| Item | Value |
| --- | --- |
| File | [src/app/(app)/proposals/[id]/bid-sheet/page.tsx](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/app/(app)/proposals/[id]/bid-sheet/page.tsx) |
| What it writes | `bid_sheets.customer_id`, `discount_percent`, `discount_dollars`, `notes` |
| Write style | Client -> server actions |
| User feedback | Explicit field-level saving states and surfaced failures |
| Main risk | No longer a top open risk; now server-backed |
| Risk label | `Stabilized` |

Current behavior:

- `customer_id`, `discount_percent`, `discount_dollars`, and `notes` all save
  through page-local server actions.
- `discount_percent` and `discount_dollars` use local draft state while typing
  and persist on blur.
- The page still surfaces save failures clearly and no longer auto-creates
  missing `bid_sheets` rows on load.

Why this matters:

- This page is revenue-critical.
- It is now server-backed, which removes the last major revenue-critical
  browser-owned write path from the proposal flow.

Recommendation:

- Keep the current normalized save behavior and server-backed contract.
- Do not regress these writes back to direct client persistence.

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

## Remaining Lower-Priority Write Paths

### 5. Admin Table

| Item | Value |
| --- | --- |
| File | [src/components/admin/data-table.tsx](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/components/admin/data-table.tsx) |
| What it writes | `customers`, `rate_cards`, `service_hours` |
| Write style | Client -> server actions |
| User feedback | Explicit toasts and local state updates only after success |
| Main risk | No longer a top open risk; now server-backed |
| Risk label | `Stabilized` |

Current behavior:

- Add, update, and delete all run through shared server actions.
- The shared config now defines editable columns, create defaults, auth policy,
  and revalidation paths in one place.
- The client still waits for success before updating local state and still
  blocks overlapping edits.

Recommendation:

- Keep the current shared server-action contract and centralized table config.
- Do not fork the admin pages back into page-specific direct writes.

## Prioritized Recommendations

| Priority | Recommendation | Risk label | Why |
| --- | --- | --- | --- |
| 1 | Refresh docs/comments whenever write-path work lands | `Safe / no behavior change` | The main drift right now is documentation lag, not active proposal-write bugs |
| 2 | Keep migration config/inline edits on the queue unless broader convergence is explicitly prioritized | `Safe / no behavior change` | The queue is solving a real problem and row mutations are already server-backed |
| 3 | Reassess only if a new concrete write failure appears | `Safe / no behavior change` | The main proposal flows are now in a much healthier state |
| 4 | Treat further write-path work as optional consistency work, not active risk triage | `Safe / no behavior change` | The major correctness and architecture seams are already addressed |

## What I Would Not Do Next

- I would not move every client-side write to a server action all at once.
- I would not remove the migration persistence controller just because it is
  client-side; it fixed a real concurrency bug.
- I would not re-open Scenario Grid or migration add/remove unless we find a
  new concrete failure mode there.
- I would not treat Bid Sheet or Scoped Services as open architecture problems
  anymore; those decisions are already implemented.
- I would not touch schema/storage names as part of this audit PR.
