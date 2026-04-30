# Proposals List

> **Route:** `/proposals`  
> **Module:** Proposals  
> **Generated:** 2026-04-30

## Overview

Shows **all proposals** visible to the user under Row Level Security, as a vertical list of cards with status, customer, created date, and per-scenario cost/hour summaries when present.

## Layout

- Header: title **Proposals** + **New Proposal** button.
- Body: empty state card or grid of proposal cards.

## Fields — List row (card)

| Column / region | Format | Notes |
|-----------------|--------|-------|
| Title | Text | Proposal name |
| Subtitle | Text | Customer name · created date (locale formatted) |
| Status | Badge | Draft → secondary variant |
| Scenario chips | Text lines | Only scenarios with `summary_total_cost > 0`; shows display name, currency, hours after complexity adjustment |

## Interactions

### Page load

- Server-side fetch with **60s revalidation** (ISR-style): balances freshness vs load.
- Parses response with `ProposalListSchema`; on failure shows “Unable to load proposals. Refresh to retry.”

### Navigation

- Card click → `/proposals/[id]`.
- **New Proposal** → `/proposals/new`.

## API dependencies

| Query | Trigger | Notes |
|-------|---------|-------|
| `proposals` select with joins | Load | Order `updated_at` desc |

## Page relationships

- **From:** Sidebar **Proposals**, dashboard link to new proposal only indirectly.
- **To:** Proposal workspace (`/proposals/[id]/*`).

## Business rules

- Scenario labels use `getScenarioDisplayName` (Phase 1, Phase 2, Option 1, Option 2).
- Hours and costs apply per-scenario **complexity factor** via `applyComplexity`.
