# Admin: Rate Cards

> **Route:** `/admin/rate-cards`  
> **Module:** Admin  
> **Generated:** 2026-04-30

## Overview

Spreadsheet-style CRUD on **`rate_cards`** — labor rates used across scenarios, scoped services, migration, margin math, and reports.

## Table columns

| Column | Label |
|--------|-------|
| rate_card_name | Rate Card |
| activity | Activity / Role |
| rate | Rate ($/hr) |
| role_category | Category |
| status | Status |
| lookup_key | Lookup Key |

## Create defaults

| Field | Default |
|-------|---------|
| rate_card_name | Master |
| activity | New Role |
| rate | 0 |
| role_category | Professional Services |
| status | Active |
| lookup_key | Auto pattern `Master|NewRole__AUTO__` |

## Auth & cache

- Config marks auth **`admin`** for mutations.
- Revalidate paths: `/admin/rate-cards` after changes.

## Interactions

Standard `AdminDataTable`: add row, inline edit, delete with server actions (`assertAuthenticatedAdmin`).

## Page relationships

- **Consumers:** Scenario grids (Active rows), scoped services picker, migration pricing, summary fail-closed checks, reports.

## Business rules

- Certain **lookup_key** values are semantically required for pricing — see `src/lib/rate-card-keys.ts` and migrations comments.
