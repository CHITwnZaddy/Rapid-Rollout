# Feature Specification: Rapid Rollout Baseline

**Feature Branch**: `001-rapid-rollout-baseline`
**Created**: 2026-04-24
**Status**: Draft
**Input**: Reverse-engineered from existing codebase at commit `3c751cd`. This spec documents current behavior as a baseline for future spec-driven changes; it is not a greenfield proposal.

## Overview

Rapid Rollout is the proposal scoping and pricing application for TUC Solution Engineers (SEs). It replaces a legacy Excel workbook with a Next.js + Supabase web app that lets SEs capture customer requirements, build six priced scenario variants (P1, P2, P3, Opt1, Opt2, Opt3), scope migration services and additional scoped services, apply bid-sheet-level adjustments, export a professional bid sheet and supporting reports, and track proposals across a defined lifecycle.

The product must be dependable enough that SEs retire the Excel workbook without hedging.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Build and Price a Customer Proposal (Priority: P1)

An SE receives a customer opportunity. They create a proposal tied to a customer record, fill in the six scenario variants (P1, P2, P3, Opt1, Opt2, Opt3) with line items drawn from the rate card and service-hours library, optionally apply a complexity factor, and see accurate totals update in real time.

**Why this priority**: This is the core job. If an SE cannot reliably produce a priced scenario grid, the tool has no reason to exist.

**Independent Test**: Create a proposal, add one line item to P1, confirm the scenario total matches the hand-calculated rate × hours × complexity result. Confirm the proposal summary reflects the same number.

**Acceptance Scenarios**:

1. **Given** a logged-in SE with a hydrated rate card, **When** they create a new proposal and add a line item to scenario P1 with a known service and quantity, **Then** the scenario line output displays rate, hours, and cost matching the calculation engine to the cent.
2. **Given** a proposal with line items in all six scenarios, **When** the SE changes the proposal-level complexity factor, **Then** every scenario total and the proposal summary total recompute accordingly and persist on save.
3. **Given** a rate-card row is missing from Supabase, **When** the SE opens the scenario grid, **Then** an error card is shown and no pricing UI renders with a default value.
4. **Given** two SEs viewing the same proposal, **When** one SE updates scenario P2, **Then** the second SE sees the change after refresh (global read, owner-write RLS).

---

### User Story 2 — Scope Migration Services (Priority: P1)

An SE configures migration services for a proposal: number of locations, document complexity, line-item imports, travel, and oversight. The migration engine computes hours per section (Sr. IM, PM Oversight, travel) and rolls the total into the proposal.

**Why this priority**: Migration is a large fraction of proposal value. Without it, totals are wrong and the tool is unusable for real deals.

**Independent Test**: With a seeded rate card, configure a single migration (e.g., 100 document imports, 2 locations, 1 travel trip). Verify hours roll to the correct buckets (Sr. IM vs PM Oversight) and the migration subtotal appears in the proposal summary.

**Acceptance Scenarios**:

1. **Given** a proposal and a valid migration configuration, **When** the SE saves the migration detail, **Then** the computed Sr. IM hours, PM Oversight hours, and travel cost match the migration engine output, and the proposal total updates.
2. **Given** the rate card is missing `Master|Sr. Implementation Manager`, `Master|Program Manager`, or `Master|Travel Cost/Trip`, **When** the SE opens the migration page, **Then** the app surfaces a visible error and refuses to compute a migration total.
3. **Given** a saved migration, **When** an SE edits a row in the migration queue, **Then** the change persists through a server action and appears in the change log.

---

### User Story 3 — Apply Bid-Sheet Adjustments and Export (Priority: P1)

An SE opens the Bid Sheet, enters a dollar `Credit` and/or a `Discount %`, and exports a styled `.xlsx` bid sheet to send to the customer.

**Why this priority**: The bid sheet is the SE's deliverable. Wrong credit/discount math = wrong customer price = lost deal or lost margin.

**Independent Test**: Set a proposal subtotal of $10,000, credit $1,000, discount 10%. Expect final total $8,100 (`(10000 - 1000) * 0.9`). Export and confirm the exported workbook matches the on-screen total.

**Acceptance Scenarios**:

