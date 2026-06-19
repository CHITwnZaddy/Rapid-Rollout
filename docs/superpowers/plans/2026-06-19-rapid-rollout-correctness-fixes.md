# Rapid Rollout Correctness Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Write the test first, watch it fail, then implement.

**Goal:** Close the verified correctness gaps from the 2026-06-19 multi-pass review: make fail-closed pricing enforce rate *values* (not just key existence), make migration-line deletion atomic like scoped services already is, and stop two admin form actions from silently swallowing failures. Then land three lower-risk P1 hardening/cleanup items.

**Architecture:** Keep the fail-closed pricing contract and push the invariant *down* into the guard layer and the calculation engine, so it is enforced structurally instead of by convention at each call site. Use a Postgres RPC for the migration delete+resequence because the current app-side multi-step write can leave inconsistent `row_order` on partial failure — exactly the case the scoped-services RPC already solved.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase Postgres/Auth/RLS, Zod, Vitest (Node env), shadcn/ui, Tailwind v4, ExcelJS dynamic imports.

---

## Completion status

**Status: COMPLETE — all tickets shipped to production 2026-06-19.** Each was implemented on `staging`, smoke-tested by Austin, and promoted via a separate `staging → main` PR. Kept as a historical implementation record (matching the 06-15 / 06-18 plans). This file also stands in for the multi-pass review that drove it — the verified findings became the tickets below.

| Ticket | Staging commit | Promotion PR |
| --- | --- | --- |
| Pre-step — slop cleanup | `3967823` | #103 |
| Ticket 1 — fail-closed rate values (`> 0`) + engine `MissingRateError` | `9e6677a` | #104 |
| Ticket 2 — atomic `delete_migration_detail_line` RPC (staging + prod DB) | `64834e3` | #105 |
| Ticket 3 — admin `submit*` save errors inline (stale-thresholds, variance-reasons) | `dcb9a33` | #106 |
| Ticket 3b — kpi-targets inline errors (UX; added during execution) | `6e96d1f` | #107 |
| Ticket 4 — sanitize Zod errors at the parse boundary | `944e11f` | #108 |
| Ticket 5 — round scoped-service cost before persist | `8fcd56e` | #109 |
| Ticket 6 — bid-sheet line items derived from the engine | `7a7bff2` | #110 |

- Test suite: **413 → 428 passing**; `tsc` + `eslint` clean throughout.
- The `delete_migration_detail_line` migration was applied via the Supabase MCP to **staging** (`qskevpfxmvdlykollnod`) and **production** (`twfispazhjiqxabymjiv`). The file is named `..._delete_migration_detail_line.sql` (no `_rpc` suffix) to match the applied ledger name, keeping the **Migrations drift** check green.

### Deferred / not done (intentional)
- **`proposal-subtotal` live-migration-recompute dedup** — `fetchProposalSubtotal` already delegates the final aggregation to the engine; the remaining duplication is the migration recompute shared with the summary page, a riskier fetch-layer change left for its own carefully-verified pass.
- **Optional UX:** `window.confirm` → shadcn `AlertDialog` for delete confirmations (also clears an INP measurement artifact on deletes). Not started.

---

## Context — why this plan exists

- This is the **third** cleanup pass, following `2026-06-15-rapid-rollout-review-cleanup.md` and `2026-06-18-rapid-rollout-secondary-cleanup.md` (both complete + promoted).
- It directly continues the **follow-up decision** recorded in the 06-18 plan: *"Austin decided pricing math should fail hard when required rates are missing."* The original plans intentionally left the pure calc helpers permissive after screens were gated; this plan implements the fail-hard decision and extends it to the **rate ≤ 0 value gap** found on 2026-06-19.
- Findings here survived **adversarial verification** (19 PASS-4 candidates → 10 real). The refuted ones — e.g. "NULL rate → NaN" (DB enforces `rate NUMERIC(10,2) NOT NULL`) and "`proxy.ts` is non-standard" (it is the correct Next 16 middleware name) — are **out of scope and must not be "fixed."**
- **Pre-step already shipped:** PR #102 (`refactor: slop cleanup`) — behavior-preserving simplifications in `load-guards.ts`, `export-xlsx.ts`, `bid-sheet-view-model.ts`, `parse-supabase.ts`. Branch this plan's work off `staging` *after* #102 merges so the `load-guards.ts` edits are present.

