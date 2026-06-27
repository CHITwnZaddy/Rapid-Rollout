# Rapid Rollout Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax. Write the test first where it applies. Follow the same branch workflow as the 06-19 plan: commit each ticket directly onto `staging`, push, let Austin verify the Vercel staging deploy, then promote `staging → main` via a separate PR (CI-gated, auto-merge). Pause before any schema/migration change.

**Goal:** Land the maintainability / cleanup / UX items left over from the 2026-06-19 multi-pass review after all P0/P1 correctness work shipped. None of these change pricing correctness; they reduce duplication, dead code, and confusion, plus two deferred items (the `proposal-subtotal` migration dedup and the `window.confirm → AlertDialog` UX).

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Postgres/Auth/RLS, Zod, Vitest (Node env), shadcn/ui, Tailwind v4, ExcelJS dynamic imports.

---

## Context

- Continuation of `2026-06-19-rapid-rollout-correctness-fixes.md` (Tickets 1–6 + 3b, all shipped). That plan's **"Deferred / not done"** section named two items (Tickets 4 and 5 below); the rest are P2/P3 items from the review's action plan + Top-10 refactor candidates that were never ticketed.
- Investigated 2026-06-26 against current production code (`staging` @ `c65a80a`). Every item below was **confirmed still present**. Risk ratings are calibrated against the actual code, not the original review's guesses.
- **Two review items were re-rated and one was dropped on investigation** (see each ticket): the local `roundMoney` de-dup is a subtle *behavior* change; `window.confirm → AlertDialog` is Medium; the discount/LoE "rename" is a schema migration if taken literally (skipped — code-layer clarification only).

## Completion status — ALL SHIPPED ✅ (2026-06-27)

All 11 tickets are merged to `main` (production). Final state: `main` @ `1ba3ae4`, `staging` content-even (0 drift), **436 tests passing**, tsc + ESLint clean throughout. Each ticket went `staging` → Vercel staging verify → promotion PR (CI-gated, auto-merged).

