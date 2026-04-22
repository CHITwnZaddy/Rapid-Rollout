# Self-Heal Audit

This audit is the evidence-gathering step before we remove any self-heal logic.

What we are auditing:

- proposals missing `bid_sheets`
- proposals missing `migration_config`
- proposals missing `migration_detail_lines`

Why this matters:

- Before `create_proposal_bundle(...)`, proposal creation could leave child
  records missing.
- After `create_proposal_bundle(...)`, new proposals should be created
  atomically.
- If missing-child rows still appear on newly created proposals, that is a new
  regression.
- If they only appear on older proposals, the self-heal logic is still acting
  as legacy-data protection.

## Files Related To This Audit

| File | Why it matters |
| --- | --- |
| [legacy-self-heal-review.md](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/docs/legacy-self-heal-review.md) | documents the current self-heal behaviors and why we have not removed them yet |
| [017_atomic_proposal_bootstrap.sql](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/supabase/migrations/017_atomic_proposal_bootstrap.sql) | establishes the atomic create path that should have made the legacy rescue paths mostly obsolete for new proposals |
| [self-heal-audit.sql](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/docs/self-heal-audit.sql) | the SQL audit script to run in Supabase |

## What You Need To Do

1. Open Supabase for the target project.
2. Open `SQL Editor`.
3. Open [self-heal-audit.sql](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/docs/self-heal-audit.sql).
4. Replace the placeholder bootstrap cutoff timestamp with the date/time when
   the atomic proposal bootstrap reached the target environment.
5. Run the full script.
6. Save the results somewhere we can inspect together.

## How To Choose The Cutoff

Use the date when the target environment started using the atomic create path,
not just when the PR merged on GitHub.

Why:

- GitHub merge time and DB/app deployment time are not always identical.
- The whole point of this audit is to distinguish:
  - legacy incomplete proposals
  - new proposals that should have been atomic but were not

If you are unsure, use the best known production deployment timestamp and note
that assumption when you share the output.

## What The Script Returns

### 1. Aggregate counts

Shows how many proposals are missing:

- `bid_sheets`
- `migration_config`
- `migration_detail_lines`

This tells us the size of the legacy-data problem.

### 2. Before/after bootstrap buckets

Groups missing-child proposals into:

- `before_atomic_bootstrap`
- `after_atomic_bootstrap`

This is the most important result.

Interpretation:

| Result | Meaning |
| --- | --- |
| Only `before_atomic_bootstrap` rows are missing children | self-heal is mostly legacy protection |
| Any `after_atomic_bootstrap` rows are missing children | we still have a current regression or bad deployment path |

### 3. Detailed proposal list

Lists each affected proposal so we can spot patterns:

- proposal id
- proposal name
- created date
- creator
- customer
- which child rows are missing

This is what we use to decide whether to backfill data, keep self-heal longer,
or remove it later.

## Decision Rules

| Finding | Recommended action |
| --- | --- |
| Missing-child proposals exist only before the cutoff | keep self-heal temporarily, plan a legacy backfill, then remove self-heal later |
| Missing-child proposals exist after the cutoff | do not remove self-heal yet; investigate proposal creation and environment alignment |
| No proposals are missing child rows | self-heal removal becomes a reasonable next refactor |

## What I Recommend After You Run It

1. Share the aggregate counts.
2. Share whether any missing-child proposals exist after the cutoff.
3. If there are post-cutoff failures, we investigate before removing anything.
4. If there are only pre-cutoff failures, we decide between:
   - targeted data backfill first
   - keep self-heal until legacy proposals are cleaned up
   - remove self-heal after cleanup

## Important Constraint

Do not delete the self-heal logic based only on theory.

The only safe reasons to remove it are:

- the audit shows no remaining dependent proposals, or
- we intentionally backfilled the missing rows first.