## Operating rules

- **Commit each ticket directly onto the `staging` branch — no sub-branches, no per-ticket PRs.** Push `staging` after each ticket.
- After Austin verifies the Vercel **staging** deploy for a ticket, promote `staging` → `main` (merge + push). Steady state: `staging` is exactly one ticket ahead of `main`; the gap closes on the final ticket.
- One ticket at a time. Run targeted tests, then `npm run lint` + `npx vitest run` + `npx tsc --noEmit` before each push to staging.
- **Ticket 1 decision = BOTH** — implement the guard-layer `> 0` checks AND the engine `requireRate` throw (defense in depth).
- **Ticket 2 (schema):** apply the migration via the **Supabase MCP**, explicitly targeting `qskevpfxmvdlykollnod` (Rapid-Rollout-Staging) for the staging apply, and `twfispazhjiqxabymjiv` (Rapid Rollout Scoping App / **production**) at the staging→main promotion. Austin pre-authorized both; still announce the target project name + SQL before each apply. Regenerate `src/types/database.ts` via the MCP `generate_typescript_types`. Production is never touched until staging is verified.
- Keep runtime behavior unchanged **except** where a ticket explicitly changes user-facing error handling (Tickets 1, 3, 4).
- This plan file was committed as a historical record on 2026-06-19 at Austin's request (see Completion status above).

## Ticket priority

| Pri | Ticket | Risk | Schema? |
| --- | --- | --- | --- |
| **P0** | 1 — Fail-closed rate **values** (>0) at gates + engine | Medium | No |
| **P0** | 2 — Atomic migration delete/resequence RPC | Medium | **Yes** |
| **P0** | 3 — Admin `submit*` wrappers surface failures | Low | No |
| P1 | 4 — Sanitize Zod/DB errors at parse boundary | Low | No |
| P1 | 5 — Round scoped-service cost before persist | Low | No |
| P1 | 6 — Collapse proposal-subtotal / view-model into the engine | Medium | No |

---

## Ticket 1: Fail-closed rate values (>0), not just key existence  — P0

**Purpose:** Today the guards (`getRequiredRateCardsError`, `fetchRequiredRates`) only verify a required `lookup_key` *exists*. A `rate_cards` row with `rate = 0` passes every gate, and the engine's `?? 0` then prices that line at **$0** — fail-*open* despite the fail-closed mandate. Enforce `rate > 0` at the gates (user-facing), and make the engine fail hard on a missing rate (the invariant, per Austin's decision).

**Files:**
- Modify: `src/lib/pricing/load-guards.ts` (+ `__tests__`/new test) — add `getRequiredRatePositiveError`.
- Modify: `src/lib/supabase/queries.ts` (+ test) — `fetchRequiredRates` rejects `rate <= 0`.
- Modify: `src/lib/calculations/engine.ts` (+ `__tests__/engine.test.ts`) — `calculateScenarioLine` / `calculateScopedServiceCost` throw `MissingRateError` instead of `?? 0`.
- Modify (swap guard call): `src/app/(app)/proposals/[id]/scenarios/[type]/page.tsx`, `src/app/(app)/proposals/[id]/actions.ts` (`saveScenarioGridSelections`), `src/app/(app)/proposals/[id]/scoped-services/page.tsx`, `src/app/(app)/proposals/[id]/bid-sheet/page.tsx`, `src/lib/reports/scenario-breakout-data.ts` (and its hook gate `src/lib/hooks/use-scenario-breakout.ts`).

**Steps:**

- [ ] **Test first** — add `getRequiredRatePositiveError` cases: returns `null` when all required keys present with positive rate; returns an error when a key is missing, when `rate === 0`, and when `rate < 0`.
- [ ] Implement the guard (value-aware superset of the existence guard):

