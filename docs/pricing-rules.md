# Pricing Rules

This document captures the pricing rules the app is expected to enforce today.
If code and this document disagree, stop and resolve the conflict before
changing revenue logic.

## Proposal Total Components

The full proposal total is made of:

- scenario total
- migration total
- scoped services total

Any pricing adjustment that is described as applying to the "total cost" should
apply to the combined proposal subtotal, not just one component.

## Bid Sheet Adjustments

The Bid Sheet has two user-entered adjustment fields:

- `Credit`
- `Discount %`

### Credit

- Credit is a dollar amount.
- Credit must be `>= 0`.
- Negative credit is not allowed.
- If credit is greater than the subtotal, the adjusted subtotal floors at `0`.

### Discount Percent

- Discount percent must be between `0` and `100`.
- Negative discount is not allowed.
- Discount is applied after credit.

### Calculation Order

The correct order is:

```text
subtotal = scenario_total + migration_total + scoped_total
after_credit = max(0, subtotal - credit)
final_total = after_credit * (1 - discount_percent / 100)
```

This rule is implemented in:

- [src/lib/calculations/bid-sheet-pricing.ts](/Users/austin_alexander_guzman/GitHub/Rapid-Rollout/src/lib/calculations/bid-sheet-pricing.ts)

## Expected UI Consistency

The following views should agree for the same proposal:

- Proposal Summary
- Bid Sheet
- reports that reuse shared proposal aggregates

If totals disagree, treat that as a bug in shared pricing or aggregation logic,
not a cosmetic difference.

## Migration Pricing

Migration pricing should fail closed when required rate-card rows are missing.

Required rate rows currently include:

- `Master|Business Analyst`
- `Master|Program Manager`
- `Master|Travel Cost/Trip`

If one of those rows is missing, the app should surface an error instead of
silently showing a migration total of `0`.

## Scoped Services And Scenario Totals

- Scenario totals use the current scenario summary totals with complexity
  applied.
- Scoped services totals are part of the full proposal subtotal.
- Migration totals are part of the full proposal subtotal.

This means Bid Sheet adjustments must not be limited to scenario totals only.

## Floors And Guards

The app should enforce these guards:

| Rule | Expected behavior |
| --- | --- |
| subtotal below `0` | floor to `0` |
| credit below `0` | reject or clamp to `0` |
| discount below `0` | reject or clamp to `0` |
| discount above `100` | clamp to `100` |
| final total below `0` | floor to `0` |

## Reporting Expectations

Reports should reconcile with shared pricing and aggregation logic.

At minimum:

- shared proposal aggregates should use the same component totals as proposal
  pricing
- bid sheet totals and proposal summary totals should agree for the same
  underlying data
- status-based reports should not drift because of partial status writes

## Change Management Rule

Before changing pricing behavior:

1. Update this document if the business rule is changing.
2. Update or add tests that prove the new rule.
3. Verify Proposal Summary, Bid Sheet, and at least one affected report still
   agree.