1. **Given** a proposal with a computed subtotal, **When** the SE enters a credit greater than or equal to 0 and a discount between 0 and 100, **Then** the final total equals `max(0, subtotal - credit) * (1 - discount/100)` and matches the pricing engine to the cent.
2. **Given** the SE enters a credit greater than the subtotal, **When** the system recalculates, **Then** the adjusted subtotal floors at 0 and the final total is 0.
3. **Given** a negative credit or discount outside [0, 100], **When** the SE attempts to save, **Then** Zod validation rejects the input with a field-level error; nothing is written to Supabase.
4. **Given** valid bid-sheet values, **When** the SE clicks Export, **Then** an `.xlsx` file downloads whose totals match the Bid Sheet view and whose adjustments are reflected on the correct line.

---

### User Story 4 — Add Scoped Services (Priority: P2)

An SE adds scoped service line items (non-migration services priced from the scoped-service catalog) to a proposal, optionally with a per-line complexity factor. The scoped total rolls into the proposal subtotal.

**Why this priority**: Scoped services are common but not every proposal has them. Losing scoped services would degrade the product, not break it.

**Independent Test**: Add a single scoped service line to a proposal; confirm the scoped total appears in the summary and the bid sheet, and that it changes with the scoped complexity factor.

**Acceptance Scenarios**:

1. **Given** a proposal, **When** the SE adds a scoped service with rate and hours, **Then** the scoped line cost matches `rate * hours * complexity_factor` and appears in the proposal subtotal.
2. **Given** a scoped service line, **When** the SE removes it, **Then** the proposal subtotal, bid sheet, and relevant reports update to reflect the removal.

---

### User Story 5 — Track Proposal Lifecycle (Priority: P2)

An SE moves a proposal through its lifecycle (e.g., Draft → Submitted → Won/Lost) via atomic status transitions. A status history is recorded for auditing and reports.

**Why this priority**: Lifecycle tracking enables portfolio reports, stale-proposal detection, and time-to-close metrics. Important, but not blocking for day-one pricing.

**Independent Test**: Transition a proposal from Draft to Submitted; verify the status history row is written, the change log reflects the actor, and the proposal appears in the correct report filters.

**Acceptance Scenarios**:

1. **Given** a proposal in an allowed source status, **When** the SE triggers a transition to an allowed target status, **Then** the transition commits atomically (single transaction) and a `proposal_status_history` row is written with the acting user.
2. **Given** a disallowed transition, **When** the SE attempts it, **Then** the server action rejects the change and the status is unchanged.

---

### User Story 6 — Run Portfolio Reports (Priority: P2)

An SE or sales leader opens reports (portfolio value, proposal hours, proposal log, scenario breakout, stale proposals, time-to-close) and sees consistent, reconciled numbers.

**Why this priority**: Reports are how sales leadership trusts the tool. Inconsistent numbers here destroy adoption, but reports depend on the core proposal data being correct first.

**Independent Test**: Load each report with seeded data; confirm that a single proposal's totals reconcile across Proposal Summary, Bid Sheet, and every report that aggregates it.

**Acceptance Scenarios**:

1. **Given** a proposal with known subtotal, credit, and discount, **When** it appears in the Portfolio Value report, **Then** the value shown equals the Bid Sheet final total.
2. **Given** a proposal that has been stale for longer than the threshold, **When** the SE opens the Stale Proposals report, **Then** that proposal is listed.

---

### User Story 7 — Administer Rate Cards, Service Hours, Users, and Theme (Priority: P3)

An admin manages the Supabase-backed lookup data (rate cards, service hours), user roles, customers, change log, and theme settings from the Admin area. All writes flow through server actions with role-gated access.

**Why this priority**: Admin work is occasional. It matters, but SEs can still use the tool while admin changes are pending.

**Independent Test**: As an admin, edit a single rate-card row; confirm the change persists, appears in the change log, and updates pricing on the next proposal load.

**Acceptance Scenarios**:

1. **Given** a non-admin user, **When** they navigate to `/admin/*`, **Then** access is denied at the middleware/route-guard layer.
2. **Given** an admin edits a rate card row, **When** they save, **Then** the write goes through a server action, RLS allows it, a change-log row is written, and the new value is used on the next pricing recalculation.

---

### Edge Cases

- Rate card or service-hours table returns zero rows → fail closed with a visible error; no hardcoded fallback prices.
- Supabase auth session expires mid-session → middleware redirects to login; no half-written mutations.
- Two SEs edit the same proposal simultaneously → last-writer-wins at the server-action level; audit log preserves both actors and timestamps.
- Proposal has a migration configured but the travel rate is later deleted from the rate card → migration page renders an error instead of silently zeroing travel cost.
- SE enters a complexity factor of 0 or a negative value → Zod rejects at input boundary.
- SE enters credit greater than subtotal, then also a discount → adjusted subtotal floors at 0, discount applies to 0, final total is 0.
- Proposal is deleted while another SE has the change-log page open → deletion is preserved in the change log (per migration `010_change_log_preserve_on_delete`).
- User attempts to merge a PR that touches `supabase/migrations/*.sql` via automation → automation must pause and surface the files before merging (per `AGENTS.md`).

