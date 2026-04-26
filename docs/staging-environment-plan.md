# Staging Environment Plan

This document is the setup runbook for adding a Staging tier between local
development and production. It is the companion to
[`deploy-and-migrations.md`](./deploy-and-migrations.md), which already
defines the discipline for promoting schema changes — this doc creates the
actual environment that discipline assumes.

## Why this exists

Currently, code merged to `main` deploys directly to production users. There
is no intermediate place to verify that a change behaves correctly against a
real Supabase database before exposing it to real data. Adding a Staging
environment decouples *the act of merging* from *the act of exposing users
to a change*, which is the standard professional pattern for any app that
touches a database.

The mental model: treat the app like a shipped product (Word, not a script).
Changes flow `local → staging → production` in one direction; nothing
reaches production without first being smoke-tested on staging.

## End-state architecture

| Tier | Code source | Database | URL | Audience |
| --- | --- | --- | --- | --- |
| Local | working tree | local OR staging Supabase | `localhost:3000` | developer |
| Staging | `staging` branch on GitHub | new Supabase project (`rapid-rollout-staging`) | `staging-rapid-rollout.vercel.app` | developer (smoke testing) |
| Production | `main` branch on GitHub | existing Supabase project | production domain | real users |

Data is fully isolated between Staging and Production. Different Supabase
project = different database, different `auth.users`, different storage
buckets, different everything. That isolation is the entire point.

## Prerequisites and inputs needed

Before the steps in this doc can be executed end-to-end, gather these:

| Input | Source | Used in |
| --- | --- | --- |
| Staging Supabase project-ref | Created in Step 1 (Supabase dashboard) | Steps 2, 6 |
| Production Supabase project-ref | `Settings → General` of existing prod project | Step 6 |
| Vercel project URL for staging | Decided in Step 3 (Vercel dashboard) | Step 5 |
| Confirmation: how many Supabase free-tier projects already exist | supabase.com/dashboard | Step 1 cost decision |
| Decision: local dev points at staging Supabase OR a separate local Supabase instance | personal preference | `.env.local.example` |

## Cost considerations

| Service | Free-tier limit | What pushes over |
| --- | --- | --- |
| Supabase | 2 projects, 500 MB DB each, 50K MAU | A 3rd project, or large staging traffic |
| Vercel Hobby | 1 production deploy + unlimited previews | Custom commercial domain, team features |
| GitHub | n/a (free for solo) | n/a |

Supabase's 2-project limit is the most common gotcha. If you already have a
second free project for any other purpose, creating Staging may move you to
the Pro plan at $25/mo. Verify before clicking Create.

## Step 1 — Create the staging Supabase project

Manual, in browser. Cannot be scripted because it requires your Supabase
login.

1. Go to https://supabase.com/dashboard → **New project**
2. **Name:** `rapid-rollout-staging` — or any name you can distinguish from
   prod at a glance
3. **Region:** same as production (so latency comparisons are fair)
4. **Database password:** generate strong, save to 1Password
5. After provisioning, capture from `Settings → API`:
   - Project URL (becomes `NEXT_PUBLIC_SUPABASE_URL` for staging)
   - `anon` `public` key (becomes `NEXT_PUBLIC_SUPABASE_ANON_KEY` for
     staging)
   - `service_role` `secret` key (becomes `SUPABASE_SERVICE_ROLE_KEY` for
     staging — never commit this)
6. Capture the **project-ref** from `Settings → General` (also visible as
   the 20-character ID in the project URL: `https://<ref>.supabase.co`)

## Step 2 — Apply migrations to the staging DB

The staging project starts with an empty database. Apply all existing
migrations in `supabase/migrations/` (currently 27 files) to bring its
schema in line with production.

```bash
# One-time install if not already present
brew install supabase/tap/supabase

# Link to the staging project
supabase link --project-ref <staging-project-ref>

# Apply every migration in supabase/migrations/ in timestamp order
supabase db push
```

The CLI records each applied migration in
`supabase_migrations.schema_migrations`, so re-running `db push` is a no-op
unless new migrations have been added. Migration files must remain
immutable once applied — only ever add new ones.

## Step 3 — Configure Vercel for the staging branch

In the Vercel dashboard for the existing project:

