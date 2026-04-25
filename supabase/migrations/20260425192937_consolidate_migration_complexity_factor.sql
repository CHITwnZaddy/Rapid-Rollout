-- Consolidate Migration Services from separate Sr. IM / PM complexity factors
-- into the same single Complexity Factor model already used by scenarios and
-- scoped services.

ALTER TABLE migration_config
  ADD COLUMN complexity_factor NUMERIC(5,2) DEFAULT 1.00
  CHECK (complexity_factor >= 0.50 AND complexity_factor <= 9.99);

UPDATE migration_config
SET complexity_factor = COALESCE(sr_im_complexity_factor, 1.00);

ALTER TABLE migration_config
  ALTER COLUMN complexity_factor SET NOT NULL,
  DROP COLUMN pm_contingency_pct,
  DROP COLUMN sr_im_complexity_factor,
  DROP COLUMN pm_complexity_factor;