| # | Ticket | Staging commit | Promotion PR | On-implementation note |
| --- | --- | --- | --- | --- |
| — | Plan doc | `db93e82` | [#112](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/112) | — |
| 1 | Dead `salesPrice` + `RevenueReportBaseRow` order | `11ae2d3` | [#112](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/112) | `numberOrZero`→`NUM` **dropped** — they differ on `±Infinity`; the finite guard is safer |
| 7 | Centralize `formatMarginPercent` | `8f0b6be` | [#112](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/112) | added a `digits` param to preserve each site's precision (2dp vs 1dp) |
| 8 | `scenario-breakout` pure builder + browser download | `28ec718` | [#112](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/112) | builder now unit-testable without jsdom |
| 6 | Extract `withBidSheetMutation` | `2ff6bf5` | [#113](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/113) | the 4 updaters live in `bid-sheet/actions.ts` (not `proposals/[id]/actions.ts`), so the helper is bid-sheet-specific; file split left optional |
| 4 | `computeProposalMigrationTotal` dedup | `65b7b79` | [#114](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/114) | shared helper consumed by the summary page + `fetchProposalSubtotal` |
| 5 | `window.confirm` → `AlertDialog` | `b80b4bf` | [#115](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/115) | confirm submits the external form by `id`; component API preserved |
| 11 | Document `use-migration-config` ref pattern | `55dae3b` | [#116](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/116) | comment-only; no rewrite |
| 9 | Credit vs legacy `discount_dollars` naming | `76fe360` | [#116](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/116) | code-layer only; DB column rename remains out of scope |
| 2 | `roundMoney` de-dup → canonical | `27704e0` | [#117](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/117) | small *more-correct* behavior change (EPSILON + finite guard); already covered by `rounding.test.ts` |
| 3 | Remove dead `'user'` branch in `getPageUser` | `6a21f30` | [#118](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/118) | verify-first confirmed the branch is unreachable (private fn; both callers reject non-admin/manager) |
| 10 | Dashboard migration map inside try/catch | `6074e14` | [#119](https://github.com/CHITwnZaddy/Rapid-Rollout/pull/119) | **descoped** from `throw → Result`: that conversion would worsen the 3 `useReportState.run`-wrapped callers (they catch throws by design). Fixed the real gap instead — the dashboard computed the map *outside* its try. See memory `project_report_aggregates_throw_convention`. |

**Also this session:** the bid-sheet credit/discount order was questioned during Ticket 6 verification and **confirmed correct** (dollars/credit first, then percent — matches `bid-sheet-pricing.ts` + `pricing-rules.md`); no code change.

> The forward-plan sections below are retained as the historical record of what was planned and why; the table above is the source of truth for what shipped.

## Suggested batching & order

| Ticket | What | Pri | Risk | Schema | Rec |
| --- | --- | --- | --- | --- | --- |
| **1** | Low-risk cleanup batch (dead `salesPrice`, `RevenueReportBaseRow` order) | P2 | Low | No | do |
| **2** | De-dup local `roundMoney` → canonical (⚠ EPSILON behavior nuance) | P3 | Med | No | careful |
| **3** | Remove dead `'user'` branch in `getPageUser` (verify-first) | P3 | Low | No | do after verify |
| **4** | `proposal-subtotal` migration recompute → shared helper *(deferred item)* | P2 | Med | No | do (careful) |
| **5** | `window.confirm` → shadcn `AlertDialog` in `ConfirmSubmitButton` *(deferred UX)* | P2 | Med | No | do (careful) |
| **6** | Extract `withProposalMutation` (+ optional file split) | P2 | Low | No | do |
| **7** | Centralize `formatMarginPercent` null formatting | P2 | Low | No | do |
| **8** | Split `scenario-breakout` into pure builder + browser download | P2 | Low | No | do |
| **9** | Clarify discount-vs-LoE-credit **code naming** (no DB rename) | P3 | Low | No | do |
| **10** | `proposal-aggregates.requireMigrationRates` throw → Result | P3 | Med | No | careful |
| **11** | Document `use-migration-config` ref pattern (don't rewrite) | P3 | Low | No | doc-only |

Recommended order: **1 → 7 → 8 → 6 → 4 → 5**, then the P3s (2, 3, 9, 10, 11) as appetite allows. Tickets 1/7/8 are zero-behavior-change quick wins; 4 and 5 are the two you already earmarked.

---

## Ticket 1: Low-risk cleanup batch (one PR)

Three behavior-preserving cleanups; bundle into a single PR.

**Files:** `src/lib/calculations/migration-engine.ts`, `src/lib/calculations/proposal-pricing.ts`, `src/lib/reports/data.ts`.

**Steps:**
- [ ] **Remove dead `salesPrice`** — `migration-engine.ts:222` (type member), `:346` (assignment), `:394` (returned). Confirmed **zero** consumers read `.salesPrice` repo-wide. Drop all three; run `engine`/migration tests.
- [ ] **Reorder `RevenueReportBaseRow`** — `reports/data.ts` type (~97-103) lists `…p3_cost, opt3_cost, opt1_cost, opt2_cost`; the SELECT (~283) is `…opt1_cost, opt2_cost, opt3_cost`. Named access only, so harmless — reorder the type to match for clarity.

**Investigated, intentionally NOT done — `numberOrZero` → `NUM`.** They are **not** equivalent: `NUM` is `Number(v) || 0` (passes `±Infinity` through), while `numberOrZero` is `Number.isFinite`-guarded (zeroes `Infinity`). The stricter finite guard is the correct posture for pricing math, so `numberOrZero` stays. (DB `NUMERIC` values can't be `Infinity`, so it's only a theoretical difference — but de-duping would *weaken* the guard for no gain.)

**Verify:** `npx vitest run src/lib/calculations src/lib/reports` + `tsc` + `eslint`. No behavior change expected.

---

## Ticket 2: De-dup local `roundMoney` → canonical  ⚠ behavior nuance

**Purpose:** `src/lib/dashboard/sales-ops.ts:58` and `src/app/(app)/dashboard/page.tsx:157` each define a local `roundMoney` that lacks the canonical `rounding.ts` version's `+ Number.EPSILON` nudge. Replacing them removes duplication **and** makes rounding marginally more correct (e.g. `1.005 → 1.01`), so treat it as an intentional, tested behavior change — not a pure refactor.

**Files:** `src/lib/dashboard/sales-ops.ts` (~8 call sites), `src/app/(app)/dashboard/page.tsx` (~2 call sites).

**Steps:**
- [ ] Import `roundMoney` from `@/lib/calculations/rounding`, delete both local copies.
- [ ] **Test-first:** add/adjust a sales-ops test asserting the EPSILON-boundary case (a value like `x.xx5`) now rounds up, documenting the intended change.
- [ ] Run the dashboard/sales-ops tests; eyeball any snapshot/number assertions for the (rare) boundary shift.

**Risk:** Medium — values change only at the half-cent float-dust boundary, but it *is* a numeric change on a money figure, so verify on staging.

---

## Ticket 3: Remove dead `'user'` branch in `getPageUser`  (verify-first)

**Purpose:** `src/lib/auth/page-guards.ts:21` — `getPageUser` returns the role when `isManagerOrAdminRole(role) || role === "user"`. It's private and (per investigation) only used by `requireAdminPage` / `requireManagerOrAdminPage`, both of which subsequently reject anything below manager/admin — so the `|| role === "user"` branch has no behavioral effect.

**Steps:**
- [ ] **Verify first:** confirm `getPageUser` is not exported and that **no** authenticated-only guard (e.g. a `requireAuthenticatedPage`) uses it where a `'user'` role *should* pass. If such a caller exists, **skip** this ticket — the branch is load-bearing.
- [ ] If confirmed dead, simplify to `role: isManagerOrAdminRole(role) ? role : null`.
- [ ] Run the auth/page-guard tests.

**Risk:** Low *if* the verify step holds; this is the one item I'd gate on a quick check because the original review may have mis-flagged it.

---

## Ticket 4: `proposal-subtotal` migration recompute → shared helper  *(deferred)*

**Purpose:** `fetchProposalSubtotal` (`proposal-subtotal.ts:108-169`) and the proposal summary page (`proposals/[id]/page.tsx:206-278`) duplicate the exact live migration recompute (build `EngineMigrationConfig`, section-filter via `toEngineLine`, call `calculateMigrationTotals`, take `.clientPrice`). The same shape recurs in `bid-sheet/page.tsx` and three report modules.

**Files:** new `src/lib/proposals/proposal-migration-compute.ts` (or **extend the existing `src/lib/migration/compute-totals-from-state.ts`** — check it first; reuse if it fits), `proposal-subtotal.ts`, `proposals/[id]/page.tsx`.

**Steps:**
- [ ] First read `compute-totals-from-state.ts` — if it already turns `(config, lines, rates)` into totals, **extend/reuse it** instead of a new file.
- [ ] **Test-first:** unit-test a pure `computeProposalMigrationTotal(config, lines, rates) → { ok, total, totalHours, internalCost } | { ok:false, error }` covering the fail-closed missing-rate path and a known fixture.
- [ ] The helper does **no** Supabase I/O — callers keep their own fetch + fail-closed rate validation, then delegate the math.
- [ ] Rewire `fetchProposalSubtotal` and the summary page to call it; delete the duplicated blocks.
- [ ] Optionally follow up by pointing `bid-sheet/page.tsx` + the report modules at the same helper (separate PR).

**Risk:** Medium — central pricing path on two pages; rely on `excel-parity` / `proposal-pricing-flow` / `revenue-report-consistency` tests to prove no drift, and verify the summary + subtotal numbers on staging.

---

## Ticket 5: `window.confirm` → shadcn `AlertDialog`  *(deferred UX)*

**Purpose:** `src/components/admin/confirm-submit-button.tsx` uses `window.confirm`, which blocks the main thread (the INP artifact you saw) and is unstyled. Replace with a non-blocking `AlertDialog` while preserving the component's API (`form`, `message`, `children`) so consumers don't change.

**Consumers (unchanged after fix):** kpi-targets year/SE rows, and any proposals delete confirms (grep `ConfirmSubmitButton`).

**Steps:**
- [ ] Add the shadcn **`AlertDialog`** primitive if `src/components/ui/alert-dialog.tsx` doesn't exist.
- [ ] Rewrite `ConfirmSubmitButton` as a client component: a trigger button + `AlertDialog`; the **confirm action** calls `form.requestSubmit()` on the external `document.getElementById(form)` (preserving the submit-by-`id` behavior that drives the `useActionState` delete forms). The cancel path just closes the dialog.
- [ ] Keep the same props so no caller changes.
- [ ] Manually verify on staging: delete a kpi-target → styled dialog → confirm submits + shows inline error on failure; INP no longer spikes from a blocking `confirm`.

**Risk:** Medium — the tricky part is submitting an external form from inside a controlled dialog; test the delete + inline-error path carefully.

---

## Ticket 6: Extract `withProposalMutation` (+ optional file split)

**Purpose:** `src/app/(app)/proposals/[id]/actions.ts` (562 lines) and the bid-sheet actions repeat *validate → auth → load → mutate → revalidate*. Extract a `withProposalMutation` helper; the full file split is optional.

**Steps:**
- [ ] **Extract `withProposalMutation`** into `src/lib/proposals/mutation-helpers.ts` and route the 4 near-identical updaters (customer / discountPercent / credit / notes) through it. Behavior-identical; tests stay green.
- [ ] *(Optional, separate PR)* split `actions.ts` into `status-actions.ts` / `bid-sheet-actions.ts` / `scenario-actions.ts` behind a barrel `index.ts` so component imports don't change. Larger mechanical refactor — full test run + proposal-page smoke before merge.

**Risk:** Low for the helper; the file split is "careful" (import-path coordination).

---

## Ticket 7: Centralize `formatMarginPercent` null formatting

**Purpose:** `calculateMarginPercent` returns `number | null` (null when `clientPrice <= 0`), and ~4 render sites each inline `{m == null ? "—" : …}`. Centralize it.

**Steps:**
- [ ] Add `formatMarginPercent(margin: number | null): string` to `src/lib/ui/helpers.ts` (returns `"—"` for null), with the null-contract documented in JSDoc. Add a `helpers.test.ts` case.
- [ ] Replace the inline ternaries in `proposals/[id]/page.tsx`, `components/pricing/contingency-summary-table.tsx`, `components/scenarios/scenario-grid.tsx`, `components/migration/migration-totals-summary.tsx`.

**Risk:** Low — display-only, no calc change.

---

## Ticket 8: Split `scenario-breakout` into pure builder + browser download

**Purpose:** `src/lib/exports/scenario-breakout.ts:50-248` mixes the pure ExcelJS workbook build with browser APIs (`Blob`, `URL`, `document`), blocking server reuse/testing.

**Steps:**
- [ ] Extract `buildScenarioBreakoutWorkbook(input): Promise<ExcelJS.Workbook>` (the pure ~62-235 block) and `downloadScenarioBreakoutXLSX(workbook, filename)` (the ~238-247 browser block); `exportScenarioBreakoutXLSX` calls both.
- [ ] Add a Vitest unit test for the pure builder (no jsdom needed). The `use-scenario-breakout` hook caller is unchanged.

**Risk:** Low — backward-compatible; user download unchanged.

---

## Ticket 9: Clarify discount-vs-LoE-credit **code naming** (no DB rename)

**Purpose:** The DB column `discount_dollars` actually stores prepaid **LoE credit** (always ≥ 0); the code mixes "discount" and "credit" terms. Improve code-layer clarity **without** renaming the column.

**Steps:**
- [ ] Tighten comments in `bid-sheet.ts`, `bid-sheet-pricing.ts` to state that `discount_dollars` is the LoE/prepaid **credit** field.
- [ ] Rename the param of `updateBidSheetCredit` from `discountDollars` → `creditAmount` (function is already named "Credit"); add a note that the DB column name stays `discount_dollars`.
- [ ] Tests are mock-only on the column name; no behavior change.

**Out of scope (skip):** renaming the DB column `discount_dollars → loe_credit_dollars` — that's a migration + backfill + ~15-file blast radius + audit-log impact. High risk; not worth it absent product pressure. See "Out of scope."

**Risk:** Low — comments + one internal param rename.

---

## Ticket 10: `proposal-aggregates.requireMigrationRates` throw → Result

**Purpose:** `requireMigrationRates` (`reports/proposal-aggregates.ts:227`) **throws** on a missing rate; the rest of the reports/pricing layer uses fail-closed `Result` returns. Four pages (`dashboard`, `portfolio-value`, `proposal-log`, `proposal-hours`) catch the throw today.

**Steps:**
- [ ] Convert `requireMigrationRates` (and `buildMigrationCostMap`/`buildMigrationHoursMap`) to return a `{ ok, … } | { ok:false, error }`.
- [ ] Update the 4 callers to check `ok` instead of `try/catch`. Add an error-path test.

**Risk:** Medium — mechanical but spans 4 report pages; do only if you want the consistency. Not urgent (the current try/catch works).

---

## Ticket 11: Document `use-migration-config` ref pattern (don't rewrite)

**Purpose:** `src/lib/hooks/use-migration-config.ts` keeps parallel state + refs synced via `useEffect` to give async persistence callbacks closure-safe access to the latest values. Investigation concluded this is **intentional and stable**; a `useReducer` rewrite wouldn't cleanly solve the async-snapshot need and would risk save/load/retry regressions.

**Steps:**
- [ ] Add a comment block (~line 85) explaining *why* the refs exist (closure-safe persistence) and that they're written only in their sync effects. **Do not** rewrite the hook.

**Risk:** Low (doc-only). The rewrite is explicitly **out of scope**.

---

## Out of scope (intentional)

- **DB column rename** `discount_dollars → loe_credit_dollars` — schema migration + backfill + wide blast radius; skip unless product asks (Ticket 9 covers the safe code-layer clarity).
- **Full `actions.ts` file split** beyond `withProposalMutation` — optional; do as its own PR if desired (Ticket 6).
- **`use-migration-config` rewrite** — the ref pattern is intentional; document only (Ticket 11).
- Already handled by the 06-19 work: dead shadcn primitives (intentional), test backfill (413→428), fail-closed scenario-breakout coverage (T1's `fetchRequiredRates`).
