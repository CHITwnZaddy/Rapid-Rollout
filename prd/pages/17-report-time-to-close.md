# Report: Time to Close

> **Route:** `/reports/time-to-close`  
> **Module:** Reports  
> **Generated:** 2026-04-30

## Overview

Measures **elapsed days** from **Proposal Sent** to **closed outcome** (Won or Lost), with filters for customer, outcome status subset, owner, and **sent date range**.

## Layout

- Filters: customer, status (All, Won, Lost, Proposal Sent, Customer Review), owner (**All** / **Mine**), **from** and **to** date inputs for sent date window.
- **Run Report**.
- Table rows colored **red** when days to close **>** **30**, **green** when ≤ 30 (only when closed).

## Row fields

| Field | Meaning |
|-------|---------|
| Proposal | Identifier |
| Customer | Company |
| Owner | Created-by display **[TBC exact format]** |
| Status | Current / outcome |
| Date sent | First transition to Proposal Sent |
| Date closed | Won/Lost timestamp |
| Days to close | Difference |
| Threshold flag | Red/green |

Constants: **CLOSE_THRESHOLD_DAYS = 30**.

## Interactions

### Run Report

- Uses `fetchReportProposals` + `fetchStatusHistoryMap`.
- Applies `withinRange` helper on sent date vs selected range.

### Export

- ExcelJS with conditional formatting aligned to **CLOSE_THRESHOLD_DAYS**.

## API dependencies

Same reporting data helpers as other operational reports.

## Page relationships

- **From:** Reports hub.

## Business rules

- Threshold applies only when a row has a computed close — open proposals may show null threshold coloring per implementation.
