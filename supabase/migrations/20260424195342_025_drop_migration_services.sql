-- ============================================================================
-- Migration 025: Drop migration_services table (APP-05)
-- ============================================================================
--
-- Addresses APP-05 from the Solution Architect Review.
--
-- The migration_services table was introduced in migration 002 as a staging
-- concept for "migration services" line items but was never wired into the
-- bundle engine, UI, or any RPC. It has remained empty in production since
-- creation. It shows up in advisors as an unused permissive-policy target and
-- clutters types/tooling.
--
-- Pre-conditions verified via MCP before drafting this migration:
--   • SELECT COUNT(*) FROM public.migration_services → 0 rows
--   • No incoming foreign keys reference migration_services
--   • No views or user-defined functions reference migration_services
--   • No application code (server actions, RPCs, engine) reads or writes it
--   • Only references in the repo are:
--       - scripts/wipe-test-data.sql (cleanup-only refs, removed in same commit)
--       - src/types/database.ts (generated block, removed in same commit)
--
-- This migration is destructive (DROP TABLE) but targeting an empty, dead
-- table. There is no compensating UP path — recovery would require restoring
-- from a PITR snapshot.
--
-- Historical migrations 002_create_proposal_tables.sql,
-- 003_create_rls_policies.sql, and 005_uat_visibility_and_discount_updates.sql
-- still reference this table; that is correct and immutable. Fresh clones
-- will still create the table from 002, then drop it here in 025.
-- ============================================================================

BEGIN;

-- Drop the four per-command RLS policies created by migration 023.
-- (Also drops any legacy policies from 003/005 that might still exist on a
--  stale branch. IF EXISTS covers both paths.)
DROP POLICY IF EXISTS "Authenticated users can read migration_services via proposal"
  ON public.migration_services;
DROP POLICY IF EXISTS "Users can insert migration_services via owned proposal or admin"
  ON public.migration_services;
DROP POLICY IF EXISTS "Users can update migration_services via owned proposal or admin"
  ON public.migration_services;
DROP POLICY IF EXISTS "Users can delete migration_services via owned proposal or admin"
  ON public.migration_services;

-- Legacy policy names from earlier migrations (defensive — may already be gone
-- after 023 consolidation). Safe to no-op.
DROP POLICY IF EXISTS "Users can modify migration_services via owned proposal or admin"
  ON public.migration_services;
DROP POLICY IF EXISTS "Authenticated users can modify migration_services via owned proposal"
  ON public.migration_services;

-- Drop the FK index. The table's PK index auto-drops with the table.
DROP INDEX IF EXISTS public.idx_migration_services_proposal;

-- Final drop. CASCADE is intentional: no dependents expected per MCP scan, but
-- if stale Supabase-managed dependents remain (e.g. realtime publication
-- membership), CASCADE ensures a clean drop without manual intervention.
DROP TABLE IF EXISTS public.migration_services CASCADE;

-- ============================================================================
-- Post-drop assertion: table is actually gone.
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'migration_services'
  ) THEN
    RAISE EXCEPTION 'migration_services table still exists after DROP';
  END IF;

  RAISE NOTICE 'migration_services dropped cleanly (APP-05)';
END
$$;

COMMIT;
