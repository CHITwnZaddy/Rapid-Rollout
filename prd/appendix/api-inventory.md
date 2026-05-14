# Appendix: API & Data Surface Inventory

The application uses **Supabase** (Postgres + Auth). There is no separate REST API layer; the Next.js app calls Supabase from server components, client components, and server actions.

## Authentication

| Operation | Mechanism |
|-----------|-----------|
| Sign in | `supabase.auth.signInWithPassword` |
| Sign up | `supabase.auth.signUp` with `options.data.full_name` |
| Session refresh | `@supabase/ssr` cookie middleware (`updateSession`) |
| Sign out | `supabase.auth.signOut` |

## Database tables (public schema)

| Table | Purpose |
|-------|---------|
| `customers` | Customer master data |
| `proposals` | Proposal header: name, customer, status, notes, scoped complexity factor, creator |
| `scenarios` | Per-proposal scenario rollup row (type P1/P2/Opt1/Opt2) |
| `scenario_lines` | Line-level grid for each scenario |
| `scoped_services` | Non-grid add-on service lines |
| `migration_config` | One row per proposal: migration drivers and computed snapshot |
| `migration_detail_lines` | Detailed migration breakdown lines |
| `bid_sheets` | One row per proposal: scenario hour/cost slots, migration/scoped totals, discounts, notes |
| `rate_cards` | Rate catalog |
| `service_hours` | Hours-per-module catalog |
| `change_log` | Audit entries |
| `proposal_status_history` | Status transition history |

Source shape: `src/types/database.ts`

## Database views

| View | Purpose |
|------|---------|
| `proposal_revenue_report_base` | Reporting base row: proposal + customer + scenario/scoped cost columns |

## RPC (Postgres functions exposed to client)

| RPC | Purpose |
|-----|---------|
| `create_proposal_bundle` | Creates proposal bundle (returns new proposal UUID); inputs: name, optional customer id |
| `save_scenario_grid` | Persists scenario lines + summary totals atomically |
| `transition_proposal_status` | Validates and applies proposal status change with history |

## Admin user operations

User invite / role / delete are implemented via **server actions** that call Supabase admin APIs (see `src/app/(app)/admin/users/actions.ts`) — not anonymous-client callable without service credentials.

## External integrations

- **Google Fonts** (optional): Theme page loads font CSS dynamically when a non-default font is chosen.

## Report data helpers

Client reports import **`fetchRevenueReportBaseRows`**, **`fetchMigrationCostInputs`**, **`fetchStatusHistoryMap`**, **`fetchReportProposals`**, etc., from `src/lib/reports/data.ts` — these encapsulate Supabase queries used by multiple reports.

---

For field-level validation rules, see per-page PRD files and Zod schemas under `src/lib/validation/`.