```ts
// src/lib/pricing/load-guards.ts
type RateValueRow = { lookup_key: string | null; rate: number | null };

export function getRequiredRatePositiveError(
  rateCards: RateValueRow[],
  requiredKeys: readonly string[],
  context: string
): string | null {
  const valueByKey = new Map<string, number>();
  for (const rc of rateCards) {
    if (rc.lookup_key && Number.isFinite(Number(rc.rate))) {
      valueByKey.set(rc.lookup_key, Number(rc.rate));
    }
  }
  const invalid = requiredKeys.filter((key) => !((valueByKey.get(key) ?? 0) > 0));
  if (invalid.length === 0) return null;
  return `Required rate card rows for ${context} are missing or have a non-positive rate: ${invalid.join(", ")}.`;
}
```

- [ ] At each pricing gate, replace the `getRequiredRateCardsError(...)` call with `getRequiredRatePositiveError(...)`. The rows already carry `rate` at these sites (scenario page selects `*`; the save action selects `activity, rate, role_category, lookup_key`). Keep the existing `<...Unavailable>` / `{ ok:false }` return shape.
- [ ] **Test first** — `fetchRequiredRates` returns `{ ok:false }` when a required key's rate is `<= 0`; then add the `rate <= 0` filter alongside the existing `missing` check in `src/lib/supabase/queries.ts`.
- [ ] **Engine fail-hard (the invariant).** Replace the silent `?? 0`:

```ts
// src/lib/calculations/engine.ts
export class MissingRateError extends Error {
  constructor(key: string) {
    super(`Missing rate card rate for "${key}".`);
    this.name = "MissingRateError";
  }
}

function requireRate(rateCardMap: Map<string, number>, key: string): number {
  const rate = rateCardMap.get(key);
  if (rate === undefined) throw new MissingRateError(key);
  return rate;
}
// use requireRate(...) in calculateScenarioLine (srIm/pm/ba) and calculateScopedServiceCost
```

- [ ] Update the engine tests that encoded the old fail-open behavior (e.g. `engine.test.ts` expecting `calculateScopedServiceCost(8, rcMap, "Master|Unknown")` to be `0` — now expect it to throw `MissingRateError`).
- [ ] Confirm every engine caller is reached only *after* a gate (scenario page + save action + scoped-services page already gate; the scenario-grid client component renders only after the page gate). No new try/catch needed in the gated paths; the throw is a last-resort invariant.

**Decision point for Austin:** the engine `requireRate` throw is the literal "math fails hard" interpretation of your 06-18 decision. If you'd rather keep the engine pure-permissive and rely solely on the guard-layer `> 0` checks, drop the engine sub-steps and Ticket 1 still fully closes the user-facing gap. Default in this plan = implement both (defense in depth).

**Verification:** `npx vitest run src/lib/pricing src/lib/supabase src/lib/calculations` → green; `npx tsc --noEmit`.

---

## Ticket 2: Atomic migration detail-line delete + resequence (RPC)  — P0  ⚠ SCHEMA

**Purpose:** `removeMigrationDetailLine` deletes the row atomically, then resequences the section with a **per-row `UPDATE` loop** (`migration/actions.ts:367-379`). A partial failure mid-loop leaves the section half-resequenced, and a retry recomputes `row_order` from the corrupted state. This is the same class of bug the scoped-services delete already fixed via `delete_scoped_service_line`; port that pattern. Resequencing is **per `section`** (project/workflow/cost), so capture the section before deleting.

**Files:**
- Create: `supabase/migrations/<timestamp>_delete_migration_detail_line_rpc.sql`
- Modify: `src/app/(app)/proposals/[id]/migration/actions.ts` (`removeMigrationDetailLine`)
- Modify (regenerate): `src/types/database.ts` via `npm run db:gen-types`
- Create: `src/lib/migrations/delete-migration-detail-line-rpc.test.ts` (mirror `scoped-services-row-order-rpc.test.ts`)

**Steps:**

- [ ] Author the RPC, mirroring `20260618194500_scoped_services_row_order_rpc.sql` but scoped to the line's section:

