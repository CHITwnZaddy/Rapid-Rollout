-- Self-heal audit for legacy proposal child rows
--
-- What this checks:
--   1. proposals missing bid_sheets
--   2. proposals missing migration_config
--   3. proposals missing migration_detail_lines
--
-- Why the cutoff matters:
--   proposals created after the atomic proposal bootstrap should not
--   need these rescue paths. Missing rows after that cutoff imply a
--   newer regression, bad deploy alignment, or data written outside
--   the intended create path.
--
-- Replace the timestamp below before running this script.

WITH params AS (
  SELECT
    TIMESTAMPTZ '2026-04-21 23:38:06+00' AS atomic_bootstrap_cutoff
),
proposal_child_audit AS (
  SELECT
    p.id,
    p.name,
    p.created_at,
    p.created_by,
    p.customer_id,
    CASE
      WHEN bs.id IS NULL THEN true
      ELSE false
    END AS missing_bid_sheet,
    CASE
      WHEN mc.id IS NULL THEN true
      ELSE false
    END AS missing_migration_config,
    CASE
      WHEN mdl.proposal_id IS NULL THEN true
      ELSE false
    END AS missing_migration_detail_lines,
    CASE
      WHEN p.created_at < (SELECT atomic_bootstrap_cutoff FROM params)
        THEN 'before_atomic_bootstrap'
      ELSE 'after_atomic_bootstrap'
    END AS bootstrap_bucket
  FROM proposals p
  LEFT JOIN bid_sheets bs
    ON bs.proposal_id = p.id
  LEFT JOIN migration_config mc
    ON mc.proposal_id = p.id
  LEFT JOIN (
    SELECT DISTINCT proposal_id
    FROM migration_detail_lines
  ) mdl
    ON mdl.proposal_id = p.id
)

-- 1. Aggregate counts across the whole proposal set
SELECT
  COUNT(*) AS total_proposals,
  COUNT(*) FILTER (WHERE missing_bid_sheet) AS proposals_missing_bid_sheet,
  COUNT(*) FILTER (WHERE missing_migration_config) AS proposals_missing_migration_config,
  COUNT(*) FILTER (WHERE missing_migration_detail_lines) AS proposals_missing_migration_detail_lines,
  COUNT(*) FILTER (
    WHERE missing_bid_sheet
       OR missing_migration_config
       OR missing_migration_detail_lines
  ) AS proposals_missing_any_child_row
FROM proposal_child_audit;

-- 2. Bucket the missing-child proposals before vs after atomic bootstrap
SELECT
  bootstrap_bucket,
  COUNT(*) FILTER (WHERE missing_bid_sheet) AS proposals_missing_bid_sheet,
  COUNT(*) FILTER (WHERE missing_migration_config) AS proposals_missing_migration_config,
  COUNT(*) FILTER (WHERE missing_migration_detail_lines) AS proposals_missing_migration_detail_lines,
  COUNT(*) FILTER (
    WHERE missing_bid_sheet
       OR missing_migration_config
       OR missing_migration_detail_lines
  ) AS proposals_missing_any_child_row
FROM proposal_child_audit
GROUP BY bootstrap_bucket
ORDER BY bootstrap_bucket;

-- 3. Detailed affected proposal list
SELECT
  a.id AS proposal_id,
  a.name AS proposal_name,
  a.created_at,
  a.created_by,
  c.company_name AS customer_name,
  a.bootstrap_bucket,
  a.missing_bid_sheet,
  a.missing_migration_config,
  a.missing_migration_detail_lines
FROM proposal_child_audit a
LEFT JOIN customers c
  ON c.id = a.customer_id
WHERE a.missing_bid_sheet
   OR a.missing_migration_config
   OR a.missing_migration_detail_lines
ORDER BY a.created_at DESC, a.id;
