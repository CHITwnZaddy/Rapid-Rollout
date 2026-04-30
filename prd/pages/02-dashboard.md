# Proposal Dashboard

> **Route:** `/dashboard`  
> **Module:** Dashboard  
> **Generated:** 2026-04-30

## Overview

The dashboard gives at-a-glance **proposal counts** (total, drafts, submitted, mine) and a **recent proposals** list (up to 10) that respects an optional filter from query params.

## Layout

- Top row: page title **Proposal Dashboard** + primary button **New Proposal** → `/proposals/new`.
- Four KPI cards in a grid; each card is a link that sets `?filter=` on the dashboard URL.
- Below: **Recent Proposals** heading with optional filter subtitle; list of linked cards or empty state.

## Fields & filters

### Query parameter

| Param | Values | Effect on recent list |
|-------|--------|----------------------|
| `filter` | (omit), `all`, `draft`, `submitted`, `mine` | Filters proposals as described below |

Mapping:

- `draft` → status equals **Draft**
- `submitted` → status **not** Draft
- `mine` → `created_by` equals current user id (requires auth uid)
- default / `all` → no extra filter

### KPI cards

| Card | Label | Target filter |
|------|-------|---------------|
| 1 | Total Proposals | `all` |
| 2 | Drafts | `draft` |
| 3 | Submitted | `submitted` (non-draft count derived as total − drafts) |
| 4 | My Proposals | `mine` |

Active card shows ring highlight.

### Recent proposal cards

| Display | Source |
|---------|--------|
| Proposal name | `proposals.name` |
| Customer line | Joined `customers.company_name` or “No customer” |
| Status badge | `proposals.status` — Draft uses secondary badge variant |
| Optional price | Lowest positive **complexity-adjusted** scenario total among scenarios |

## Interactions

### Page load

- Dynamic render (`force-dynamic`) because counts use auth uid for “mine”.
- Parallel queries: filtered proposal list (limit 10, order `updated_at` desc) + three count queries.

### Navigation

- Click proposal card → `/proposals/[id]`.
- Click **New Proposal** → `/proposals/new`.

## API dependencies

| Query | Tables / shape | Notes |
|-------|----------------|-------|
| Proposal list | `proposals` + nested `customers`, `scenarios` | Ordered by `updated_at` desc, limit 10 |
| Counts | `proposals` head counts | Total, Draft filter, optional created_by filter |

## Page relationships

- **Inbound:** Sidebar **Dashboard**, post-login redirect.
- **To:** Proposal detail, new proposal.

## Business rules

- **Submitted count** is computed as total minus draft count (not a separate query).
- **Best price** on card uses `applyComplexity` on each scenario’s `summary_total_cost` and picks the minimum among costs **> 0**; if none, no price chip.
