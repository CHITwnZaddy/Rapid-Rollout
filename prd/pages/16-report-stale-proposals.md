# Report: Stale Proposals

> **Route:** `/reports/stale-proposals`  
> **Module:** Reports  
> **Generated:** 2026-04-30

## Overview

Surfaces **in-flight proposals** that have remained in their **current status** longer than a threshold (**21 days**). Closed statuses (Won/Lost/VOID) are excluded from the stale concept by design.

## Layout

- Filters: customer, status (defaults to **All** within in-flight set), owner (**All** / **Mine**).
- **Run Report**.
- Table with coloring: **red** when `daysInStatus > 21`, otherwise **green** indicator when threshold column applies.

## Status universe

In-flight statuses used by report:

- Draft
- Proposal Sent
- Customer Review

Filter dropdown options: **All** + above three.

## Row fields

| Field | Meaning |
|-------|---------|
| Proposal | Name / link |
| Customer | Company |
| Status | Current proposal status |
| Days in status | Derived from status history |
| Last activity | Derived date |

## Interactions

### Run Report

- Loads proposals + status history map.
- Filters to in-flight statuses unless user narrows further.
- Computes streak in current status vs threshold **STALE_THRESHOLD_DAYS = 21**.

### Export

- Excel export includes conditional fill consistent with on-screen red/green threshold.

## API dependencies

`fetchReportProposals`, `fetchStatusHistoryMap`, customer list.

## Page relationships

- **From:** Reports hub.

## Business rules

- Won/Lost intentionally **not** “stale” — long-lived closed deals are expected.
