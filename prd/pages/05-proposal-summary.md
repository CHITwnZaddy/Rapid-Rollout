# Proposal Summary (Scenario Comparison)

> **Route:** `/proposals/[id]` (default child of proposal layout)  
> **Module:** Proposals  
> **Generated:** 2026-04-30

## Overview

The **Summary** tab presents a single comparison table for **six scenarios**, plus roll-ups for **scoped services** and **migration services**, showing hours, pre-discount client price, discounted allocation, and margin badges. Links jump into the underlying editors.

**Shared layout (parent):** proposal title, customer line, **ProposalStatus** control + **Save**, **Delete** button, and tab navigation — documented implicitly here as header chrome.

## Layout

- One primary card: **Scenario Comparison** with a six-column table.

### Table columns

| Column | Meaning |
|--------|---------|
| Line Item | Scenario display name or Scoped / Migration links |
| Total Hours | Complexity-adjusted hours where applicable |
| Discounted Cost | Share of final total after portfolio-level discount math |
| Client Price | Pre-discount customer price for that row’s scope |
| Margin | Percent badge with color class from helper (may show “—”) |
| Status | Configured vs Empty badge |

## Data sources & computation (behavioral)

1. **Scenarios:** Loaded for proposal id; ordered by type; missing scenario types filtered out of comparison rows.
2. **Scoped services:** Sums raw `cost` and `hours`; applies **proposal-level scoped complexity factor** to produce scoped totals and hours for display.
3. **Migration:** Recomputes live totals using `migration_config`, `migration_detail_lines` (sections project / workflow / cost), and rates — **does not** trust stored snapshot alone (avoids stale zero totals).
4. **Rates:** Loads internal cost + Sr. IM + PM + Travel keys from `rate_cards`.
5. **Discounts:** Reads `discount_percent` and `discount_dollars` from `bid_sheets`.
6. **Pricing summary:** `calculateProposalPricingSummary` merges scenarios + migration + scoped with credit/discount percent to produce subtotal/final totals used to allocate discounted column.

## Failure modes (fail-closed)

| Condition | User-visible result |
|-----------|---------------------|
| Internal cost rate row missing | Card explaining pricing-critical rate rows missing; no misleading margins |
| Sr. IM / PM / Travel missing when migration config exists | Card blocking summary until admin seeds rates |

## Interactions

### Page load

- Parallel Supabase reads for proposal scoped factor, scenarios, scoped lines, migration config + lines, bid sheet discounts, rate rows.
- If scenarios query returns null → `notFound()`.

### Navigation

- Each scenario name links to `/proposals/[id]/scenarios/{P1|P2|P3|Opt1|Opt2|Opt3}`.
- Scoped / Migration labels link to respective tabs.

## API dependencies

| Resource | Purpose |
|----------|---------|
| `proposals.scoped_complexity_factor` | Scoped rollup multiplier |
| `scenarios` | Per-scenario totals + complexity |
| `scoped_services` | Raw hours/cost lines |
| `migration_config`, `migration_detail_lines` | Migration engine inputs |
| `bid_sheets` | Discount fields |
| `rate_cards` | Pricing rates |

## Page relationships

- **Inbound:** Any proposal tab; list/dashboard cards.
- **Outbound:** Scenario grid pages, scoped services, migration.

## Business rules

- Row marked **Configured** when total client price for that row > 0; otherwise **Empty**.
- Margin uses internal cost derived from **pre-complexity** hours × internal cost rate for scenarios; scoped internal cost uses base hours × internal cost rate before complexity on dollars display — detailed formulas live in calculation modules.
