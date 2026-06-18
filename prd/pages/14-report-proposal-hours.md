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
