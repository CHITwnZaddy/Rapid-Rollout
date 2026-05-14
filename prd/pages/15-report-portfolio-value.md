# Report: Portfolio Value

> **Route:** `/reports/portfolio-value`  
> **Module:** Reports  
> **Generated:** 2026-04-30

## Overview

Shows **pipeline economics** per proposal: scenario total, scoped total, migration total, and **grand total**, with complexity-adjusted math consistent with other portfolio reports. Defaults to **My** proposals and **excludes Lost and VOID** unless the user opts in.

## Layout

- Filters: owner (**All** / **Mine** — default **Mine**), checkbox/toggle **include Lost** (wording per UI).
- **Run Report** button.
- Results table + Excel export path.

## Filters

| Filter | Behavior |
|--------|----------|
| Owner | When **Mine**, restricts to `created_by` current user |
| Include Lost | When off, `excludeStatuses: ["Lost", "VOID"]` |

## Output columns (conceptual)

Proposal id/name, customer, status, scenarioTotal, scopedTotal, migrationTotal, grandTotal.

## Interactions

### Run Report

- Resolves current user id from `auth.getUser`.
- Calls `fetchRevenueReportBaseRows` with owner + exclude filters.
- Computes migration totals via `fetchMigrationCostInputs` + `buildMigrationCostMap`.
- Aggregates scoped/migration/scenario per proposal logic in page.

### Export

- ExcelJS workbook with formatting.

## API dependencies

View `proposal_revenue_report_base` via helper fetch; migration inputs; auth session.

## Page relationships

- **From:** Reports hub.

## Business rules

- Default **Mine** emphasizes personal portfolio per product note in code.