1. **Settings → Environment Variables**
   - For each of `NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: add a
     new value scoped to **Preview** environment, restricted to the
     `staging` branch, with the staging Supabase credentials.
   - Leave the existing **Production** values alone — those continue to
     point at prod.
2. **Settings → Domains**
   - Add a stable alias such as `staging-rapid-rollout.vercel.app` and
     assign it to the `staging` branch (Vercel calls this a Branch Domain).
3. **Settings → Git**
   - Confirm Production Branch is `main`. Do not change.

Resulting environment matrix:

| Vercel environment | Supabase target | Branch trigger | Stable URL |
| --- | --- | --- | --- |
| Production | prod Supabase | `main` only | production domain |
| Preview (staging) | staging Supabase | `staging` (filter) | `staging-rapid-rollout.vercel.app` |
| Preview (other) | staging Supabase | all other branches | per-deploy URL |

All non-`main` branches reuse staging Supabase by default. That keeps PR
preview deployments useful (real DB) without polluting prod.

## Step 4 — Create the `staging` branch

```bash
git checkout main
git pull
git checkout -b staging
git push -u origin staging
```

This first push triggers the initial staging deployment.

## Step 5 — Update Supabase auth redirect allowlists

Supabase blocks any auth redirect to a URL not in its allowlist. Each
project has its own allowlist.

In the **staging Supabase project** → `Authentication → URL Configuration`:

- **Site URL:** `https://staging-rapid-rollout.vercel.app`
- **Redirect URLs:**
  - `https://staging-rapid-rollout.vercel.app/**`
  - `http://localhost:3000/**` (only needed if local dev points at staging
    Supabase)

In the **production Supabase project**, confirm the production URL is
already allowlisted; do not add staging URLs there.

## Step 6 — Add helper scripts to `package.json`

Add explicit, environment-targeted scripts so a `db push` is never
ambiguous about which project it is hitting.

```json
"scripts": {
  "db:link:staging": "supabase link --project-ref <STAGING_REF>",
  "db:link:prod":    "supabase link --project-ref <PROD_REF>",
  "db:push:staging": "npm run db:link:staging && supabase db push",
  "db:push:prod":    "npm run db:link:prod && supabase db push",
  "db:diff":         "supabase db diff"
}
```

The link-then-push composition makes it explicit in the script name which
project is being touched. Removes any "wait, which DB am I about to
migrate?" ambiguity.

## Step 7 — End-to-end smoke test

Before trusting the pipeline with real changes, run a deliberate trial.

1. On `staging` branch, add a tiny visible change (e.g. a `console.log` in
   `app/page.tsx`).
2. Commit and push to `staging`.
3. Confirm the change appears at `staging-rapid-rollout.vercel.app`.
4. **Critical:** sign up a fake user on the staging URL. Confirm the user
   appears in the **staging** project's `auth.users` table and **NOT** in
   prod's. This proves environment isolation.
5. Open a PR `staging → main`, merge, confirm the change appears on the
   production URL.
6. Revert the test change with another commit through the same flow.

The single most expensive failure mode in any staging setup is staging that
appears to work but silently hits prod data. The fake-user check is the
cheapest way to rule that out before it bites you.

## Daily workflow after setup

```
LOCAL DEV                      .env.local → staging Supabase (default)
   │                           npm run dev → http://localhost:3000
   │ git push origin feature/foo
   ▼
PR INTO staging                Vercel preview URL spins up
   │                           Uses staging Supabase
   │ merge to staging
   ▼
STAGING                        If migration: npm run db:push:staging
   │                           https://staging-rapid-rollout.vercel.app
   │                           Smoke test here. This is the gate.
   │ PR: staging → main, merge
   ▼
PRODUCTION                     If migration: npm run db:push:prod
                               Real users see the change
```

The hard rule that makes this work: **migrations are applied to the
target environment's DB *before* merging the PR that depends on them.**
This is just the existing rule from `deploy-and-migrations.md`, applied to
two environments instead of one.

## Optional: Supabase Branching

Supabase Branching automatically spins up an ephemeral DB branch per git
branch. It is slick but:

- Requires Supabase Pro plan
- Still maturing
- Adds complexity that a solo project does not yet need

For now, two static projects (Staging + Production) is the right call.
Revisit Branching when multiple developers open overlapping
schema-changing PRs.

## What this doc does not cover

- Seeding staging with realistic-but-anonymized data from production.
  That is a separate workflow involving `pg_dump`, careful PII scrubbing,
  and access controls — to be documented if/when needed.
- CI/CD automation of `supabase db push` on merge. Currently manual by
  design, matching the existing discipline in `deploy-and-migrations.md`.
- Rollback procedures. If staging surfaces a bad change, the procedure is
  the same as today: revert the merge commit and fast-forward the
  affected branches. No additional staging-specific rollback is needed.

## Cross-references

- [`deploy-and-migrations.md`](./deploy-and-migrations.md) — schema-PR
  promotion discipline; the rules in there apply unchanged, just now to
  two target environments instead of one.
- [`AGENTS.md`](../AGENTS.md) — project-wide instructions, including the
  pull/merge caveat for schema PRs.
