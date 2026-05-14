# Rapid Rollout — Product Requirements Document

## System Overview

**Rapid Rollout** is a web application for building and pricing professional-services proposals focused on rapid rollout and migration work. Teams create proposals tied to customers, model multiple pricing scenarios (four fixed scenario types), layer scoped add-on services and migration-based estimates, and consolidate everything on a bid sheet with discounts and customer selection. A reporting area supports pipeline and operational views (proposal log, hours, portfolio value, stale deals, time to close, and a deep scenario breakout). **Supabase** provides authentication, row-level security, and persistence; **Next.js** delivers the user interface and server actions.

**Primary users:** sales engineers, solution consultants, and delivery leadership who author proposals; **administrators** who maintain rate cards, service-hour templates, customer master data, and user roles.

**Business context:** the product turns structured assumptions (module/scope grids, rate cards, migration parameters) into consistent hours, internal cost, and customer-facing price rollups, with an audit trail for sensitive actions.

---

## Functional Requirements

This section states what the system **must** do, in testable form. IDs are stable references for traceability to pages and data.

| ID | Requirement |
|----|-------------|
| **FR-AUTH-1** | The system shall allow a user to sign in with email and password via Supabase Auth. |
| **FR-AUTH-2** | The system shall allow a new user to register with full name, email, and password (minimum six characters). |
| **FR-AUTH-3** | Unauthenticated users requesting any route except `/`, `/login`, and `/signup` shall be redirected to `/login`. |
| **FR-AUTH-4** | Authenticated users navigating to `/login` or `/signup` shall be redirected to `/dashboard`. |
| **FR-AUTH-5** | The root path `/` shall send authenticated users to `/dashboard` and unauthenticated users to `/login`. |
| **FR-AUTH-6** | The user shall be able to sign out from the sidebar; signing out shall end the session and navigate to login. |
| **FR-ROLE-1** | Users whose JWT `app_metadata.role` is `admin` shall access routes under `/admin/*`; all others shall be redirected to `/dashboard` when visiting `/admin/*`. |
| **FR-ROLE-2** | The sidebar shall show an **Admin** navigation section only after admin role is confirmed (no flash of admin links for non-admins during session load). |
| **FR-CUST-1** | Any authenticated user shall view the **Customers** list at `/customers` in a table with create, inline edit, and delete for customer records. |
| **FR-CUST-2** | Customer records shall support company name (required) and optional address fields (line1, line2, city, state, zip). |
| **FR-PROP-1** | The system shall list all proposals the current user can read (per RLS) at `/proposals`, ordered by most recently updated, with New Proposal CTA. |
| **FR-PROP-2** | Creating a proposal shall require a non-empty proposal name (trimmed, max 200 characters) and optional customer (valid UUID or none). |
| **FR-PROP-3** | Successful creation shall invoke the `create_proposal_bundle` database routine and navigate to the new proposal’s detail area. |
| **FR-PROP-4** | Each proposal shall expose sub-areas: Summary, Bid Sheet, four scenario tabs (Phase 1, Phase 2, Option 1, Option 2), Scoped Services, and Migration Services. |
| **FR-PROP-5** | The proposal header shall show name, customer (or “No customer”), a status control, and a delete action. |
| **FR-STATUS-1** | Proposal status shall be one of: Draft, Proposal Sent, Customer Review, Won, Lost, VOID. |
| **FR-STATUS-2** | Changing status shall require the user to select a new value and click **Save**; the system shall call `transition_proposal_status` so the proposal row and status history stay consistent. |
| **FR-STATUS-3** | Invalid status values shall be rejected with an error message. |
| **FR-DEL-1** | Deleting a **Draft** proposal shall use a confirmation dialog, then a justification and typed phrase `DELETE {proposal name}` before the server performs deletion. |
| **FR-DEL-2** | Deleting a non-draft “in flight” proposal shall add an initial warning step (Proposal Sent, Customer Review, Won, Lost, VOID) before the same justification and typed-confirmation step. |
| **FR-DEL-3** | Successful deletion shall record audit context and redirect to `/proposals`. |
| **FR-SCEN-1** | Each scenario tab shall load grid lines from `scenario_lines` and allow editing per active `service_hours` and `rate_cards` catalog rows. |
| **FR-SCEN-2** | Each scenario shall support a **complexity factor** constrained between **0.50** and **9.99** (inclusive); invalid values shall be rejected. |
| **FR-SCEN-3** | Saving the scenario grid shall use the `save_scenario_grid` RPC with line payload and summary totals. |
| **FR-SCOPE-1** | Scoped services shall allow adding, updating, and deleting lines; each line has a fixed enum **service type**, optional description (max 5000 chars), non-negative hours, and a rate-card lookup key driving computed cost. |
| **FR-SCOPE-2** | The proposal shall support a **scoped complexity factor** applied to scoped service rollups (see pricing engine on Summary). |
| **FR-MIG-1** | Migration services shall load and edit `migration_config` and `migration_detail_lines` without auto-creating missing records (errors surface data problems). |
| **FR-MIG-2** | Migration pricing shall require loadable Sr. IM, PM, and Travel rates from the rate card; if missing, the page blocks saves and shows remediation guidance. |
| **FR-BID-1** | The bid sheet shall display scenario totals, migration and scoped rollups, internal cost/margin logic, and support customer selection, discount percent, discount dollars, free-text notes, and persistence via server actions. |
| **FR-BID-2** | Summary page margin display shall require pricing-critical rate rows (including internal cost rate); if unavailable, the page shall refuse to render misleading margins. |
| **FR-REP-1** | The reports hub shall link to six operational reports with descriptions matching implemented behavior. |
| **FR-REP-2** | **Proposal Log** shall support filters (customer, status), compute grand totals including migration and scoped costs, and support export. |
| **FR-REP-3** | **Portfolio Value** shall default to **My** proposals, exclude Lost/VOID unless opted in, and group pipeline value by status with complexity-adjusted totals. |
| **FR-REP-4** | **Stale Proposals** shall consider only in-flight statuses (Draft, Proposal Sent, Customer Review); rows exceeding **21** days in current status shall highlight as stale. |
| **FR-REP-5** | **Time to Close** shall measure days from Proposal Sent to Won/Lost; rows closed in more than **30** days shall highlight as slow. |
| **FR-ADMIN-1** | Admins shall maintain **rate cards** and **service hours** in spreadsheet-like tables (CRUD) with revalidation of admin paths. |
| **FR-ADMIN-2** | Admins shall maintain customers under `/admin/customers` with the same column model as `/customers`. |
| **FR-ADMIN-3** | Admins shall invite users by email, assign role `admin` or `user`, update roles, and delete users via server-side integrations. |
| **FR-ADMIN-4** | Admins shall view the latest **100** change-log entries with table, action, record, justification/deletion metadata, and deleted-by email when present. |
| **FR-ADMIN-5** | **Theme** settings shall be stored in **browser local storage** (not the database), with presets, custom colors, and font selection applied to the client session. |
| **FR-DASH-1** | The dashboard shall show total, draft, submitted (non-draft), and “my proposals” counts; cards shall filter the recent-proposals list. |
| **FR-DASH-2** | Recent proposals (up to 10) shall show name, customer, status badge, and best-scenario cost (lowest positive complexity-adjusted scenario cost when available). |

