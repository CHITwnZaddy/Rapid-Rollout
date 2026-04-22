# Legacy Self-Heal Review

This document records the places where the app still creates missing rows or
defaults on the fly to recover from historically broken data.

Why this exists:

- Some of these behaviors were valuable before the atomic proposal bootstrap
  landed.
- Some may still be needed for old proposals that were created before the fix.
- Keeping them forever can hide data-integrity problems and make debugging
  harder.

The goal is not to remove all self-heal logic immediately. The goal is to know
which ones are still justified.

## Decision Labels

| Label | Meaning |
| --- | --- |
| `Keep for now` | Still useful for old/broken rows or necessary for current UX |
| `Monitor` | Likely temporary, but do not remove until we inspect existing data |
| `Remove later` | Candidate for cleanup after data audit / backfill |

## Self-Heal Inventory

### 1. Bid Sheet Row Creation On Read

| Item | Value |
| --- | --- |
| File | [src/app/(app)/proposals/[id]/bid-sheet/page.tsx](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/app/(app)/proposals/[id]/bid-sheet/page.tsx) |
| Behavior | If no `bid_sheets` row exists for a proposal, the page inserts one during load |
| Original reason | Older proposal creation could fail to create the child row |
| Current decision | `Monitor` |

Why it existed:

- Before `create_proposal_bundle(...)`, proposal creation was not atomic.
- A proposal could exist without its `bid_sheets` child row.
- Without this rescue path, the bid sheet page became effectively unusable.

Why it is now suspicious:

- New proposals should be created atomically after PR 23.
- If this path still fires for newly created proposals, that is a bug we should
  investigate, not quietly mask.

Recommendation:

- Keep it for now to protect old records.
- Add lightweight telemetry or at least logging in a future pass so we can see
  whether it is still firing.
- After validating old data, move toward removing it.

### 2. Migration Config Creation On Read

| Item | Value |
| --- | --- |
| File | [src/lib/hooks/use-migration-config.ts](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/lib/hooks/use-migration-config.ts) |
| Behavior | If no `migration_config` row exists, the hook inserts one during load |
| Original reason | Older proposal creation could leave migration config missing |
| Current decision | `Monitor` |

Why it existed:

- The older create flow could leave proposal children incomplete.
- The migration page needed a config row in order to function.

Why it is now suspicious:

- The atomic proposal bootstrap should create this row up front.
- A missing config row now means either old data or a new regression.

Recommendation:

- Keep it for now.
- Treat any new hit on this self-heal path as evidence of a proposal-bootstrap
  regression.

### 3. Migration Default Detail Lines Creation On Read

| Item | Value |
| --- | --- |
| File | [src/lib/hooks/use-migration-config.ts](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/lib/hooks/use-migration-config.ts) |
| Behavior | If no `migration_detail_lines` exist, the hook inserts the default project/workflow/cost rows during load |
| Original reason | Older proposal creation could leave the migration detail set incomplete |
| Current decision | `Monitor` |

Why it existed:

- The migration UI expects the default line set to exist.
- Missing lines made the page incomplete or misleading.

Why it is now suspicious:

- The atomic proposal bootstrap should create these defaults.
- If the hook still needs to do this for new proposals, the bootstrap contract
  is broken.

Recommendation:

- Keep it for historical data only.
- In a later cleanup pass, consider splitting "load existing proposal" from
  "repair legacy proposal" so the behavior is explicit.

## Self-Heal Behaviors That Are No Longer The Main Problem

| File | Why it matters |
| --- | --- |
| [src/app/(app)/proposals/new/actions.ts](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/app/(app)/proposals/new/actions.ts) | This is now the preferred path because `create_proposal_bundle(...)` creates the required proposal children atomically |
| [supabase/migrations/017_atomic_proposal_bootstrap.sql](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/supabase/migrations/017_atomic_proposal_bootstrap.sql) | This migration is the reason the older rescue logic should be becoming obsolete over time |

## Recommended Next Steps

| Priority | Recommendation | Risk label | Why |
| --- | --- | --- | --- |
| 1 | Keep the current self-heal paths in place for now | `Safe / no behavior change` | They still protect old data while we learn how often they fire |
| 2 | Add a small detection mechanism for self-heal activation | `Behavior-tightening` | We need evidence before removal |
| 3 | Audit historical proposals for missing `bid_sheets`, `migration_config`, or `migration_detail_lines` | `Behavior-tightening` | This tells us whether the self-heal paths are still serving real rows |
| 4 | Remove self-heal behavior only after the audit shows it is obsolete | `Higher-risk refactor` | Silent repair logic should not survive forever without proof it is still needed |

## Direct Recommendation

Do not remove these paths in the next PR.

Why:

- We know they were needed historically.
- We do not yet know how much legacy data still depends on them.
- The safer next step is to measure, not guess.
