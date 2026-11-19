# Proposal Dashboard

> **Route:** `/dashboard`  
> **Module:** Dashboard  
> **Generated:** 2026-04-30 · **Rewritten:** 2026-11-19 (pipeline snapshot, Closed Won by LoE signed date, Chicago business day)

## Overview

A sales-ops view of the proposal pipeline and closed revenue for **my** or the **team's** proposals. It mixes two kinds of numbers:

- **Pipeline snapshot.** Open proposal value, value and count by stage, Needs follow-up and On hold show **every open proposal today**, whatever date range is selected.
- **Closed revenue.** Target progress, the closed-won line and Closed price variance count **Closed Won** deals by their **LoE signed date**. Target progress always covers the whole **target year** (year to date). Only the closed-won line and the price variance follow the selected date range.

The page renders on the server on every request (`export const dynamic = "force-dynamic"`), because it reads the signed-in user and live data.

## Layout

- **Header:** title **Proposal Dashboard**, a scope badge (**My proposals** / **Team proposals**), a **Closed won: &lt;window label&gt;** badge, a one-line description of the snapshot vs. closed-revenue split, and the **New Proposal** button (`/proposals/new`).
- **Filters card:** scope toggle (My proposals / Team proposals) and date range (Current year / Current quarter / Custom range with From and To date inputs and **Apply**).
- **Widget grid (2 columns):** Open proposal value, Needs follow-up, On hold, Target progress.
- **Charts (2 columns):** Value by stage, Count by stage.
- **Closed price variance** card.

## Query parameters

| Param | Values | Effect |
|-------|--------|--------|
| `scope` | `mine`, `team` | `mine` keeps proposals whose `created_by` is the current user; `team` keeps all. Default is `team` for the manager and admin roles and `mine` otherwise. Any signed-in user can pick `team`: the proposals SELECT policy lets every authenticated user read all proposals. Any other value falls back to the default. |
| `range` | `current-year` (default), `current-quarter`, `custom` | Picks the date window. Any other value falls back to `current-year`. |
| `dateFrom`, `dateTo` | `YYYY-MM-DD` | Read only when `range=custom`. Each must be a real calendar date (for example `2026-02-30` is rejected). A missing or invalid value falls back to Jan 1 / Dec 31 of the current year, so a bad URL never reaches the database. |

Array values (a repeated param) use the first value.

## Date window

"Today" is the **America/Chicago** calendar date (`BUSINESS_TIME_ZONE`), not the server's UTC date, so the year and quarter do not roll over early on the evening of Dec 31 or a quarter's last day.

| Range | Window | Label | Target year |
|-------|--------|-------|-------------|
| Current year | Jan 1 – Dec 31 of this year | `2026` | this year |
| Current quarter | first – last day of this quarter | `Q4 2026` | this year |
| Custom | `dateFrom` – `dateTo` (inclusive) | `2026-01-01 to 2026-03-31` | the year of `dateFrom` |

## Widgets

### Pipeline snapshot (ignores the date window)

The pipeline is every proposal in an open status (`OPEN_PROPOSAL_STATUSES`: Discovery, Scoping, Proposal Draft, Sent for Review, Negotiations, Awaiting Sig, **On Hold**), filtered only by scope. It is read from the `proposal_revenue_report_base` view with no date filter, so a proposal created in an earlier year still counts.

| Widget | Meaning |
|--------|---------|
| **Open proposal value** | Sum of each open proposal's value: the P1, P2, P3, Opt1, Opt2 and Opt3 scenario costs, plus the scoped-services total, plus the migration cost. |
| **Value by stage** | The same value per open status. Statuses with no value are hidden. Empty state: "No open pipeline value." |
| **Count by stage** | Number of open proposals per status. Statuses with no proposals are hidden. Empty state: "No open proposals." |
| **Needs follow-up** | Open proposals whose **days in current status** are **greater than** (strict `>`) the active threshold for their status in `proposal_stale_thresholds` (`is_active = true`). Days are whole America/Chicago calendar days since the latest status change in `proposal_status_history`, or since `created_at` when the proposal has no history. On Hold is not stale-tracked, and a status with no active threshold is never stale. The Stale Proposals report uses the same thresholds and the same rule. |
| **On hold** | Number of open proposals in **On Hold**. |

Pipeline rows never carry closeout values (sold price, LoE value, LoE signed date). A deal reopened from Closed Won can still hold its old values in the database; they do not count anywhere on the dashboard until it is Closed Won again.

### Closed revenue (Closed Won by LoE signed date)

Only **Closed Won** proposals count, by `proposals.loe_signed_date`. That column is a `DATE` with no time zone, so it is compared as a plain `YYYY-MM-DD` date, inclusive at both ends. Closed Lost is never counted.

