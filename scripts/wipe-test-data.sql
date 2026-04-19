-- =============================================================
-- WIPE TEST DATA
-- Clears all transactional data while preserving lookup tables
-- (rate_cards, service_hours).
--
-- !! DO NOT RUN IN PRODUCTION WITHOUT TAKING A SNAPSHOT FIRST !!
--    Supabase Dashboard → Project Settings → Database → Backups
-- =============================================================

-- Step 1: Pre-flight — see what you're about to delete
SELECT 'customers'              AS tbl, COUNT(*) FROM customers
UNION ALL
SELECT 'proposals',                      COUNT(*) FROM proposals
UNION ALL
SELECT 'scenarios',                      COUNT(*) FROM scenarios
UNION ALL
SELECT 'scenario_lines',                 COUNT(*) FROM scenario_lines
UNION ALL
SELECT 'scoped_services',                COUNT(*) FROM scoped_services
UNION ALL
SELECT 'migration_services',             COUNT(*) FROM migration_services
UNION ALL
SELECT 'migration_config',               COUNT(*) FROM migration_config
UNION ALL
SELECT 'migration_detail_lines',         COUNT(*) FROM migration_detail_lines
UNION ALL
SELECT 'bid_sheets',                     COUNT(*) FROM bid_sheets
UNION ALL
SELECT 'change_log',                     COUNT(*) FROM change_log
UNION ALL
SELECT 'proposal_status_history',        COUNT(*) FROM proposal_status_history;

-- Step 2: Wipe (all-or-nothing)
BEGIN;

TRUNCATE
  proposal_status_history,
  change_log,
  bid_sheets,
  migration_detail_lines,
  migration_config,
  migration_services,
  scoped_services,
  scenario_lines,
  scenarios,
  proposals,
  customers
RESTART IDENTITY CASCADE;

COMMIT;

-- Step 3: Verify everything is zero
SELECT 'customers'              AS tbl, COUNT(*) FROM customers
UNION ALL
SELECT 'proposals',                      COUNT(*) FROM proposals
UNION ALL
SELECT 'scenarios',                      COUNT(*) FROM scenarios
UNION ALL
SELECT 'scenario_lines',                 COUNT(*) FROM scenario_lines
UNION ALL
SELECT 'scoped_services',                COUNT(*) FROM scoped_services
UNION ALL
SELECT 'migration_services',             COUNT(*) FROM migration_services
UNION ALL
SELECT 'migration_config',               COUNT(*) FROM migration_config
UNION ALL
SELECT 'migration_detail_lines',         COUNT(*) FROM migration_detail_lines
UNION ALL
SELECT 'bid_sheets',                     COUNT(*) FROM bid_sheets
UNION ALL
SELECT 'change_log',                     COUNT(*) FROM change_log
UNION ALL
SELECT 'proposal_status_history',        COUNT(*) FROM proposal_status_history;
