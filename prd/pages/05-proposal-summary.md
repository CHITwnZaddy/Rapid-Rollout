# Proposal Summary (Scenario Comparison)

> **Route:** `/proposals/[id]` (default child of proposal layout)  
> **Module:** Proposals  
> **Generated:** 2026-04-30

## Overview

The **Summary** tab presents a single comparison table for **six scenarios**, plus roll-ups for **scoped services** and **migration services**, showing hours, pre-discount client price, discounted allocation, and margin badges. Links jump into the underlying editors.

**Shared layout (parent):** proposal title (editable), customer line, “Scoped by” owner name, **ProposalStatus** control + **Save**, **Delete** button (owner or admin only), an optional backup note, and tab navigation — documented implicitly here as header chrome. See [Who can edit](#who-can-edit).

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

## Who can edit

SEs act as backups for each other (Austin, 2026-11-19; migration `20261119220158_allow_any_se_to_edit_proposals`), so the header and every tab behind it are editable by any signed-in user, not only the proposal's owner.

| Action | Who |
|--------|-----|
| View the proposal and its tabs | Any signed-in user |
| Edit any tab (scenario grids, complexity factors, bid sheet, scoped services, migration) | Any signed-in user |
| Rename, change status, close won/lost | Any signed-in user |
| Correct closed-won financials | Manager or admin |
| **Delete** | Owner or admin; the button is hidden for everyone else and the server re-checks |
| Change the owner (`created_by`) | Admin only (not exposed in the UI) |

- **Backup note:** a signed-in user who is neither the owner nor an admin sees a muted note under the header: “You're editing {owner}'s proposal as their backup. Your changes save to their proposal, and only they or an admin can delete it. Let them know what you changed.” ({owner} is the owner's display name, or “another SE” when it is unknown.) Admins never see it, and it is not shown when the proposal has no recorded owner.
- **No edit attribution:** edits are not recorded against the user who made them (no change tracking yet). Status changes still record who made them in the status history.
- **Failed saves:** a write that changes nothing because the proposal or row was deleted (for example in another tab) or the session ended shows “This change wasn't saved. The proposal may have been deleted, or you may have been signed out. Reload the page and try again.”

## Business rules

- Row marked **Configured** when total client price for that row > 0; otherwise **Empty**.
- Margin uses internal cost derived from **pre-complexity** hours × internal cost rate for scenarios; scoped internal cost uses base hours × internal cost rate before complexity on dollars display — detailed formulas live in calculation modules.