| Widget | Meaning |
|--------|---------|
| **Target progress** (title: "Target progress (&lt;year&gt; year to date)") | Closed Won sold price with an LoE signed date from Jan 1 to Dec 31 of the **target year**, divided by the target, shown as a percent to one decimal with a bar capped at 100%. This always uses the whole target year, even when the range is the current quarter or a custom range. A missing sold price counts as 0. With no target (0), progress is 0%. |
| ↳ Annual target | `kpi_user_targets.target_amount` (scope `mine`: active row for the target year and the current user) or `kpi_year_targets.team_quota` (scope `team`: active row for the target year). Missing rows count as 0. |
| ↳ Annual remaining | Annual target minus the target-year Closed Won sold price, never below 0. |
| ↳ Closed won (&lt;window label&gt;) | Closed Won sold price with an LoE signed date inside the **selected window**. |
| **Closed price variance** (subtitle "Closed Won, LoE signed &lt;window label&gt;") | For Closed Won deals with an LoE signed date inside the **selected window** and both a sold price and an LoE value: variance = `loe_value − sold_price`. Shows the net variance, **Over** (variance > 0: count / total), **Even** (count) and **Under** (variance < 0: count / total). |

The page reads Closed Won rows once, over the union of the selected window and the target year (from the earlier of the window start and Jan 1, to the later of the window end and Dec 31), and then filters them in memory for each figure.

**Closed Won deals with no LoE signed date are left out** of target progress, the closed-won line and the variance. The app requires the date when a deal is closed, and none exist today, so no warning is shown.

## Drill-downs

The pipeline widgets link to reports. Links carry only `scope` and `from=dashboard`, plus the status or bucket. They never carry `range`, `dateFrom` or `dateTo`, because those widgets are a snapshot.

| Widget | Link |
|--------|------|
| Open proposal value | `/reports/proposal-log?scope=<scope>&from=dashboard&status=open` |
| Needs follow-up | `/reports/stale-proposals?scope=<scope>&from=dashboard&bucket=stale` |
| On hold | `/reports/proposal-log?scope=<scope>&from=dashboard&status=On+Hold` |
| A bar in Value by stage or Count by stage | `/reports/proposal-log?scope=<scope>&from=dashboard&status=<stage>` |

Target progress and Closed price variance are not links: Proposal Log cannot filter by LoE signed date.

## Interactions

- **Scope toggle** links to `/dashboard?scope=<scope>&range=<range>`, keeping `dateFrom` and `dateTo` when the range is custom.
- **Current year / Current quarter** link to `/dashboard?scope=<scope>&range=<range>`.
- **Custom range** is a GET form to `/dashboard` with `scope`, `range=custom`, `dateFrom` and `dateTo`. The inputs show the window in use, including any fallback dates.
- **New Proposal** goes to `/proposals/new`.
- If any query fails (including missing migration rates), the header and filters still render, followed by an **Unable to load dashboard data** card with the error message.

## API dependencies

| Data | Source | Fetcher |
|------|--------|---------|
| Pipeline | view `proposal_revenue_report_base`, `status in OPEN_PROPOSAL_STATUSES`, owner filter for `mine` | `fetchRevenueReportBaseRows` |
| Closed Won | table `proposals`: `id, status, created_by, sold_price, loe_value, loe_signed_date`, `status = 'Closed Won'`, owner filter for `mine`, `loe_signed_date` between the bounds above | `fetchClosedWonFinancials` |
| Stale thresholds | `proposal_stale_thresholds` where `is_active` | `fetchStaleThresholds` (shared with Stale Proposals) |
| Status history | `proposal_status_history` for the pipeline ids | `fetchStatusHistoryMap` |
| Migration cost | `migration_config`, `migration_detail_lines`, `rate_cards` for the pipeline ids | `fetchMigrationCostInputs` + `buildMigrationCostMap` |
| Target | `kpi_user_targets` or `kpi_year_targets` | `fetchTargetAmount` (in the page) |

The pipeline, Closed Won, thresholds and target queries run in parallel; status history and migration cost follow, for the pipeline ids only.

## Time zone

- The business time zone is **America/Chicago** (`BUSINESS_TIME_ZONE` in `src/lib/dates/business-day.ts`). It sets "today", the year and quarter presets, the target year and the days-in-status count.
- `loe_signed_date` is a plain date with no time zone; it is never shifted.

## Page relationships

- **Inbound:** sidebar **Dashboard**, the app root (`/` redirects here), and login / set-password.
- **Outbound:** Proposal Log and Stale Proposals (drill-downs), New Proposal.
