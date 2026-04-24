# Feature Specification: Duplicate Proposal

**Feature Branch**: `002-duplicate-proposal`
**Created**: 2026-04-24
**Status**: Draft
**Input**: User description: "Duplicate Proposal: clone an existing proposal (scenarios, migration, scoped services) to a new Draft, preserving pricing but resetting lifecycle and bid-sheet adjustments."

## Overview

Solution Engineers routinely land in a situation where a new opportunity looks almost identical to one they have already priced — same customer tier, similar migration profile, same scoped services, different customer or different quantities. Today they rebuild from scratch, which is slow and error-prone. **Duplicate Proposal** gives SEs a one-click action to clone an existing proposal into a new Draft, carrying over the priced content (scenarios, migration, scoped services, complexity factors) while explicitly resetting things that must not leak across deals (ownership attribution of derived rows, status history, bid-sheet adjustments, timestamps).

This feature must not bypass any of the guardrails in the [Rapid Rollout Constitution](../../.specify/memory/constitution.md): pricing stays correct, the write happens through a server action, Supabase is the source of truth, and every row in the clone is attributable to the duplicating SE.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Duplicate a proposal into a new Draft for a different customer (Priority: P1)

An SE has closed (or is working) a proposal for Customer A and receives a similar opportunity for Customer B. From the proposal list or the proposal detail page, they click **Duplicate**, pick Customer B as the target customer, optionally edit the new proposal's name, and land on the new proposal in Draft status with all scenarios, migration, and scoped services already populated and priced correctly.

**Why this priority**: This is the core job-to-be-done. Every other user story in this spec is a refinement on top of this one.

**Independent Test**: With a fully populated source proposal (all four scenarios, migration configured, scoped services present, non-zero complexity factors), trigger Duplicate targeting a different existing customer. Verify (a) a new proposal exists in Draft status owned by the acting SE, (b) the new proposal's subtotal equals the source proposal's subtotal before bid-sheet adjustments, (c) all four scenarios, migration config, migration detail lines, and scoped service lines are present with matching inputs, and (d) the source proposal is unchanged.

**Acceptance Scenarios**:

1. **Given** an SE is viewing a source proposal in any status, **When** they click Duplicate and select a target customer, **Then** a new proposal is created in `Draft` status, owned by the acting SE, linked to the selected customer.
2. **Given** the source proposal has content in all four scenarios (P1, P2, Opt1, Opt2) with varied complexity factors, **When** the duplicate completes, **Then** each scenario on the clone has the same line items, quantities, and per-scenario complexity factor as the source.
3. **Given** the source proposal has a migration configuration and migration detail rows, **When** the duplicate completes, **Then** the clone has an equivalent migration configuration and detail rows producing the same migration subtotal.
4. **Given** the source proposal has scoped service lines with per-line complexity factors, **When** the duplicate completes, **Then** the clone has the same scoped service lines with the same factors.
5. **Given** rate cards and service-hours are hydrated, **When** the SE opens the clone's Proposal Summary, **Then** the clone's scenario, migration, scoped, and proposal subtotals equal the source's subtotals to the cent (i.e., pre-bid-sheet totals are preserved exactly).

---

### User Story 2 — Reset lifecycle, ownership attribution, and audit trail on the clone (Priority: P1)

The clone must look like a brand-new proposal for audit and reporting purposes, not a copy that inherits the source's history.

**Why this priority**: If a clone carries over status history or audit rows from the source, portfolio reports, time-to-close, and stale-proposal detection break immediately. This is a correctness requirement, not a polish item.

**Independent Test**: Duplicate a proposal whose source is in `Submitted` with a rich status history and change log. Verify the clone is in `Draft` with exactly one `proposal_status_history` row (`Draft` created) and change-log entries only for the duplication event and any subsequent edits — never copies of the source's history.

**Acceptance Scenarios**:

1. **Given** a source proposal in a non-`Draft` status with status history, **When** it is duplicated, **Then** the clone starts in `Draft` and its `proposal_status_history` contains a single row for the new `Draft` state attributed to the acting SE.
2. **Given** the source proposal has change-log entries, **When** it is duplicated, **Then** none of those entries are copied to the clone; instead, exactly one change-log entry is written describing the duplication event, attributed to the acting SE, referencing the source proposal id.
3. **Given** the source proposal's `created_at`, `updated_at`, and owner, **When** it is duplicated, **Then** the clone's `created_at` and `updated_at` reflect the duplication time and the clone's owner is the acting SE, regardless of who owns the source.
4. **Given** multiple derived rows on the source (scenario lines, migration detail rows, scoped lines), **When** they are cloned, **Then** every cloned row carries `created_by = auth.uid()` of the acting SE and any `WITH CHECK (changed_by = auth.uid())` audit triggers fire with that user's id.