```sql
create or replace function public.delete_migration_detail_line(
  p_proposal_id uuid,
  p_line_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_section text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to delete migration detail rows.';
  end if;

  select section into v_section
  from public.migration_detail_lines
  where id = p_line_id and proposal_id = p_proposal_id;

  if v_section is null then
    raise exception 'Migration detail row % was not found for proposal %', p_line_id, p_proposal_id;
  end if;

  delete from public.migration_detail_lines
  where id = p_line_id and proposal_id = p_proposal_id;

  with ordered as (
    select id, row_number() over (order by row_order, id) - 1 as next_row_order
    from public.migration_detail_lines
    where proposal_id = p_proposal_id and section = v_section
  )
  update public.migration_detail_lines as line
  set row_order = ordered.next_row_order
  from ordered
  where line.id = ordered.id;
end;
$$;

revoke execute on function public.delete_migration_detail_line(uuid, uuid) from public, anon;
grant execute on function public.delete_migration_detail_line(uuid, uuid) to authenticated;
```

- [ ] Replace the delete + reload + resequence loop in `removeMigrationDetailLine` with a single `await supabase.rpc("delete_migration_detail_line", { p_proposal_id, p_line_id })`, mapping the `not found` raise to the existing friendly message (mirror the scoped-services `error.message.includes(...)` translation). Reload lines afterward for the response, exactly as the scoped-services action does.
- [ ] Keep `updateComputedTotal` running on the post-delete state (now consistent).
- [ ] Add the RPC-shape test mirroring `scoped-services-row-order-rpc.test.ts`; plus an `actions.test.ts` case: delete a middle row of `[0,1,2]` → remaining `row_order` is `[0,1]` with no gaps.
- [ ] `npm run db:gen-types` to refresh `src/types/database.ts` with the new RPC signature.
- [ ] **PAUSE.** Surface the migration SQL + `database.ts` diff to Austin and wait for go-ahead before `npm run db:push:staging` and before merging.

**Verification:** `npx vitest run src/lib/migrations src/app/\(app\)/proposals`; after approval, `npm run db:push:staging` then smoke-test deleting a migration row in the staging UI.

---

## Ticket 3: Admin `submit*` wrappers must surface failures  — P0

**Purpose:** `submitUpdateStaleThreshold` (and `submitUpdateVarianceReason`) `await` the underlying action but discard its `{ ok:false, error }` result and return `Promise<void>` — a failed save (validation/auth/DB) looks successful to the user. Wire the error to the form via React 19 `useActionState`.

**Files:**
- Modify: `src/app/(app)/admin/stale-thresholds/actions.ts`, `src/app/(app)/admin/variance-reasons/actions.ts`
- Modify: the consuming form components under `src/components/admin/` (identify with `grep -rn "submitUpdateStaleThreshold\|submitUpdateVarianceReason" src/components`)

**Steps:**

- [ ] Change each `submit*` wrapper to the `useActionState` signature, returning the result instead of `void`:

```ts
export async function submitUpdateStaleThreshold(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  return updateStaleThreshold(formData);
}
```

- [ ] In the form component, adopt `const [state, formAction] = useActionState(submitUpdateStaleThreshold, { ok: true })` and render `state.ok ? null : state.error` (use the existing toast/error pattern from the pricing screens for consistency). Repeat for variance reasons.
- [ ] **Test first** — a unit test asserting `submitUpdateStaleThreshold(prev, badFormData)` resolves to `{ ok:false, error }` (not silently `undefined`). Reuse the existing admin action test harness if present.

**Verification:** `npx vitest run src/app/\(app\)/admin`; manual: submit an invalid threshold and confirm the error renders.

---

## Ticket 4: Sanitize Zod/DB errors at the parse boundary  — P1

**Purpose:** `safeParseSupabaseResult` returns raw `zodError.message` (a JSON dump of schema internals) which lands directly in user toasts (`bid-sheet/page.tsx`). Log the raw error server-side; return a friendly, generic message to the UI.

**Files:** Modify `src/lib/validation/parse-supabase.ts` (+ `parse-supabase.test.ts`).

