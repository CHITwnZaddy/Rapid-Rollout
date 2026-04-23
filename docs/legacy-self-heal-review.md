# Legacy Self-Heal Review

This document records the self-heal behaviors Rapid Rollout used to rely on for
historically incomplete proposal data, and what happened to them after the
proposal-bootstrap hardening work.

Why this exists:

- Before the atomic proposal bootstrap landed, some proposals could be created
  without required child rows.
- The app used temporary self-heal behavior to keep those proposals usable.
- Silent repair is dangerous if it stays around forever, because it can hide
  new regressions instead of exposing them.

The important update:

- We audited the database for missing `bid_sheets`, `migration_config`, and
  `migration_detail_lines`.
- The audit found `0` affected proposals.
- Based on that evidence, the bid-sheet and migration self-heal paths were
  removed.

## Decision Labels

| Label | Meaning |
| --- | --- |
| `Removed` | The old self-heal path existed historically, but is no longer active in current code |
| `Historical only` | Useful for understanding why the code used to behave a certain way, but not a current runtime behavior |
| `Monitor` | Still active and intentionally kept for now |

## Historical Self-Heal Inventory

### 1. Bid Sheet Row Creation On Read

| Item | Value |
| --- | --- |
| File | [src/app/(app)/proposals/[id]/bid-sheet/page.tsx](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/app/(app)/proposals/[id]/bid-sheet/page.tsx) |
| Historical behavior | If no `bid_sheets` row existed, the page inserted one during load |
| Original reason | Older proposal creation could fail to create the child row |
| Current decision | `Removed` |

What changed:

- The self-heal audit showed no proposals missing `bid_sheets`.
- The bid-sheet page now fails explicitly instead of silently patching bad data.

What the page does now:

- If the row exists, the page loads normally.
- If the row is missing, the page shows an unavailable/error state and tells us
  the data is broken.

Why this is better:

- New proposals should never enter this state after the atomic bootstrap work.
- If the row is missing now, that is a bug or bad data event we want to see,
  not hide.

### 2. Migration Config Creation On Read

| Item | Value |
| --- | --- |
| File | [src/lib/hooks/use-migration-config.ts](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/lib/hooks/use-migration-config.ts) |
| Historical behavior | If no `migration_config` row existed, the hook inserted one during load |
| Original reason | Older proposal creation could leave migration config missing |
| Current decision | `Removed` |

What changed:

- The self-heal audit showed no proposals missing `migration_config`.
- The hook now surfaces a load error instead of creating a row on read.

Why this is better:

- The migration page should only edit real proposal data, not silently invent
  it.
- If the row is missing now, we want that to fail loudly so the underlying
  problem can be fixed correctly.

### 3. Migration Default Detail Lines Creation On Read

| Item | Value |
| --- | --- |
| File | [src/lib/hooks/use-migration-config.ts](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/lib/hooks/use-migration-config.ts) |
| Historical behavior | If no `migration_detail_lines` existed, the hook inserted default rows during load |
| Original reason | Older proposal creation could leave the migration detail set incomplete |
| Current decision | `Removed` |

What changed:

- The self-heal audit showed no proposals missing `migration_detail_lines`.
- The migration page now surfaces a load error instead of creating default rows
  on read.

Why this is better:

- Missing migration detail rows are now treated as broken proposal data, which
  is accurate.
- The app no longer masks bootstrap regressions behind invisible repair logic.

## What Replaced Self-Heal

| File | Why it matters |
| --- | --- |
| [src/app/(app)/proposals/new/actions.ts](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/app/(app)/proposals/new/actions.ts) | This is the preferred creation path because `create_proposal_bundle(...)` creates required proposal children atomically |
| [supabase/migrations/017_atomic_proposal_bootstrap.sql](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/supabase/migrations/017_atomic_proposal_bootstrap.sql) | This migration made the older rescue logic obsolete |
| [docs/self-heal-audit.md](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/docs/self-heal-audit.md) | This is the evidence trail that justified removal instead of guessing |

## Recommended Next Steps

| Priority | Recommendation | Risk label | Why |
| --- | --- | --- | --- |
| 1 | Keep this document as historical context only | `Safe / no behavior change` | Future maintainers should understand why the app used to self-heal |
| 2 | If missing child rows ever reappear, investigate proposal creation or deploy alignment immediately | `Behavior-tightening` | We should treat that as a regression, not reintroduce silent repair by default |
| 3 | Only reintroduce repair tooling as an explicit admin/data-fix path if real evidence demands it | `Higher-risk refactor` | Any future repair should be deliberate, not hidden in page load |

## Direct Recommendation

Do not re-add silent self-heal behavior casually.

Why:

- The audit showed it was no longer needed.
- The explicit failure states are now more trustworthy than hidden repair.
- If missing child rows ever come back, that should trigger investigation, not
  another layer of invisible patching.