---

### User Story 3 — Reset bid-sheet adjustments and export state on the clone (Priority: P1)

Bid-sheet `Credit` and `Discount %` are deal-specific concessions. They must never carry into a clone.

**Why this priority**: Silently inheriting a 15% discount from the last deal is exactly the kind of correctness failure that costs real money. Explicit reset is non-negotiable.

**Independent Test**: Duplicate a source proposal that has non-zero `credit` and `discount_pct`. Verify the clone's Bid Sheet shows `credit = 0` and `discount_pct = 0`, and that the clone's final total equals its subtotal.

**Acceptance Scenarios**:

1. **Given** the source proposal has `credit > 0` or `discount_pct > 0`, **When** it is duplicated, **Then** the clone's bid sheet has `credit = 0` and `discount_pct = 0`.
2. **Given** the source proposal has a generated export file reference (if any such reference exists on the proposal), **When** it is duplicated, **Then** the clone has no export reference and has not been marked as exported.
3. **Given** the clone's bid sheet with adjustments reset to 0, **When** the SE opens it, **Then** the final total equals the subtotal to the cent.

---

### User Story 4 — Pre-duplication summary and confirmation (Priority: P2)

Before committing, the SE sees a short summary of what will and will not carry over, plus fields to set on the clone (target customer, optional name override).

**Why this priority**: This is a safety and clarity win. The duplication can succeed without it, but the UX is much less trustworthy.

**Independent Test**: Open the Duplicate dialog on a source proposal. Verify the dialog lists carry-over items (scenarios, migration, scoped services, complexity factors) and reset items (status, bid-sheet adjustments, status history, owner, timestamps), and requires the SE to pick a target customer before confirming.

**Acceptance Scenarios**:

1. **Given** the SE clicks Duplicate, **When** the dialog opens, **Then** it displays: (a) carry-over fields, (b) reset fields, (c) a target-customer selector defaulted to the source's customer but changeable, (d) an optional name field defaulted to `"<source name> (Copy)"`.
2. **Given** the SE submits the dialog with no target customer selected, **When** submission validation runs, **Then** the action is rejected with a field-level error and nothing is written.
3. **Given** the SE submits with valid inputs, **When** the server action completes, **Then** the app navigates to the new proposal's detail page.

---

### User Story 5 — Fail closed when rate card / service-hours have drifted (Priority: P2)

Pricing the clone relies on the same hydrated rate cards and service-hours as the source. If a required lookup row has been removed between when the source was built and when the clone is created, the clone must surface that failure rather than compute a silently different total.

**Why this priority**: Complements Constitution Principle II (Fail Closed) and FR-032 in the baseline spec. If the clone could silently reprice on missing data, duplication would become a stealth regression vector.

**Independent Test**: Remove one of the required migration rate-card rows, then attempt to duplicate a source proposal that uses migration. Verify the duplication either (a) refuses with a visible error identifying the missing rate, or (b) succeeds in Draft but the migration page on the clone shows the same fail-closed error the source's migration page would.

**Acceptance Scenarios**:

1. **Given** a required rate-card row used by the source's migration or scenarios is missing at duplication time, **When** the SE triggers Duplicate, **Then** the server action either refuses with a structured error naming the missing row, or creates the clone but surfaces the same fail-closed error on the relevant pricing page. No clone ever displays a fabricated total.
2. **Given** service-hours rows referenced by the source's scenarios have been removed, **When** the SE triggers Duplicate, **Then** the same fail-closed behavior applies.

---

### Edge Cases

- Source proposal has **zero line items** in some scenarios: the clone must preserve the empty scenario, not drop it.
- Source proposal was created by **a different SE**: duplication is allowed (matches global-read / owner-write RLS), but the clone's owner is the acting SE.
- Source customer has been **deleted** since the source proposal was created: the dialog must require the SE to pick a still-existing customer; the source proposal's own customer reference is unaffected.
- Source proposal is **in a terminal status** (e.g., `Won`, `Lost`): duplication is still allowed; the clone starts in `Draft`.
- SE **rapidly double-clicks** Duplicate: the server action must be idempotent per submission or debounced at the UI layer to avoid creating two clones.
- Network failure **mid-duplication**: the entire duplication MUST be atomic — either the clone exists fully or not at all. No partial clone with missing migration or scoped data.
- Source has a **per-scenario complexity factor** of `0` or at the documented boundary: the clone preserves the exact value; it does not coerce to a default.
- Source has a `proposal_complexity_factor` that was introduced in a later migration than when the source was created: the clone still persists it if present, otherwise omits it (schema behaves normally).
- Source proposal has a **very large** number of scenario lines / migration detail rows (stress case): duplication must complete within a bounded time (see SC-005) without timing out the server action.

