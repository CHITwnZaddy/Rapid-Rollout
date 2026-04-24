-- Per-proposal complexity factor applied at display time to scenarios + scoped services.
-- Migration costs already have their own ba_complexity_factor / pm_complexity_factor,
-- so this factor intentionally does NOT apply to migration totals.
-- Range 0.50–9.99 matches the precision pattern from 004_migration_detail_tables.sql.
ALTER TABLE proposals
  ADD COLUMN complexity_factor NUMERIC(5,2) NOT NULL DEFAULT 1.00
  CHECK (complexity_factor >= 0.50 AND complexity_factor <= 9.99);
