# Report: Stale Proposals

> **Route:** `/reports/stale-proposals`  
> **Module:** Reports  
> **Generated:** 2026-04-30

## Overview

Surfaces **in-flight proposals** that have stayed in their **current status** longer than **that status's threshold**. Thresholds are set per status in **Admin > Stale Thresholds** (`/admin/stale-thresholds`), so each stage can have its own limit. Closed statuses (Closed Won / Closed Lost) and On Hold are excluded from the stale concept by design.

The report classifies proposals exactly as the dashboard's **Needs follow-up** card does: the same live thresholds, the same strict `>` comparison, the same day count and the same fallback. With the same scope, the report's **Stale** bucket row count equals the dashboard's Needs follow-up count.

## Layout

- Filters: customer, status (defaults to **All** within the in-flight set), owner (**Team Proposals** / **My Proposals**), bucket (**All** / **Stale** / **Fresh**).
- **Run Report**.
- Results caption: "Amber = longer in the current status than that status's threshold (Discovery 21d · Scoping 21d · …). Edit thresholds in Admin > Stale Thresholds."
- Table grouped by status, with row colouring:
  - **amber** row and **Stale** badge when days in status `>` the status's threshold,
  - **green** row and **Fresh** badge when days in status `<=` the threshold,
  - **neutral** row (no badge) when the row is unclassified (see below).

## Status universe

In-flight statuses used by the report (`STALE_TRACKED_STATUSES`):

- Discovery
- Scoping
- Proposal Draft
- Sent for Review
- Negotiations
- Awaiting Sig

Filter dropdown options: **All** + the six statuses above.

## Thresholds

- Read from `proposal_stale_thresholds` on every **Run Report**, so admin edits show up without a page reload.
- Only **active** rows (`is_active = true`) count. An inactive or missing row means the status has **no threshold**.
- A proposal is **stale** when its days in status are **strictly greater than** its status's threshold. Exactly at the threshold is **fresh** (e.g. 21 days in Discovery with a 21-day threshold is fresh; 22 days is stale).
- Rows whose status has no threshold show **No threshold** in the Threshold column and are **unclassified**: they appear only under the **All** bucket, never under Stale or Fresh.

## Row fields

| Field | Meaning |
|-------|---------|
| Proposal | Name / link |
| Customer | Company (— when none) |
| Status | Current proposal status |
| Days in status | America/Chicago calendar days since the latest status-history transition; falls back to the proposal's `created_at` when it has no status history |
| Threshold | `> N days` from the status's active threshold, or **No threshold** |
| Last activity | Latest status-history transition; falls back to `created_at` when there is no history |

- Day counts are **America/Chicago calendar days** (date changes, not 24-hour periods), so a change made late in the evening in Chicago counts from that Chicago date, and daylight-saving changes do not skew the count.
- The `created_at` fallback matches the dashboard (`lastChangedAt ?? created_at`). It applies only when a proposal has no status history at all.

## Interactions

### Run Report

- Loads proposals (with `created_at`), the active stale thresholds and the status history map.
- Filters to in-flight statuses unless the user narrows further.
- Classifies each row against its status's threshold, applies the bucket filter, then sorts by status (canonical status order) and Proposal Name A→Z.
- **No date window**: stale is a **current snapshot** of the pipeline. Any `range` / `dateFrom` / `dateTo` in the URL is ignored.

### Dashboard preset

- The dashboard's **Needs follow-up** card links here with `scope`, `bucket=stale` and `from=dashboard` (no dates).
- The preset seeds the Owner and Bucket filters (and Status when a `status` parameter is present), the report runs automatically, and an **Applied preset** line plus a **Return to Dashboard** link are shown.

### Export

- Excel export adds a **Threshold (days)** column (blank when the status has no threshold).
- Rows get a red/green fill for stale/fresh; unclassified rows keep the normal striping.
- The subtitle states the rule and the thresholds used, e.g. "Stale when Days in Status > that status's threshold (Discovery 21d · Scoping 21d · …)".

## API dependencies

`fetchReportProposals`, `fetchStaleThresholds`, `fetchStatusHistoryMap`, customer list. Row logic lives in `buildStaleReportRows` (`src/lib/reports/stale-proposals.ts`).

## Page relationships

- **From:** Reports hub; dashboard **Needs follow-up** card.
- **To:** each proposal (`/proposals/<id>`); thresholds are edited in Admin > Stale Thresholds.

## Business rules

- Closed Won / Closed Lost intentionally **not** “stale” — long-lived closed deals are expected. On Hold is not stale-tracked either.
- Stale is a current snapshot, not a date-range metric.