## Requirements *(mandatory)*

### Functional Requirements

**Entry Point & UI**

- **FR-001**: System MUST expose a "Duplicate" action on the proposal detail page and the proposals list row menu.
- **FR-002**: System MUST open a dialog that (a) lists carry-over vs reset fields, (b) provides a target-customer selector defaulted to the source's customer, (c) provides an editable proposal name defaulted to `"<source name> (Copy)"`.
- **FR-003**: Users MUST be able to cancel the dialog without side effects.
- **FR-004**: Users MUST be able to change the target customer from the default.

**Carry-Over (pricing-relevant content)**

- **FR-010**: System MUST copy the source proposal's four scenarios (P1, P2, Opt1, Opt2) including all scenario line items (service reference, quantity, and any line-level overrides) onto the clone.
- **FR-011**: System MUST copy the source proposal's proposal-level complexity factor and each per-scenario complexity factor onto the clone unchanged.
- **FR-012**: System MUST copy the source's migration configuration and all migration detail rows onto the clone.
- **FR-013**: System MUST copy the source's scoped service lines, including per-line complexity factors, onto the clone.
- **FR-014**: System MUST preserve referential integrity: cloned rows reference the clone's proposal id, not the source's.

**Reset (audit / lifecycle / adjustments)**

- **FR-020**: System MUST set the clone's status to `Draft` regardless of the source's status.
- **FR-021**: System MUST create exactly one `proposal_status_history` row for the clone, representing the new `Draft` state, attributed to the acting SE.
- **FR-022**: System MUST NOT copy any `proposal_status_history` or change-log rows from the source onto the clone.
- **FR-023**: System MUST write exactly one change-log entry describing the duplication event, attributed to the acting SE, identifying the source proposal id.
- **FR-024**: System MUST set the clone's owner to the acting SE (`auth.uid()`).
- **FR-025**: System MUST set the clone's `created_at` and `updated_at` to the duplication time; it MUST NOT copy the source's timestamps.
- **FR-026**: System MUST set the clone's bid-sheet `credit = 0` and `discount_pct = 0`.
- **FR-027**: System MUST NOT copy any export-state flags or generated export references from the source onto the clone.

**Correctness & Pricing**

- **FR-030**: System MUST verify that all rate-card and service-hours rows required by the source's scenarios and migration exist at duplication time. Missing rows MUST either (a) cause the duplication to be rejected with a structured error naming the missing row(s), or (b) cause the clone to be created in Draft but surface the standard fail-closed error on the affected pricing page. No clone MAY display a fabricated total.
- **FR-031**: System MUST NOT introduce any pricing math in server actions, route handlers, or components as part of this feature. Recomputation on the clone MUST go through the existing `src/lib/calculations/` engines.
- **FR-032**: The clone's pre-bid-sheet subtotals (scenario, migration, scoped, proposal) MUST equal the source's corresponding subtotals to the cent whenever all required lookup rows are present.

**Atomicity & Concurrency**

- **FR-040**: Duplication MUST be atomic: either every cloned row is persisted and the change-log entry is written, or nothing is persisted. Partial clones MUST NOT be observable.
- **FR-041**: The duplication write path MUST be implemented as a single server action under `src/app/(app)/proposals/[id]/...` (or equivalent) with Zod-validated inputs, following Constitution Principle IV (Server Actions For All Writes).
- **FR-042**: System MUST guard against double submission (UI debounce AND server-side idempotency key or equivalent) so rapid re-clicks do not produce duplicate clones.

**Authorization**

- **FR-050**: Any authenticated SE MUST be able to duplicate any proposal they can read (consistent with global-read, owner-write RLS).
- **FR-051**: The clone MUST be owner-writable only by the acting SE, per existing proposal RLS.

**Validation**

- **FR-060**: System MUST reject duplication requests with a missing or unknown target customer id.
- **FR-061**: System MUST reject duplication requests with a proposal name shorter than the existing proposals-table name constraint (or use a safe default if the user left it blank).

### Key Entities

