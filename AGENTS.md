<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Branch workflow

Two Vercel environments: **staging** (deploys from the `staging` branch) and **production** (deploys from `main`). All PRs target `staging` by default — never main directly. Promote staging → main with a separate PR only after Austin verifies the Vercel staging deploy.

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
