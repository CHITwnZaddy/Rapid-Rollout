# Rapid Rollout Constitution

Rapid Rollout is the proposal scoping and pricing tool for TUC Solution Engineers. It replaces a legacy Excel workbook with a web app that must never miscalculate a customer price. The principles below govern how we build and change it.

## Core Principles

### I. Pricing Correctness Is Non-Negotiable

All revenue-bearing math — scenario totals, migration totals, scoped services totals, bid-sheet credit and discount — lives in pure functions under `src/lib/calculations/`. It is fully covered by vitest and must stay that way.

- No pricing math in React components, server actions, or SQL.
- Proposal Summary, Bid Sheet, and any report that aggregates a proposal MUST produce identical totals for the same inputs. Disagreement is a bug, not a rounding quirk.
- The canonical bid-sheet formula is: `final = max(0, subtotal - credit) * (1 - discount_pct / 100)`. Credit before discount. Never swap the order.
- Changes to `src/lib/calculations/` require a passing `npm run test` and a paired update to `docs/pricing-rules.md` if behavior changes.

### II. Fail Closed On Missing Data

The app must never invent a price.

- Rate cards and service-hours tables MUST hydrate from Supabase before any pricing UI renders. Missing rows → visible error card, never a hardcoded default.
- Migration pricing requires specific rate rows (`Master|Sr. Implementation Manager`, `Master|Program Manager`, `Master|Travel Cost/Trip`). If any are missing, surface an error instead of returning `0`.
- Zod validates every user input at the server-action boundary before it touches Supabase. Invalid input is rejected with a structured error, not coerced.

### III. Supabase Is The Source Of Truth

The database schema, RLS policies, and audit triggers — not the application — define who can do what.

- Schema changes ship as numbered, idempotent SQL files in `supabase/migrations/NNN_*.sql`. Migrations are append-only; never edit a merged migration.
- RLS model: proposals are global-read, owner-write (SEs back each other up). Customers are shared-write. Audit-log rows carry `WITH CHECK (changed_by = auth.uid())` plus triggers.
- Any PR that touches `supabase/migrations/*.sql` or `src/types/database.ts` pauses for explicit human approval before merge (see `AGENTS.md`).
- Writes go through server actions with Supabase SSR helpers. Client components do not hold service-role keys or write directly to privileged tables.

### IV. Server Actions For All Writes

Every mutation — proposal create, scenario save, migration edit, bid-sheet adjustment, admin table update — flows through a Next.js server action in `src/app/(app)/.../actions.ts`, validated by Zod, and covered by an `actions.test.ts` suite.

- No client-side Supabase writes for privileged data.
- Server actions return structured results parsed by `parseSupabaseResult`, never raw Supabase errors.
- Route groups `(app)` vs `(auth)` enforce the authentication boundary; `middleware.ts` is the edge-level gate.

### V. Test Before You Ship

- `npm run test` must pass before every push. CI runs the full vitest suite.
- Calculation engines, server actions, and shared utilities have unit tests. New math → new tests in `__tests__/`.
- Lifecycle, transition, and bootstrap logic (`proposals/lifecycle.test.ts`, atomic status transitions) are first-class tests, not afterthoughts.

## Technology Constraints

- **Framework**: Next.js 16.2.3 with App Router, Turbopack, React Server Components. This is NOT the Next.js in your training data — read `node_modules/next/dist/docs/` before framework-level changes. Heed every deprecation notice.
- **Runtime**: React 19.2, TypeScript 5, Node 20.
- **Data**: Supabase (Postgres + RLS + Auth) via `@supabase/ssr`. TanStack Query for client caching.
- **UI**: shadcn/ui on Tailwind v4, Base UI primitives, Lucide icons, Sonner toasts.
- **Validation**: Zod 4 at every form boundary.
- **Exports**: `exceljs` for styled `.xlsx` output, dynamic-imported to stay off the initial JS bundle. `@react-pdf/renderer` for PDFs. `xlsx` is dev-only for reading seed workbooks.
- **Tests**: Vitest 4 with Testing Library.
- **Never add `force-dynamic`** to a page that can use `revalidate`.

