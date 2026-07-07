<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Branch workflow

Two Vercel environments: **staging** (deploys from the `staging` branch) and **production** (deploys from `main`). All PRs target `staging` by default — never main directly. Promote staging → main with a separate PR only after Austin verifies the Vercel staging deploy.

## Promote routine (staging → main)

Promotion PRs squash-merge into `main`, which creates a commit on `main` that
`staging` does not have. Left unreconciled, `staging` and `main` diverge and the
next promotion PR shows phantom merge conflicts (same content, different squash
history). To prevent this, **immediately after a promotion PR merges into
`main`, back-merge `main` into `staging`:**

```
git fetch origin main staging
git checkout staging && git reset --hard origin/staging
# staging already contains all of main's content, so keep staging's tree:
git merge -s ours origin/main -m "Merge main into staging after promotion (reconcile squash divergence)"
git push origin staging
```

Before using `-s ours`, verify `staging` is a content superset of `main` with
`git diff --name-only origin/main origin/staging` — it should list only the
files from the just-promoted change. If it lists anything `main` has that
`staging` lacks, STOP and reconcile manually instead (do not discard main's
work).

# Pull/merge caveat

Claude may pull and merge PRs autonomously (the relevant `git pull`, `gh pr merge`, and `git branch -d` commands are pre-approved in `.claude/settings.local.json`).

**However, if a PR contains schema/migration changes, Claude MUST pause and confirm with the user before merging, even if the command is pre-approved.** This includes:

- New tables, dropped tables, or renamed tables
- New/dropped/renamed columns, or type changes
- RLS policy changes
- Any file matching `supabase/migrations/*.sql`
- Changes to `src/types/database.ts` that reflect the above

Rationale: schema changes can break production data or require coordinated deploys. A 10-second "safe to merge?" check is cheap; a bad merge is not.

Procedure: before calling `gh pr merge`, run `gh pr diff <n> --name-only` and scan for the patterns above. If any match, surface the files to the user and wait for explicit go-ahead.