### Out of scope / [TBC]

- **Password reset and email verification flows** are not described in the current UI; behavior depends on Supabase project settings.
- **Exact RLS rules** per table: enforced in Supabase; this PRD assumes authenticated reads/writes align with deployment policies.

---

## Module Overview

| Module | Primary routes | Core functionality |
|--------|----------------|-------------------|
| Authentication | `/login`, `/signup`, `/` | Sign-in, registration, session redirects |
| Dashboard | `/dashboard` | KPI cards, filtered recent proposals |
| Proposals | `/proposals`, `/proposals/new`, `/proposals/[id]/*` | CRUD bundle, scenarios, scoped services, migration, bid sheet, summary |
| Customers | `/customers` | Shared customer directory CRUD |
| Reports | `/reports/*` | Proposal log, breakout, hours, portfolio, stale, time-to-close |
| Admin | `/admin/*` | Rate cards, service hours, admin customers, users, audit log, theme |

---

## Page Inventory

| # | Page name | Route | Module | Doc |
|---|-----------|-------|--------|-----|
| 1 | Home (redirect) | `/` | Auth | [→](./pages/01-home-and-auth.md) |
| 2 | Login | `/login` | Auth | [→](./pages/01-home-and-auth.md) |
| 3 | Sign up | `/signup` | Auth | [→](./pages/01-home-and-auth.md) |
| 4 | Dashboard | `/dashboard` | Dashboard | [→](./pages/02-dashboard.md) |
| 5 | Proposals list | `/proposals` | Proposals | [→](./pages/03-proposals-list.md) |
| 6 | New proposal | `/proposals/new` | Proposals | [→](./pages/04-new-proposal.md) |
| 7 | Proposal summary | `/proposals/[id]` | Proposals | [→](./pages/05-proposal-summary.md) |
| 8 | Bid sheet | `/proposals/[id]/bid-sheet` | Proposals | [→](./pages/06-bid-sheet.md) |
| 9 | Scenario grid (×4) | `/proposals/[id]/scenarios/P1` … `Opt2` | Proposals | [→](./pages/07-scenario-grids.md) |
| 10 | Scoped services | `/proposals/[id]/scoped-services` | Proposals | [→](./pages/08-scoped-services.md) |
| 11 | Migration services | `/proposals/[id]/migration` | Proposals | [→](./pages/09-migration-services.md) |
| 12 | Customers | `/customers` | Customers | [→](./pages/10-customers.md) |
| 13 | Reports hub | `/reports` | Reports | [→](./pages/11-reports-hub.md) |
| 14 | Proposal log report | `/reports/proposal-log` | Reports | [→](./pages/12-report-proposal-log.md) |
| 15 | Scenario breakout report | `/reports/scenario-breakout` | Reports | [→](./pages/13-report-scenario-breakout.md) |
| 16 | Proposal hours report | `/reports/proposal-hours` | Reports | [→](./pages/14-report-proposal-hours.md) |
| 17 | Portfolio value report | `/reports/portfolio-value` | Reports | [→](./pages/15-report-portfolio-value.md) |
| 18 | Stale proposals report | `/reports/stale-proposals` | Reports | [→](./pages/16-report-stale-proposals.md) |
| 19 | Time to close report | `/reports/time-to-close` | Reports | [→](./pages/17-report-time-to-close.md) |
| 20 | Admin landing | `/admin` | Admin | [→](./pages/18-admin-landing.md) |
| 21 | Admin rate cards | `/admin/rate-cards` | Admin | [→](./pages/19-admin-rate-cards.md) |
| 22 | Admin service hours | `/admin/service-hours` | Admin | [→](./pages/20-admin-service-hours.md) |
| 23 | Admin customers | `/admin/customers` | Admin | [→](./pages/21-admin-customers.md) |
| 24 | Admin users | `/admin/users` | Admin | [→](./pages/22-admin-users.md) |
| 25 | Admin change log | `/admin/change-log` | Admin | [→](./pages/23-admin-change-log.md) |
| 26 | Admin theme | `/admin/theme` | Admin | [→](./pages/24-admin-theme.md) |

