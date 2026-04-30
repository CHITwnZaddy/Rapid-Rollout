# Report: Proposal Log

> **Route:** `/reports/proposal-log`  
> **Module:** Reports  
> **Generated:** 2026-04-30

## Overview

Tabular **portfolio listing** of proposals with customer, status, per-scenario costs, scoped cost, migration cost, **grand total**, and timeline columns (created, proposal sent, won, days in current status). Supports **customer** and **status** filters and **Excel export**.

## Layout

- Filter card: customer select, status select, **Run Report** button.
- Results table when `hasRun`.
- Export control after successful run (implementation uses ExcelJS).

## Filters

| Field | Options |
|-------|---------|
| Customer | All + each customer |
| Status | All + each proposal status value |

## Output columns (conceptual)

Includes: proposal id/name, customer, status, P1/P2/Opt1/Opt2 costs, scoped cost, migration cost, grand total, dates from status history, days in current status, scoped complexity factor.

## Interactions

### Run Report

- Loads base rows via `fetchRevenueReportBaseRows` with filters.
- Builds migration cost map via `fetchMigrationCostInputs` + `buildMigrationCostMap`.
- Joins status history via `fetchStatusHistoryMap`.
- Toast on errors.

### Export

- Generates workbook reflecting on-screen rows with formatting.

## API dependencies

Supabase reads on customers, proposals view/helpers, migration inputs, status history — encapsulated in `src/lib/reports/data.ts` and aggregates.

## Page relationships

- Drill-down is **[TBC]** — table may link to proposal detail depending on column rendering (verify in component).

## Business rules

- Uses same status vocabulary as proposal enums.