## Development Workflow

1. **Branch** from `main` with a scope-prefixed name (`feat/…`, `fix/…`, `refactor/…`, `docs/…`, `chore/…`).
2. **Spec first** for non-trivial features: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`.
3. **Code**: keep math in engines, validate at boundaries, write to Supabase only via server actions.
4. **Test**: `npm run test` + `npm run lint` pass locally before push.
5. **PR**: open against `main`. Schema/migration changes get an explicit "safe to merge?" checkpoint with the maintainer before `gh pr merge`.
6. **Docs**: update `docs/pricing-rules.md`, `docs/write-path-audit.md`, or `docs/deploy-and-migrations.md` whenever the behavior they describe changes.

## Governance

This constitution supersedes ad-hoc habits. When a PR, AI-generated diff, or refactor conflicts with a principle above, the principle wins — the PR changes, or the constitution is amended first.

Amendments require a PR that edits this file, a one-line entry in the commit message explaining the change, and a bump to the version line below. Principles I–III (Pricing Correctness, Fail Closed, Supabase Source of Truth) are considered load-bearing; amending them requires an explicit call-out in the PR description.

`AGENTS.md` remains the runtime guide for AI agents working in this repo, including the pull/merge caveat for schema changes.

**Version**: 1.0.0 | **Ratified**: 2026-04-24 | **Last Amended**: 2026-04-24
# [PROJECT_NAME] Constitution
<!-- Example: Spec Constitution, TaskFlow Constitution, etc. -->

## Core Principles

### [PRINCIPLE_1_NAME]
<!-- Example: I. Library-First -->
[PRINCIPLE_1_DESCRIPTION]
<!-- Example: Every feature starts as a standalone library; Libraries must be self-contained, independently testable, documented; Clear purpose required - no organizational-only libraries -->

### [PRINCIPLE_2_NAME]
<!-- Example: II. CLI Interface -->
[PRINCIPLE_2_DESCRIPTION]
<!-- Example: Every library exposes functionality via CLI; Text in/out protocol: stdin/args → stdout, errors → stderr; Support JSON + human-readable formats -->

### [PRINCIPLE_3_NAME]
<!-- Example: III. Test-First (NON-NEGOTIABLE) -->
[PRINCIPLE_3_DESCRIPTION]
<!-- Example: TDD mandatory: Tests written → User approved → Tests fail → Then implement; Red-Green-Refactor cycle strictly enforced -->

### [PRINCIPLE_4_NAME]
<!-- Example: IV. Integration Testing -->
[PRINCIPLE_4_DESCRIPTION]
<!-- Example: Focus areas requiring integration tests: New library contract tests, Contract changes, Inter-service communication, Shared schemas -->

### [PRINCIPLE_5_NAME]
<!-- Example: V. Observability, VI. Versioning & Breaking Changes, VII. Simplicity -->
[PRINCIPLE_5_DESCRIPTION]
<!-- Example: Text I/O ensures debuggability; Structured logging required; Or: MAJOR.MINOR.BUILD format; Or: Start simple, YAGNI principles -->

## [SECTION_2_NAME]
<!-- Example: Additional Constraints, Security Requirements, Performance Standards, etc. -->

[SECTION_2_CONTENT]
<!-- Example: Technology stack requirements, compliance standards, deployment policies, etc. -->

## [SECTION_3_NAME]
<!-- Example: Development Workflow, Review Process, Quality Gates, etc. -->

[SECTION_3_CONTENT]
<!-- Example: Code review requirements, testing gates, deployment approval process, etc. -->

## Governance
<!-- Example: Constitution supersedes all other practices; Amendments require documentation, approval, migration plan -->

[GOVERNANCE_RULES]
<!-- Example: All PRs/reviews must verify compliance; Complexity must be justified; Use [GUIDANCE_FILE] for runtime development guidance -->

**Version**: [CONSTITUTION_VERSION] | **Ratified**: [RATIFICATION_DATE] | **Last Amended**: [LAST_AMENDED_DATE]
<!-- Example: Version: 2.1.1 | Ratified: 2025-06-13 | Last Amended: 2025-07-16 -->