**Steps:**
- [ ] **Test first** — on a Zod failure, the returned `error` is the friendly string (not the raw `[{"code":...}]` JSON); on a Supabase `error`, behavior is unchanged.
- [ ] Return a stable user-facing message (e.g. `"This data could not be loaded. Please retry or contact support."`) for the parse-failure branch, and `console.error` the raw `parsed.error` for server logs. Keep the `{ ok, data | error }` shape so call sites are untouched.

**Verification:** `npx vitest run src/lib/validation`.

---

## Ticket 5: Round scoped-service cost before persistence  — P1

**Purpose:** `calculateScopedServiceCost` returns `hours * rate` unrounded, and `updateScopedServiceLine` persists it directly (`scoped-services/actions.ts:267`). Per the rounding policy, stored client-facing money must be rounded to the cent so DB and screen agree.

**Files:** Modify `src/lib/calculations/engine.ts` (or the action call site) + `engine.test.ts`.

**Steps:**
- [ ] **Test first** — `calculateScopedServiceCost(h, rate)` returns a cent-rounded value (e.g. a rate that produces fractional cents rounds to 2dp).
- [ ] Apply `roundMoney(...)` at the cost edge — preferred: round in the action right before persistence, to keep the engine's "unrounded until the edge" convention consistent with the other engines (see Ticket 6). Import `roundMoney` from `@/lib/calculations/rounding`.

**Verification:** `npx vitest run src/lib/calculations`.

---

## Ticket 6: Collapse proposal-subtotal / bid-sheet-view-model duplication into the engine  — P1

**Purpose:** `bid-sheet-view-model.ts` re-derives each scenario line's price with its own `applyComplexity(...)` while `calculateProposalPricingSummary` already computes the same numbers; `proposal-subtotal.ts` re-implements the migration + pricing flow. Two code paths for one number invites drift. Make the engine the single source and have the view model/subtotal consume its output.

**Files:** Modify `src/lib/calculations/proposal-pricing.ts` (return a per-line breakdown), `src/lib/proposals/bid-sheet-view-model.ts`, `src/lib/proposals/proposal-subtotal.ts` (+ their tests).

**Steps:**
- [ ] Extend `calculateProposalPricingSummary` to also return `scenarioLines: { type, clientPrice, totalHours }[]` (computed once, the canonical way).
- [ ] **Test first** — the engine's per-line breakdown sums to `scenarioSubtotal`; the view model's `bidLineItems` equal the engine's breakdown for the same input.
- [ ] Rewrite `buildBidSheetViewModel` to map the engine's `scenarioLines` (drop its local `applyComplexity` recompute) and keep the existing `clientPrice > 0 || totalHours > 0` filter + the scoped/migration rows.
- [ ] Point `proposal-subtotal.ts` at the same summary instead of re-deriving migration totals (also resolves the PASS-1 logic-leak flag).
- [ ] Backfill the `bid-sheet-view-model.test.ts` edge cases noted in review (zero-cost/zero-hour scenario, `null`/`0` complexity factor).

**Verification:** `npx vitest run src/lib/proposals src/lib/calculations`; confirm bid-sheet totals unchanged for an existing fixture proposal.

---

## Final verification (whole plan)

- [ ] `npm run lint` clean.
- [ ] `npx vitest run` — full suite green (currently 413 passing; expect net-new tests).
- [ ] `npx tsc --noEmit` clean.
- [ ] For Ticket 2 only: after Austin's approval, `npm run db:push:staging`, `npm run db:status`, and a staging UI smoke test (delete a migration row; create/price a scenario with a deliberately deactivated rate to confirm the new fail-closed message).
- [ ] Each ticket lands as its own PR into `staging`; promote staging → main only after Austin verifies the staging deploy.

## Out of scope (verified false positives — do not touch)

- Renaming `src/proxy.ts` → `middleware.ts` (correct Next 16 convention).
- "NULL rate → NaN" defensive checks (DB enforces `rate NUMERIC(10,2) NOT NULL`; the real issue is `rate = 0`, handled in Ticket 1).
- Deleting unused shadcn/ui primitives (`avatar`, `command`, `dropdown-menu`, `popover`, `sheet`, `tabs`) — intentional design-system scaffolding.
- Per-line scenario *hours* rounding in the view model (summary ceils per policy; line items are informational).