---

## Global Notes

### Permission model

- **Authenticated user:** default role; can use main app routes gated by middleware.
- **Admin:** `user.app_metadata.role === "admin"` (JWT). Server-side admin layout enforces this for `/admin/*`. Client-side admin UI uses `useRequireAdmin()` to avoid incorrect flashes during loading; **not** a security boundary by itself.
- **Data access:** Supabase RLS and policies determine which rows are visible; the proposals list comment in code notes proposals can be globally readable for certain workflows—treat as deployment-specific.

### Common interaction patterns

- **Toast notifications** (`sonner`) for async success and failure on many actions.
- **Server actions** for mutations with `revalidatePath` where applicable.
- **Fail-closed pricing:** summary and migration views refuse to show numbers if required rate-card keys are missing, rather than defaulting to zero.
- **Status history:** committed through `transition_proposal_status` RPC only (not ad-hoc client updates to the proposal row).
- **Proposal bundle creation:** always via `create_proposal_bundle` RPC to ensure child records exist consistently.

### Related documents

- [Enum & constants dictionary](./appendix/enum-dictionary.md)
- [Page relationships & navigation](./appendix/page-relationships.md)
- [API & data surface inventory](./appendix/api-inventory.md)

---

**Generated:** 2026-04-30 (from codebase reverse-engineering)