- **Source Proposal**: The proposal the SE initiates duplication from. Read-only from this feature's perspective.
- **Clone Proposal**: The newly-created proposal row, owned by the acting SE, in `Draft`, linked to the chosen target customer.
- **Cloned Scenarios / Scenario Lines**: New rows mirroring the source's scenario structure and line items, referencing the clone proposal.
- **Cloned Migration Configuration / Detail Lines**: New rows mirroring the source's migration tree, referencing the clone proposal.
- **Cloned Scoped Service Lines**: New rows mirroring the source's scoped lines, referencing the clone proposal.
- **Bid Sheet (Clone)**: A bid-sheet row for the clone with `credit = 0` and `discount_pct = 0`.
- **Duplication Change-Log Entry**: A single change-log row recording the duplication event, attributed to the acting SE, with a pointer to the source proposal id.
- **Duplication Status-History Entry**: A single `proposal_status_history` row placing the clone in `Draft`, attributed to the acting SE.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any source proposal whose required lookup rows are present, the clone's scenario subtotal, migration subtotal, scoped subtotal, and proposal subtotal each equal the source's corresponding subtotal to the cent.
- **SC-002**: For any clone, the Bid Sheet displays `credit = 0` and `discount_pct = 0` immediately after duplication.
- **SC-003**: For any clone, `proposal_status_history` contains exactly one row (`Draft`) attributed to the acting SE; no history rows from the source are present.
- **SC-004**: For any clone, exactly one change-log entry describing the duplication exists, attributed to the acting SE and referencing the source proposal id.
- **SC-005**: Duplication of a median-sized proposal (4 scenarios, ≤50 total scenario lines, migration configured, ≤10 scoped lines) completes within 2 seconds at the 95th percentile on production hardware.
- **SC-006**: 100% of new pricing-adjacent code paths introduced by this feature are covered by vitest suites in `src/lib/calculations/__tests__/` and the relevant server-action `actions.test.ts` files (no new math in components; no uncovered pricing branch).
- **SC-007**: Zero partial clones observed in production: operational queries confirm no proposal row exists without a matching scenario / migration / scoped / bid-sheet tree consistent with its source (where source is set via the duplication change-log entry).
- **SC-008**: SEs rating the feature in the first 30 days report it saves them meaningful time vs. rebuilding from scratch (target: ≥80% positive).

## Assumptions

- The existing proposal schema already supports the row shapes we need to copy; duplication is primarily about writing copies under a new `proposal_id`, not about introducing new column types.
- The `change_log` and `proposal_status_history` tables can accept a "duplicated from" reference either via an existing payload/json column or a new nullable `source_proposal_id` column (a migration may be required — this decision is deferred to `/speckit-plan`).
- "Target customer" must be selected from existing, non-deleted customers in Supabase; creating a customer inline is out of scope for v1 of this feature.
- Exports (`.xlsx` bid sheet, PDFs) are regenerated on demand from the clone's data, so nothing export-related needs copying.
- The feature is desktop-only for v1, consistent with the baseline assumption.
- Multi-tenancy is out of scope; all users share one TUC workspace.
- Duplicating a proposal across proposal *templates* or rate-card versions is out of scope for v1 (the clone uses whatever rate cards / service-hours are current at view time, which is the same behavior as any other proposal).

## Open Questions / Clarifications Needed

Run `/speckit-clarify specs/002-duplicate-proposal/spec.md` before `/speckit-plan`. Suggested questions to resolve:

1. When required rate-card / service-hours rows are missing at duplication time, do we (a) reject the duplication outright with a structured error, or (b) still create the Draft clone and surface the standard fail-closed error on the affected pricing page? FR-030 currently permits either; pick one.
2. Should the duplication change-log entry reference the source proposal via an existing JSON payload column, or do we need a new nullable `source_proposal_id` column on `change_log`? (Schema/migration impact.)
3. Should we add a `source_proposal_id` column on `proposals` itself for reporting ("show me all proposals cloned from X")? Useful but non-essential.
4. Should duplication be allowed across customers whose status is archived/inactive, or only against active customers?
5. What is the exact expected default for the clone's proposal name — `"<source name> (Copy)"`, `"<source name> — <new customer name>"`, or user-blank? Pick one default.
6. Should the clone inherit the source's `proposal_complexity_factor` unchanged, or reset it to the workspace default? (Current FR-011 assumes inherit; confirm.)
7. Debounce strategy for FR-042: UI-only debounce, a client-generated idempotency key passed to the server action, or a short-lived unique constraint on `(owner_id, source_proposal_id, created_at)`?
8. Visibility: should the dialog show the source's current computed subtotal next to "This total will be preserved" for SE reassurance?
