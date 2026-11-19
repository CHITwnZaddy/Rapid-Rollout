# Report: Proposal Hours

> **Route:** `/reports/proposal-hours`  
> **Module:** Reports  
> **Generated:** 2026-04-30

## Overview

Lists **hours by role** (Sr. IM, PM, BA) for proposals across **scenario lines**, **scoped services**, and **migration**, with filters for customer, scenario bucket, and owner.

## Layout

- Title **Proposal Hours** (per page implementation).
- Filter card: customer, scenario filter, owner (**All** / **Mine**), **Run Report**.
- Results table with columns for proposal, customer, scenario/bucket label, Sr. IM hours, PM hours, BA hours, total hours.
- Excel export after run.

## Filters

| Filter | Values |
|--------|--------|
| Customer | All + customers |
| Scenario | All, Phase 1, Phase 2, Phase 3, Option 1, Option 2, Option 3, Scoped Services, Migration Services |
| Owner | All, Mine |

## Row model

Each row represents a proposal plus either a scenario code or synthetic buckets **Scoped Services** / **Migration Services**, with aggregated role hours and total.

- A scenario row appears only when that scenario has non-zero Sr. IM, PM or BA hours — the same rule as the **Scoped Services** and **Migration Services** buckets. Every proposal is created with all six scenarios, so empty ones are suppressed rather than listed as 0-hour rows.
- A proposal with no hours anywhere produces no rows.
- The Scenario filter is applied after suppression, so picking a scenario with no hours shows the empty state.
- Each row's **Proposal Name** links to its proposal (`/proposals/<proposal id>`); the row's own id is `<proposal id>:<scenario or bucket>` so it is unique per row.
- Logic lives in `buildProposalHoursRows` (`src/lib/reports/proposal-hours.ts`).

## Interactions

### Run Report

- Fetches proposals via `fetchReportProposals` with customer + owner filters.
- Pulls aggregate inputs via `fetchHoursAggregateInputs`.
- Builds scoped and migration hour maps via `buildScopedHoursMap` / `buildMigrationHoursMap`.
- Toast on failure.

### Export

- Excel workbook aligned with table using ExcelJS.

## API dependencies

Supabase queries behind `src/lib/reports/data.ts` and aggregate builders.

## Page relationships

- **From:** Reports hub only.

## Business rules

- Scenario labels use `getScenarioDisplayName` for P1/P2/P3/Opt1/Opt2/Opt3.