## Requirements *(mandatory)*

### Functional Requirements

**Authentication & Authorization**

- **FR-001**: System MUST authenticate users via Supabase Auth and enforce the auth gate at the edge via `middleware.ts`.
- **FR-002**: System MUST expose authenticated pages under the `(app)` route group and unauthenticated pages under `(auth)`.
- **FR-003**: System MUST restrict `/admin/*` routes to users with the admin role, enforced at both route-guard and RLS layers.

**Proposals & Customers**

- **FR-010**: Users MUST be able to create, view, edit, and delete proposals tied to customer records.
- **FR-011**: System MUST apply global-read, owner-write RLS on proposals so any SE can view any proposal but only the owner (or admin) can write.
- **FR-012**: System MUST treat customers as shared-write so any SE can create or update customer records.
- **FR-013**: Users MUST be able to set a proposal-level complexity factor and a per-scenario complexity factor, both persisted.

**Scenario Pricing**

- **FR-020**: System MUST price each of six scenarios (P1, P2, P3, Opt1, Opt2, Opt3) using the pure calculation engine in `src/lib/calculations/engine.ts`.
- **FR-021**: System MUST compute each scenario line as a function of service-hours row, rate-card row, quantity, and complexity factor, with no pricing math in components.
- **FR-022**: System MUST hydrate rate cards and service-hours from Supabase before rendering any pricing UI; missing rows MUST produce an error card, not a default value.
- **FR-023**: System MUST allow users to save the scenario grid atomically through a server action.

**Migration**

- **FR-030**: Users MUST be able to configure migration parameters (line-item imports, document complexity, sections, travel, oversight) for a proposal.
- **FR-031**: System MUST compute migration hours and cost using `src/lib/calculations/migration-engine.ts`, rolling labor into the Sr. IM bucket and PM Oversight onto the PM side.
- **FR-032**: System MUST fail closed on migration pricing when any required rate-card row is missing (`Master|Sr. Implementation Manager`, `Master|Program Manager`, `Master|Travel Cost/Trip`).
- **FR-033**: Users MUST be able to edit individual migration rows via server actions; changes MUST appear in the change log.

**Scoped Services**

- **FR-040**: Users MUST be able to add, edit, and remove scoped service lines with a per-line complexity factor.
- **FR-041**: System MUST compute scoped service cost via `calculateScopedServiceCost` and include it in the proposal subtotal.

**Bid Sheet**

- **FR-050**: Users MUST be able to enter a `Credit` (dollars, `>= 0`) and a `Discount %` (between 0 and 100) on the Bid Sheet.
- **FR-051**: System MUST compute the Bid Sheet final total as `max(0, subtotal - credit) * (1 - discount/100)` — credit first, discount second.
- **FR-052**: System MUST reject negative credits and discounts outside [0, 100] at the Zod validation boundary before any Supabase write.
- **FR-053**: Users MUST be able to export a styled `.xlsx` Bid Sheet whose totals match the on-screen totals to the cent.

**Consistency**

- **FR-060**: Proposal Summary, Bid Sheet, and any report that aggregates a proposal MUST produce identical totals for the same inputs.
- **FR-061**: Total allocation across scenario / migration / scoped components MUST be performed by `allocateAdjustedTotal` so that the sum of parts equals the final total after rounding.

**Reports**

- **FR-070**: System MUST provide reports for portfolio value, proposal hours, proposal log, scenario breakout, stale proposals, and time-to-close.
- **FR-071**: Reports MUST read aggregated data from the same shared helpers used by the Proposal Summary and Bid Sheet.

**Proposal Lifecycle**

- **FR-080**: System MUST enforce allowed proposal status transitions and record each transition in `proposal_status_history` within a single atomic transaction.
- **FR-081**: System MUST attribute each status change to the acting user via `changed_by = auth.uid()`.

**Audit & Change Log**

- **FR-090**: System MUST write audit-log rows for privileged mutations with per-row `WITH CHECK (changed_by = auth.uid())` and database triggers.
- **FR-091**: System MUST preserve change-log entries even after the referenced proposal is deleted.

