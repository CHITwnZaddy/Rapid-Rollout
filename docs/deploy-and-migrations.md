# Deploy And Migrations

This project deploys application code through GitHub and Vercel. Database
schema changes travel a separate path: the Supabase GitHub integration applies
new migration files when a PR merges (see
[Applying The Database Change](#applying-the-database-change)). The two paths
are not coordinated, so a merged PR can ship code that calls a new Supabase
function before that function exists in the target database.

That already happened here, back when migrations were applied by hand:

- `transition_proposal_status(...)` was missing until the SQL from
  `supabase/migrations/20260424170006_016_atomic_proposal_status_transition.sql`
  was run.
- `create_proposal_bundle(...)` was missing until the SQL from
  `supabase/migrations/20260424170007_017_atomic_proposal_bootstrap.sql` was
  run.

## Rule

If a PR changes any of the following, treat it as a schema PR:

- `supabase/migrations/*.sql`
- `src/types/database.ts` when it reflects new or changed database objects
- RLS policies
- tables, columns, functions, or RPC contracts

Vercel never applies schema changes. The Supabase GitHub integration does, and
only when the PR merges, so merging a schema PR is what changes the database.
Pause and get an explicit go-ahead before merging one (see `AGENTS.md`).

## Required Order

1. Review the PR diff.
2. Identify whether it contains schema changes.
3. Pause and confirm with the user before merging (`AGENTS.md`), even when the
   merge command is pre-approved.
4. Merge into `staging`. The integration applies the new migration to the
   staging Supabase project. Wait for the "Supabase Preview" check on the merge
   commit to pass before smoke testing.
5. Smoke test the Vercel staging deploy against the staging database.
6. After Austin verifies staging, merge the promotion PR (`staging` -> `main`).
   The integration applies the migration to production the same way.

## Pre-Merge Checklist For Schema PRs

1. Run:

   ```bash
   gh pr diff <PR_NUMBER> --name-only
   ```

2. If the diff includes `supabase/migrations/*.sql` or `src/types/database.ts`,
   pause and call that out explicitly in the PR review.
3. Read the migration and answer these questions:
   - Does the app now call a new RPC or rely on a new policy?
   - Does the app code work against the old schema for the 30-60 seconds
     between the merge and the integration applying the migration?
   - What exact user flow will break if the DB is not updated first?
   - Is the file new? The integration only applies new files. Editing a
     migration that has already been applied changes nothing in the
     database; write a new migration instead.
4. Confirm which Supabase project the merge will change:
   - `staging` branch -> staging project (`qskevpfxmvdlykollnod`)
   - `main` branch -> production project (`twfispazhjiqxabymjiv`)
   - local dev: your own project, applied by hand (`supabase db push`)

## Applying The Database Change

### Normal path: the Supabase GitHub integration

The Supabase GitHub integration applies **new** files in `supabase/migrations`
automatically when a PR merges (verified on PRs #137 and #138):

| Merge into | Applies to | When |
| --- | --- | --- |
| `staging` | staging project (`qskevpfxmvdlykollnod`) | about 30-60 s after the merge |
| `main` | production project (`twfispazhjiqxabymjiv`) | about 30-60 s after the merge |

The apply shows up as a **"Supabase Preview"** check on the merge commit. Wait
for it to pass before smoke testing. It records each migration in the target
project's ledger (`supabase_migrations.schema_migrations`) under the file's own
version and name, which is what the drift check compares against.

Nobody needs to run SQL by hand on this path.

### The "Migrations drift" check

The `Migrations drift` CI job (`scripts/check-migration-drift.ts`) compares the
migration names in `supabase/migrations` with the **production** ledger. That
has three consequences for a schema change:

- It **fails on the schema PR into `staging`**, because production does not
  have the new migration yet. That failure is expected. The job checks out the
  PR merged into its base branch, so every other PR into `staging` fails it
  too until the promotion lands.
- It **fails on the promotion PR (`staging` -> `main`)** for the same reason.
  Production only gets the migration when that PR merges, so the promotion PR
  needs an **admin bypass** to merge (after Austin has verified staging).
- The drift job that runs on the **push to `main`** can race the integration's
  apply to production and fail. Once the "Supabase Preview" check on the merge
  commit has passed, re-run the drift job; it should pass.

Any other drift failure (a name only in the database, or a repo file that
production still lacks after the promotion) is real drift. Stop and reconcile
before merging anything else.

### Fallback: apply by hand with the CLI

Use this only when the integration did not apply a migration (the "Supabase
Preview" check failed or never ran, or the ledger is missing the file). These
scripts link the right project and run `supabase db push`, which records the
exact version and name from the file, so the ledger and the drift check stay
correct:

```bash
npm run db:push:staging   # links qskevpfxmvdlykollnod, then supabase db push
npm run db:push:prod      # links twfispazhjiqxabymjiv, then supabase db push
```

To see what the linked project has applied:

```bash
npm run db:status         # supabase migration list --linked
```

### Do not

- **Do not paste migration SQL into the Supabase SQL Editor** on staging or
  production. It records no version in the ledger, so the drift check fails
  and the integration may try to apply the file again.
- **Do not use the MCP `apply_migration` tool** on staging or production. It
  records the migration under a different version from the file's, which
  causes the same drift.

## Verification Checklist

After the database change is applied, verify the exact object the app depends
on exists.

Examples:

- Proposal status transition flow depends on
  `transition_proposal_status(...)`
- New proposal creation depends on `create_proposal_bundle(...)`

Then run the affected user flow:

1. Load the page that uses the new schema/function.
2. Perform the action once.
3. Refresh and confirm the persisted result is real.
4. Check any downstream report or derived view touched by that flow.

## Smoke Test Guidance

Use the most direct business flow for the changed schema.

| Schema change type | Minimum smoke test |
| --- | --- |
| New RPC for status changes | change status, refresh, confirm status history-based reports still render |
| New RPC for proposal creation | create a proposal, confirm all child records exist, refresh all major tabs |
| RLS policy change | test the flow as the owner, as a plain SE who is not the owner, and as an admin |
| Rate/pricing-related schema | verify the visible total and at least one dependent report |

### Smoke test: backup-SE editing (migration `20261119220158_allow_any_se_to_edit_proposals`)

This migration lets any signed-in user save changes to a proposal they did not
create. Deleting a proposal stays owner-or-admin, changing its owner is
admin-only, and correcting closed-won financials stays manager-or-admin.

Sign in as a **plain SE** (role `user`, not an admin or manager) and open a
proposal **another SE** created:

1. The header shows a muted note that you are editing their proposal as their
   backup, and the **Delete** button is hidden.
2. Edit every tab and refresh after each to confirm the change persisted:
   - a scenario grid (pick a scope value) and that scenario's complexity
     factor
   - Bid Sheet credit, discount percent and notes
   - Scoped Services: add a line, edit it, remove it, and Clear Tab
   - Migration Services: change the config, add a row, remove a row, and Clear
     Tab
   - the Scoped Services complexity factor
3. Rename the proposal.
4. Change its status, including closing it as Closed Won or Closed Lost
   through the closeout dialog. Refresh and confirm the status and closeout
   fields stuck. (The new `proposal_status_history` row records you as
   `changed_by`.)

Then, as the **owner**, confirm there is no backup note, Delete is shown, and
everything still saves. As an **admin** on someone else's proposal, confirm
there is no backup note and Delete is shown.

## Failure Pattern To Watch For

If the database is missing a new function, Supabase errors look like:

- `Could not find the function public.transition_proposal_status(...) in the schema cache`
- `Could not find the function public.create_proposal_bundle(...) in the schema cache`

That is not a frontend bug. It means the app code is ahead of the database:
check the "Supabase Preview" check on the merge commit, and use the CLI
fallback if the migration was not applied.

## Quick Decision Table

| Situation | Action |
| --- | --- |
| PR has no schema changes | normal PR smoke test is enough |
| Schema PR into `staging`, no go-ahead yet | do not merge; surface the schema files and wait |
| Schema PR into `staging`, go-ahead given | merge; wait for the "Supabase Preview" check; smoke test staging (the drift check failing on this PR is expected) |
| Promotion PR carries a schema change | after Austin verifies staging, merge with an admin bypass (drift fails until production has the migration); wait for the "Supabase Preview" check; re-run the push-to-`main` drift job if it raced the apply |
| "Supabase Preview" check failed or the ledger is missing the migration | apply with `npm run db:push:staging` / `npm run db:push:prod`; never the SQL Editor or MCP `apply_migration` |
