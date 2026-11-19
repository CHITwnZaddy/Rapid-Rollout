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
| Status | All + each proposal status value (plus the arrival preset when it covers several statuses, e.g. "All Open Statuses") |

### Dashboard presets

- Dashboard drill-down links arrive with `?status=open`, `?status=On Hold` or `?status=<stage>`, plus `scope` and `from=dashboard`. The `status` value **seeds the Status dropdown once** on arrival (`open` and comma lists appear as their own dropdown option, e.g. "All Open Statuses").
- After arrival the **dropdown overrides the preset**: the query always uses the dropdown's current value, and the "Applied preset" line drops its Status part once the dropdown no longer matches the preset.
- The report **auto-runs once per arrival URL**. Later filter changes do not re-run it; press **Run Report**. A new arrival URL (e.g. another dashboard link) re-seeds the filters and auto-runs again.
- Unknown `?status=` values are ignored; if none is a known status the dropdown falls back to **All**. This is a deliberate change: before, an unknown status returned 0 rows.
- `scope=mine` waits for the current user id before auto-running. `dateFrom`/`dateTo` are still read from the URL for hand-made links (dashboard links no longer send them).
- The XLSX subtitle reflects the current dropdown values (customer and status), not the arrival preset.

## Output columns (conceptual)

Includes: proposal id/name, customer, status, P1/P2/P3/Opt1/Opt2/Opt3 costs, scoped cost, migration cost, grand total, dates from status history, days in current status, scoped complexity factor.

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
