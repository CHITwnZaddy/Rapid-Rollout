# Self-Heal Audit

This document is the historical evidence pack that justified removing the old
self-heal logic.

What we audited:

- proposals missing `bid_sheets`
- proposals missing `migration_config`
- proposals missing `migration_detail_lines`

Why this mattered:

- Before `create_proposal_bundle(...)`, proposal creation could leave child
  records missing.
- After `create_proposal_bundle(...)`, new proposals should be created
  atomically.
- If missing-child rows still appeared on newly created proposals, that would
  indicate a current regression.
- If they only appeared on older proposals, self-heal would have been acting
  as legacy-data protection.

## Files Related To This Audit

| File | Why it matters |
| --- | --- |
| [legacy-self-heal-review.md](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/docs/legacy-self-heal-review.md) | records the historical self-heal paths and why they were removed |
| [017_atomic_proposal_bootstrap.sql](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/supabase/migrations/017_atomic_proposal_bootstrap.sql) | established the atomic create path that made the older rescue logic obsolete for new proposals |
| [self-heal-audit.sql](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/docs/self-heal-audit.sql) | the SQL audit script that was run in Supabase |

## What We Did

1. Opened Supabase for the target project.
2. Ran [self-heal-audit.sql](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/docs/self-heal-audit.sql)
   with the atomic-bootstrap cutoff set to the deployment point for the atomic
   create path.
3. Reviewed the aggregate counts and before/after bucket output.
4. Confirmed the audit found `0` proposals missing:
   - `bid_sheets`
   - `migration_config`
   - `migration_detail_lines`
5. Removed the bid-sheet and migration self-heal paths based on that evidence.

## Why The Cutoff Mattered

The cutoff existed to distinguish:

- legacy incomplete proposals
- new proposals that should already have been atomic

That was the key question before removing self-heal. Once the audit showed no
missing child rows on either side of the cutoff, the runtime repair paths were
no longer justified.

## What The Script Returned

### 1. Aggregate counts

The script measured how many proposals were missing:

- `bid_sheets`
- `migration_config`
- `migration_detail_lines`

This told us the size of the legacy-data problem.

### 2. Before/after bootstrap buckets

The script grouped missing-child proposals into:

- `before_atomic_bootstrap`
- `after_atomic_bootstrap`

This was the most important result.

Interpretation:

| Result | Meaning |
| --- | --- |
| Only `before_atomic_bootstrap` rows are missing children | self-heal was mostly legacy protection |
| Any `after_atomic_bootstrap` rows are missing children | we had a current regression or bad deployment path |
| No rows are missing children | self-heal removal is evidence-backed |

### 3. Detailed proposal list

The script could also list each affected proposal with:

- proposal id
- proposal name
- created date
- creator
- customer
- which child rows were missing

That detail view would have been used to decide whether to backfill data, keep
self-heal longer, or remove it.

## Audit Outcome

| Finding | Result |
| --- | --- |
| Missing-child proposals before the cutoff | `0` |
| Missing-child proposals after the cutoff | `0` |
| Proposals missing any required child row | `0` |

Because every count was `0`, the self-heal paths were removed.

## Why This Document Still Matters

This document is still useful because it explains why self-heal was removed
instead of just disappearing from the codebase without explanation.

Future maintainers can use it to understand:

- why load-time self-heal existed
- what evidence justified removal
- what to do if missing child rows ever reappear

## Important Constraint

Do not reintroduce silent self-heal logic based only on theory.

If missing child rows ever reappear, the right default response is:

- investigate proposal creation or deployment alignment
- consider explicit backfill or admin repair tooling
- only reintroduce runtime repair if real evidence demands it
