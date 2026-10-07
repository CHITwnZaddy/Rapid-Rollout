# Rapid Rollout: Director-Level Code Review and Security Action Plan

**Date:** 2026-10-07
**Reviewed commit:** `a6feb24` on `main` (Promote: self-service password reset, PR #144)
**Reviewer lens:** Software Engineering Director preparing a defense of the project for an IT security review
**Meeting:** in 4 weeks (target: 2026-11-04)
**Decision being defended:** Austin keeps ownership of Rapid Rollout

How to use this file: each finding has a status box. Tick it when done and add a one-line note with the evidence (PR number, screenshot, dashboard setting). The "Unverified" section lists what still needs eyes on it. Edit freely; this is a working document, not a report.

Status legend: `[ ]` open, `[x]` done, `[-]` accepted risk (write why)

---

## 1. Verdict

The architecture is defensible and I would defend it. For a solo-built internal tool it is in the top tier. An IT security audience will not win on design. They will win on patch currency, dependency hygiene, bus factor, and monitoring. Three of those four are fixable before the meeting.

The strongest argument is the baseline IT already accepted: the Excel workbook had no access control, no audit trail, no backups, and pricing formulas anyone could edit. Rapid Rollout is the security control that replaced it.

---

## 2. Evidence gathered (verified, not read from docs)

| Check | Result | How verified |
| --- | --- | --- |
| TypeScript typecheck | clean | `npx tsc --noEmit` after fresh `npm ci` |
| ESLint | clean | `npx eslint` |
| Unit tests | 487 passing, 8 todo, 66 files | `npx vitest run --coverage` |
| Line coverage | 85.2% lines, 69.2% branches, 91.5% functions | same run |
| `any` / `@ts-ignore` / TODO in `src/` | 0 / 0 / 0 | grep |
| CI history | 165 runs, latest green, 4 independent jobs | GitHub Actions API |
| Branch protection | `main` protected, `staging` not | GitHub API |
| Open PRs / open issues | 0 / 1 (issue #62, DB-layer test harness) | GitHub API |
| staging vs main | 10 commits ahead in history, 0 files differ | `git diff --name-only origin/main origin/staging` |
| Supabase security advisor, production | 0 findings | Supabase API, 2026-10-07 |
| Supabase security advisor, staging | 0 findings | Supabase API, 2026-10-07 |
| Supabase performance advisor, production | INFO only: 2 unindexed FKs, 6 unused indexes | Supabase API |
| Production database | Postgres 17.6, us-east-1, ACTIVE_HEALTHY, created 2026-04-11 | Supabase API |
| `npm audit --omit=dev` | 30 findings: 2 critical, 19 high, 7 moderate, 2 low | npm |
| Authorship | 1 author, 108 commits; AI co-authorship trailers (Claude, Cursor) | `git shortlog` |
| Commit cadence | May 3, June 98, July 6, Sept 1 | `git log` |
| Code volume | ~25k lines TS/TSX in `src/`, 4.3k lines SQL, 38 migrations | `wc` |
| Users | 5 (per Austin); Excel workbook retired at launch | Austin |

---

## 3. Findings

Severity: **P0** fix before the meeting, **P1** fix before the meeting if at all possible, **P2** commit to a date, **P3** nice to have.

### 3.1 Security and patching

- [ ] **S-01 (P0) Next.js 16.2.3 carries 25 published advisories, including 3 critical RCEs.**
  Evidence: `npm audit` lists GHSA-p293-qw3h-jr36 (RCE, Windows hosts), GHSA-2xp9-vwfh-vxw4 (RCE via AVIF in Image Optimization), GHSA-vcvr-r3jv-pc5j (RCE in `next/og`), plus proxy/middleware bypasses, SSRF in Server Actions, and DoS. Fix version: **16.4.0** (minor, non-breaking).
  Context for the room: Vercel Linux hosting removes the Windows RCE; the app does not use `next/og`; the proxy-bypass advisories matter because `src/proxy.ts` is the auth gate. The answer must be "patched," not "mitigated by context."
  Fix: bump `next` and `eslint-config-next` to 16.4.0, run all gates, smoke on staging, promote.

- [ ] **S-02 (P0) `shadcn` CLI shipped as a production dependency.**
  Evidence: `package.json` `dependencies.shadcn: ^4.2.0`, zero imports in `src/`. It pulls in `@modelcontextprotocol/sdk`, `hono`, `ts-morph`, `fast-glob`, which account for most of the 19 high findings.
  Fix: move to `devDependencies` or remove entirely (the generated components are already in `src/components/ui`). Re-run `npm audit --omit=dev`; target is zero high/critical.

- [ ] **S-03 (P1) No automated dependency updates or audit gate.**
  Evidence: no `.github/dependabot.yml`, no `renovate.json`, CI has no `npm audit` step.
  Fix: add Dependabot (weekly, grouped minor/patch) and a CI job `npm audit --omit=dev --audit-level=high`. This turns patching into a policy you can point at.

- [ ] **S-04 (P1) No MFA.**
  Evidence: no TOTP/MFA code in `src/`; Supabase Auth email+password only.
  Fix: enable TOTP MFA in Supabase Auth; add enrollment page, challenge step after login, and an assurance-level check in the proxy. Five users, one enrollment meeting. Budget 3 days.

- [ ] **S-05 (P1) Supabase Auth dashboard settings to confirm.**
  App enforces min password length 8 (`src/lib/validation/auth.ts`). Confirm the dashboard minimum matches. Turn on leaked-password protection. Review JWT expiry and refresh-token rotation.

- [ ] **S-06 (P2) CSP is report-only and allows `unsafe-inline` scripts.**
  Evidence: `next.config.ts` sets `Content-Security-Policy-Report-Only`. Other headers (X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy) are enforced.
  Fix: review collected violations; if clean, enforce with the Next.js nonce pattern. If not clean by the meeting, list as a known item with a date.

- [ ] **S-07 (P2) Run GitHub secret scanning and keep the clean result as evidence.**
  `.gitignore` excludes `.env*`; no secrets found by eye. A scan result is a better artifact than "I looked."

- [ ] **S-08 (P2) Invites and password resets ride Supabase's built-in email sender.**
  Shared hourly cap across the project. Fine for 5 users; document it as an accepted risk or move to a custom SMTP provider.

- [ ] **S-09 (P3) Unindexed foreign keys flagged by the performance advisor.**
  `proposal_stale_thresholds.updated_by`, `proposals.closed_financials_corrected_by`. Also 6 unused indexes (one, `idx_service_hours_lookup`, was already deferred pending a usage window). Low priority; tidy in a schema PR.

### 3.2 Operations and continuity

- [ ] **O-01 (P0) Confirm Supabase plan tier and backups.**
  The Free tier has no automatic backups. If production is not on Pro with daily backups (or PITR), fix this week. Then do one restore into staging and record how long it took. **This is the single most likely question that sinks a security review.** Could not verify from the connector; check Settings → Billing and Database → Backups.

- [ ] **O-02 (P1) No error tracking, uptime monitoring, or alerting.**
  Evidence: no Sentry/analytics/log-drain references in `src/` or `package.json`. Error boundaries print a reference code to console; an SE reads it to Austin.
  Fix: Sentry free tier (attach the existing reference code as a tag), plus an uptime monitor on `/login` that alerts a phone.

- [ ] **O-03 (P1) Write `docs/RUNBOOK.md`.**
  Deploy, roll back (Vercel instant rollback), apply a migration, rotate the service-role key, add/remove a user, restore the database, who to call. This is the bus-factor answer.

- [ ] **O-04 (P1) Give IT a seat.**
  Invite one IT person as an admin user in the app, give read access to the GitHub repo, add as read-only member of the Supabase org. "You do not have to own it, but you can see all of it."

- [ ] **O-05 (P2) Access review document.**
  The five users and their roles, offboarding steps (the `deleteUser` action exists), key rotation procedure.

- [ ] **O-06 (P2) Schema migrations are applied by hand.**
  Mitigated by the CI drift check and the documented promotion routine. Keep as an accepted risk with the mitigation stated.

- [ ] **O-07 (P3) Protect the `staging` branch.**
  `main` is protected; `staging` is not. Low risk with one committer, but trivial to fix and reads well.

### 3.3 Testing

- [ ] **T-01 (P1) The security boundary has no automated tests.**
  Evidence: unit tests mock Supabase. RLS policies, RPCs (`create_proposal_bundle`, `transition_proposal_status`, `save_scenario_grid`), and triggers are verified only by manual smoke tests and the advisor scan. Issue #62 and 8 `it.todo` placeholders in `lifecycle-states.test.ts` and `changelog.test.ts`.
  Fix: a vitest suite that runs in CI against a disposable Supabase branch or local instance. Sign in as two ordinary users and one admin; assert A cannot modify B's proposal, cannot write `rate_cards`, cannot forge a `change_log` row, and that anon gets nothing. This converts "we have RLS" into "we test RLS on every PR."

- [ ] **T-02 (P3) No end-to-end browser tests.**
  Acceptable at this size. Note it in the risk register rather than build it before the meeting.

### 3.4 Code and documentation hygiene

- [ ] **H-01 (P1) Three unused production dependencies.**
  `@react-pdf/renderer`, `@tanstack/react-table`, `recharts`: zero imports in `src/`. Remove.

- [ ] **H-02 (P2) README claims TanStack Query; it is not installed.**
  Also `docs/pricing-rules.md` and `docs/write-path-audit.md` contain absolute local-machine paths. Fix the README line; relativize the paths.

- [ ] **H-03 (P2) Constitution says Node 20; CI runs Node 22; no `engines` field.**
  Add `"engines": { "node": ">=22" }` and correct `.specify/memory/constitution.md`.

- [ ] **H-04 (P3) Hybrid rendering model.**
  Bid-sheet and scoped-services pages are client components reading Supabase from the browser (reads only, RLS-protected). Migration page keeps a client-side save queue. All writes go through server actions. Safe, but say "all writes" in the meeting, not "everything."

- [ ] **H-05 (P3) `force-dynamic` on the dashboard and several admin pages.**
  Contradicts the README rule, but justified (per-user data). Document the exception or drop the rule.

---

## 4. Verified strengths (the defense material)

Use these in the meeting. Every one was checked in code or by API, not taken from the docs.

**Authorization is layered.**
- RLS enabled on every table; Supabase security advisor reports zero findings on production and staging.
- The admin check is one audited function, `public.auth_is_admin()`, used by 28 policies (migration `20260706191500`).
- SECURITY DEFINER functions had REST `EXECUTE` revoked from `anon`/`authenticated` (migration `20260629184500`).
- Every server action re-verifies the caller inside the action (`assertAuthenticated`, `assertAdmin`, `assertManagerOrAdmin` in `src/lib/auth/require-admin.ts`). Route-level gates are UI only, and the code says so.
- Role lives in `app_metadata`, which only the service-role key can write; a compromised session cannot self-promote.
- Service-role key is used in exactly two server-only files (`admin/users/actions.ts`, `lib/settings/sales-ops.ts`).

**Data integrity is enforced in the database.**
- Proposal creation and status transitions are atomic Postgres RPCs; no half-created proposals, no status/history drift.
- Audit log cannot be forged: a BEFORE INSERT trigger stamps `changed_by` from `auth.uid()` and the policy checks it (migration 006).
- Pricing fails closed: a missing or non-positive rate card produces a visible error, never a $0 price (`MissingRateError`, `load-guards.ts`, PR #132).

**Input and output are validated.**
- Zod at every server-action boundary and on every Supabase response (`safeParseSupabaseResult`); zero `as` casts on DB reads after PRs #139 and #141.
- Password reset is enumeration-safe and never leaks the provider rate limit.
- Signup is invite-only; invites and recovery links survive corporate email link scanners (POST-based verification).

**Pricing math is isolated and tested.**
- All revenue math in pure functions under `src/lib/calculations/` with Excel-parity tests.
- Summary, bid sheet, and reports consume the same helpers; the Excel workbook could never guarantee that.

**Process is more mature than the team size.**
- Separate staging and production Supabase projects and Vercel environments; documented promotion routine with squash-divergence reconciliation.
- Protected `main`; CI with typecheck, lint, tests with coverage, build, and migration drift check; 165 runs.
- 38 ordered migrations; schema changes gated behind explicit human approval.
- Software design document, 24-page PRD, pricing-rules contract, write-path audit, project constitution.

**Security headers already enforced:** X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy (camera/mic/geo off).

---

## 5. Unverified (needs eyes before the meeting)

- [ ] **Vercel: production deploy state, domain, HSTS, env-var scoping, firewall config, runtime errors.**
  Status 2026-10-07: every Vercel API call returns `403` with `scope "constructing-connections"`. The Claude Vercel connector's token is authorized for a different account/team than the one that owns project `rapid-rollout` (`prj_mW5F1a9pjyJlvzGstZFkBAG0JO1b`, team `team_iPM0hJnFAT7VA6ENcelpNWSx`).
  Fix: disconnect and reconnect the Vercel connector at https://claude.ai/customize/connectors; on Vercel's consent screen choose the **constructing-connections** team scope (not the personal account); then start a new Claude session.
  Fallback if the connector keeps failing: screenshots of (a) Deployments filtered to Production, (b) Settings → Environment Variables showing names and environment scope only, and (c) the production URL so HSTS can be checked with `curl -sI`.
- [ ] **Supabase: billing tier and backup configuration** (see O-01). Not exposed through the connector.
- [ ] **Supabase Auth settings** (see S-05). Dashboard only.
- [ ] **Vercel HSTS on the production domain.** Vercel sets `Strict-Transport-Security` on `*.vercel.app` by default; confirm on the custom domain if there is one. Direct probe from the review container timed out (network policy).

---

## 6. Four-week plan

| Week | Track | Items | Done when |
| --- | --- | --- | --- |
| 1 | Patch and hygiene | S-01, S-02, S-03, H-01, H-02, H-03, S-07, **O-01** | `npm audit --omit=dev` zero high/critical; Dependabot PR appears; backups confirmed and one restore timed |
| 2 | Evidence | T-01, S-04 (start), S-05, O-05 | RLS test suite green in CI; MFA enrolled for all 5 users or scheduled with a date |
| 3 | Operate like a product | O-02, O-03, O-04, S-06 (decide), O-07 | Sentry receiving errors; uptime alert fires on a test; runbook merged; IT seat granted |
| 4 | Meeting package | Section 7 below | One-page brief, risk register, 5-minute demo rehearsed |

Branch workflow: every item lands as a PR to `staging`, Austin verifies the Vercel staging deploy, then promote `staging → main` and back-merge per `AGENTS.md`. Schema items (S-09, parts of T-01) pause for the schema-change checkpoint.

---

## 7. Meeting package (week 4)

- [ ] **One-page architecture and security brief for an IT reader.** Trust-boundary diagram; controls table; one evidence link or screenshot per row (advisor zero-findings, CI green, RLS test output, audit log, test counts, backup restore timing).
- [ ] **Residual-risk register.** No SSO; single maintainer; manual migration application; shared email sender; report-only CSP (if not enforced). Each with its mitigation. A review that finds no acknowledged risks assumes you hid them.
- [ ] **Five-minute live demo.** Run the RLS tests, open the Supabase advisor dashboard, show the change log for a customer edit.
- [ ] **Rehearsed answers.**
  - *Who patches it?* Dependabot plus the CI audit gate, with 165 CI runs showing the pipeline is real.
  - *What if Austin leaves?* Runbook, design docs, IT's own seat, and a stack (Next.js + Postgres) any contractor knows.
  - *Is AI-written code safe?* Every change passes typecheck, lint, 487 tests, CI, staging verification, and Austin's review. The process is the control, not the author.
  - *Why not go back to Excel?* Excel is the risk this replaced: no access control, no audit, formulas anyone could break.
  - *Where is the data?* Supabase Postgres 17, us-east-1, RLS on every table, encrypted in transit and at rest, daily backups (once O-01 is confirmed).

---

## 8. Open questions for Austin

1. Which Supabase plan is production on, and what does Database → Backups show?
2. Is there a custom production domain, or is it a `*.vercel.app` URL?
3. Who in IT would you trust with the read-only seat (O-04)?
4. Is MFA before the meeting realistic alongside coursework, or should it be a committed date instead?

---

## 9. Change log for this document

| Date | Change |
| --- | --- |
| 2026-10-07 | Initial review. Vercel checks blocked by connector scope; Supabase checks complete. |
