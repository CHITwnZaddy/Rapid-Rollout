-- ─────────────────────────────────────────────────────────────
-- Migration 008: bid_sheets discount bounds
-- ─────────────────────────────────────────────────────────────
-- Phase 1.4 — Defense in depth for bid-sheet discount inputs.
--
-- The client now validates with Zod before every save (see
-- src/lib/validation/bid-sheet.ts), but we also enforce the
-- business rule at the database level so a rogue client or a
-- future code path that forgets to validate can't corrupt
-- pricing data.
--
-- Business rule:
--   • discount_percent must be between 0 and 100 inclusive.
--   • discount_dollars is intentionally UNCONSTRAINED in sign:
--     negative values are legal and represent credits from
--     prior Letter-of-Engagement work. Postgres NUMERIC(12,2)
--     already rejects NaN/Infinity, so no additional check is
--     needed beyond the existing column type.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE bid_sheets
  DROP CONSTRAINT IF EXISTS bid_sheets_discount_percent_range;

ALTER TABLE bid_sheets
  ADD CONSTRAINT bid_sheets_discount_percent_range
  CHECK (discount_percent >= 0 AND discount_percent <= 100);