**Admin**

- **FR-100**: Admins MUST be able to CRUD rate cards, service hours, customers, and users from the `/admin` area, with all writes flowing through server actions.
- **FR-101**: Admin table writes MUST produce change-log entries attributing the change to the admin user.
- **FR-102**: Admins MUST be able to customize the UI theme; non-admins MUST NOT.

**Data Integrity & Validation**

- **FR-110**: System MUST validate every user input with Zod at the server-action boundary before any Supabase call.
- **FR-111**: System MUST return structured results (parsed by `parseSupabaseResult`) from server actions; raw Supabase errors MUST NOT leak to the UI.
- **FR-112**: System MUST treat all schema changes as numbered, append-only SQL files in `supabase/migrations/`.

**Exports**

- **FR-120**: System MUST generate `.xlsx` exports with `exceljs`, dynamic-imported so it is excluded from the initial JS bundle.
- **FR-121**: System MUST support PDF rendering via `@react-pdf/renderer` for applicable documents.

### Key Entities

- **Customer**: Organization the proposal is for. Shared-write across SEs.
- **Proposal**: Top-level record owned by an SE, referencing a customer. Carries proposal-level complexity factor and status. Global-read, owner-write.
- **Scenario (P1 / P2 / P3 / Opt1 / Opt2 / Opt3)**: Six variant price views on a proposal. Each has its own complexity factor and line items.
- **Scenario Line**: A single priced row in a scenario, derived from a service-hours row and a rate-card row.
- **Migration Configuration**: Per-proposal migration parameters driving the migration engine.
- **Migration Detail Line**: A computed or saved line inside a migration configuration (Sr. IM, PM Oversight, travel, etc.).
- **Scoped Service Line**: Non-migration scoped service added to a proposal, with its own complexity factor.
- **Bid Sheet**: Per-proposal adjustment record holding `credit` and `discount_pct` plus the derived final total.
- **Rate Card Row**: Supabase-managed lookup of cost rates keyed by role/tier.
- **Service Hours Row**: Supabase-managed lookup of hours-per-service.
- **Proposal Status History**: Append-only log of status transitions on a proposal, each attributed to the acting user.
- **Change Log Entry**: Audit record describing a privileged mutation; preserved even if the referenced record is deleted.
- **User**: Authenticated actor. Role determines admin access. RLS policies key off `auth.uid()`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any proposal, the final total shown on Proposal Summary, Bid Sheet, Portfolio Value report, and Scenario Breakout report is identical to the cent.
- **SC-002**: 100% of pricing math — scenario, migration, scoped, and bid-sheet — is covered by unit tests in `src/lib/calculations/__tests__/` and passes on every push.
- **SC-003**: When any required rate-card row is missing, the affected pricing UI shows a visible error card and no default value within the same render — a user never sees a fabricated number.
- **SC-004**: An SE can create a proposal, price all six scenarios, configure migration, apply bid-sheet adjustments, and export a bid sheet in a single session without consulting the legacy Excel workbook.
- **SC-005**: Every privileged mutation produces exactly one change-log entry attributed to the acting user.
- **SC-006**: 0 schema or migration PRs merge without an explicit human go-ahead (per `AGENTS.md`).
- **SC-007**: The initial JS bundle does not include `exceljs` or `xlsx`; both are confirmed dynamic-imported or dev-only.

## Assumptions

- SEs are the primary users and have stable internet connectivity at the time of use.
- Supabase projects are provisioned per environment with the migrations in `supabase/migrations/` applied in order.
- The seed workbook passed to `scripts/seed-lookup-data.ts` is the authoritative source for initial rate cards and service hours; ongoing edits happen in the Admin UI.
- Mobile is out of scope for v1; the app is designed for desktop browsers.
- Next.js 16 is a deliberate choice; contributors must read the bundled docs before framework-level changes (see `AGENTS.md`).
- The audit log is append-only at the application layer; compaction or archival is out of scope for v1.
- Multi-tenancy is out of scope. All users belong to a single TUC workspace.

## Open Questions / Clarifications Needed

Recommended follow-up with `/speckit-clarify` before planning any future changes:

- Authoritative list of allowed proposal status transitions and terminal states.
- Definition of "stale" for the Stale Proposals report (days? status-conditional?).
- Exact complexity-factor bounds (min/max) enforced in Zod.
- Whether bid-sheet credit is taxable in downstream accounting integrations (out of scope here, but called out).
- Retention policy for `change_log` and `proposal_status_history` rows.
