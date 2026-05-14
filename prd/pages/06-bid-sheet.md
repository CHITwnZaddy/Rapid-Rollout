# Bid Sheet

> **Route:** `/proposals/[id]/bid-sheet`  
> **Module:** Proposals  
> **Generated:** 2026-04-30

## Overview

The **Bid Sheet** consolidates scenario pricing, migration and scoped rollups, optional **customer** association, **discount** fields and **notes**, and typically offers **export** (PDF/XLSX patterns per implementation). It is a client page that loads related tables and recomputes migration totals consistently with the Summary page logic.

## Layout

Regions (conceptual — exact order per component):

- Loading / error banners for bid sheet, scenarios, customers, migration, rates.
- Summary tables for each scenario type (Phase 1–2, Option 1–2) with hours and costs.
- Scoped services and migration sections with monetary totals.
- Discount controls: percent and dollars (validated schemas).
- Notes textarea with save.
- Customer picker aligned to bid sheet `customer_id`.
- Export button(s) when data is ready.

## Fields

| Field | Type | Validation | Notes |
|-------|------|------------|-------|
| Discount % | Numeric input | `discountPercentSchema` | Draft vs saved flow with validation toast |
| Discount $ (credit) | Numeric input | `discountDollarsSchema` | Same |
| Notes | Textarea | Server persistence | Debounced or explicit save per implementation |
| Customer | Select | Valid customer row | Updates bid sheet customer association |
| Recommended scenario | — | Stored on `bid_sheets.recommended_scenario` | Not surfaced on Bid Sheet page UI in current code (available for future use / other flows) |

## Interactions

### Load

- Parallel fetch: bid_sheet row, scenarios, customers list, migration config + lines, rate cards subset, scoped lines, proposal complexity factor.
- Parses subsets with Zod schemas (`safeParseSupabaseResult`).
- Computes migration total via `calculateMigrationTotals` when rates present; surfaces rate errors blocking saves.

### Save discount / notes

- Separate actions: `updateBidSheetDiscountPercent`, `updateBidSheetDiscountDollars`, `updateBidSheetNotes` (and possibly credit-related naming — follow `bid-sheet/actions`).
- Toast feedback on success/failure.

### Export

- User triggers download; implementation uses client-side generation (icons suggest file export).

## API dependencies

| Data | Source |
|------|--------|
| `bid_sheets` | Discount + notes + customer |
| `scenarios` | Scenario totals |
| `customers` | Picker |
| `migration_*` | Migration pricing |
| `scoped_services` | Scoped rollup |
| `rate_cards` | Rates |

## Page relationships

- **From:** Proposal tabs.
- **To:** Customer records (reference only), influences Summary via shared tables.

## Business rules

- Migration pricing blocked if rate card cannot supply Sr. IM / PM / Travel — avoids silent zero migration.
