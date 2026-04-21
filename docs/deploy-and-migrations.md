# Deploy And Migrations

This project deploys application code through GitHub and Vercel, but database
schema changes are separate. A merged PR can ship code that calls a new
Supabase function before that function exists in the target database.

That already happened here:

- `transition_proposal_status(...)` was missing until the SQL from
  `supabase/migrations/016_atomic_proposal_status_transition.sql` was run.
- `create_proposal_bundle(...)` was missing until the SQL from
  `supabase/migrations/017_atomic_proposal_bootstrap.sql` was run.

## Rule

If a PR changes any of the following, treat it as a schema PR:

- `supabase/migrations/*.sql`
- `src/types/database.ts` when it reflects new or changed database objects
- RLS policies
- tables, columns, functions, or RPC contracts

Do not assume a Vercel deploy applies those changes for you. It does not.

## Required Order

1. Review the PR diff.
2. Identify whether it contains schema changes.
3. Smoke test only after the target Supabase database has the required schema.
4. Merge only after the database and app code are aligned.

## Pre-Merge Checklist For Schema PRs

1. Run:

   ```bash
   gh pr diff <PR_NUMBER> --name-only
   ```

2. If the diff includes `supabase/migrations/*.sql` or `src/types/database.ts`,
   pause and call that out explicitly in the PR review.
3. Read the migration and answer these questions:
   - Does the app now call a new RPC or rely on a new policy?
   - Does the change require manual SQL or `supabase db push` before smoke
     testing?
   - What exact user flow will break if the DB is not updated first?
4. Confirm who is applying the database change.
5. Confirm which Supabase project needs the change:
   - local dev
   - preview/staging
   - production

## Applying The Database Change

Use one of these two paths.

### Option 1: Supabase SQL Editor

Best when the PR introduces a single function or policy change and you want a
clear manual step.

1. Open the target Supabase project.
2. Open `SQL Editor`.
3. Paste the SQL from the migration file.
4. Run it.

### Option 2: Supabase CLI

Best when the local repo is linked to the correct project and you want to apply
the pending migration set.

Check the linked project:

```bash
supabase projects list
```

If needed, link first:

```bash
supabase link --project-ref <PROJECT_REF>
```

Then apply migrations:

```bash
supabase db push
```

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
| RLS policy change | test the flow as owner and, if relevant, as admin |
| Rate/pricing-related schema | verify the visible total and at least one dependent report |

## Failure Pattern To Watch For

If the database is missing a new function, Supabase errors look like:

- `Could not find the function public.transition_proposal_status(...) in the schema cache`
- `Could not find the function public.create_proposal_bundle(...) in the schema cache`

That is not a frontend bug. It means the app code is ahead of the database.

## Quick Decision Table

| Situation | Action |
| --- | --- |
| PR has no schema changes | normal PR smoke test is enough |
| PR has schema changes but DB is not updated | do not merge yet |
| PR has schema changes and DB is updated in the test environment | smoke test the affected flow |
| PR has schema changes and user explicitly approves after smoke test | merge is allowed |
