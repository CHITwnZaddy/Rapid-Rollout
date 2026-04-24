-- Migration 014: Move complexity factor from proposal-level to per-scenario + per-scoped-section
--
-- Rationale: SEs asked for separate complexity multipliers on each scenario
-- (P1/P2/Opt1/Opt2) and on Scoped Services, instead of one factor applied to
-- all of them. Migration column on migration_detail already has its own
-- ba_complexity_factor / pm_complexity_factor and is untouched here.
--
-- Strategy:
--   1. Add scenarios.complexity_factor (defaults 1.00)
--   2. Add proposals.scoped_complexity_factor (defaults 1.00)
--   3. Backfill both from the old proposals.complexity_factor so existing
--      proposals preserve their current price
--   4. Drop proposals.complexity_factor

ALTER TABLE scenarios
  ADD COLUMN complexity_factor NUMERIC(5,2) NOT NULL DEFAULT 1.00
  CHECK (complexity_factor >= 0.50 AND complexity_factor <= 9.99);

ALTER TABLE proposals
  ADD COLUMN scoped_complexity_factor NUMERIC(5,2) NOT NULL DEFAULT 1.00
  CHECK (scoped_complexity_factor >= 0.50 AND scoped_complexity_factor <= 9.99);

UPDATE scenarios s
  SET complexity_factor = p.complexity_factor
  FROM proposals p
  WHERE s.proposal_id = p.id
    AND p.complexity_factor IS NOT NULL
    AND p.complexity_factor <> 1.00;

UPDATE proposals
  SET scoped_complexity_factor = complexity_factor
  WHERE complexity_factor IS NOT NULL
    AND complexity_factor <> 1.00;

ALTER TABLE proposals DROP COLUMN complexity_factor;
