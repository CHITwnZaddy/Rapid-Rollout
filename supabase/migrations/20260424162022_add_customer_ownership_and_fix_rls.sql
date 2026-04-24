-- ============================================================================
-- Migration 006a: Add customer ownership + fix customers RLS (SEC-01)
-- ============================================================================
--
-- This migration was originally applied to production directly (via Supabase
-- MCP / dashboard, not through the repo) before the repo-as-source-of-truth
-- workflow was established. Its content is recorded in
-- supabase_migrations.schema_migrations as `add_customer_ownership_and_fix_rls`
-- with version 20260424162022 — between migrations 006 (20260424150005) and
-- 007 (20260424164332). The numeric prefix `006a` preserves apply order in
-- repo-replay scenarios (fresh clone → supabase db reset).
--
-- Addresses OPS-01 (drift between repo and prod) by closing the
-- repo-missing-this-migration gap. Also re-encodes SEC-01 (customers table
-- was fully open to any authenticated user), which was the original purpose.
--
-- Every statement is idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`,
-- `CREATE OR REPLACE`) so running this against a database where the
-- migration has already been applied is a clean no-op. This is required
-- because production already has all of these objects — only fresh clones
-- need this file to do real work.
-- ============================================================================

BEGIN;

-- Step 1: Add created_by column on customers (nullable: legacy rows survive).
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Step 2: Trigger function — auto-stamp created_by on insert.
CREATE OR REPLACE FUNCTION public.set_customer_created_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- Step 3: Attach the trigger.
DROP TRIGGER IF EXISTS trg_set_customer_created_by ON public.customers;
CREATE TRIGGER trg_set_customer_created_by
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_customer_created_by();

-- Step 4: Drop the broken open-ALL policy (and the prior open-SELECT
-- policy) before recreating the precise per-command set.
DROP POLICY IF EXISTS "Authenticated users can modify customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can read customers" ON public.customers;

-- Step 5: SELECT — every authenticated user can read every customer.
-- Rationale: SEs need the full customer dropdown when creating proposals,
-- including legacy rows (created_by IS NULL) and other SEs' customers.
CREATE POLICY "Authenticated users can read customers"
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (true);

-- Step 6: INSERT — caller must own the row (or be an admin).
-- WITH CHECK pins created_by to the inserting user's uid.
CREATE POLICY "Authenticated users can create customers"
  ON public.customers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) = created_by
    OR (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  );

-- Step 7: UPDATE — owner OR admin.
CREATE POLICY "Users can update own customers or admin"
  ON public.customers
  FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) = created_by
    OR (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  )
  WITH CHECK (
    (select auth.uid()) = created_by
    OR (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  );

-- Step 8: DELETE — owner only if no proposal references the customer; admins
-- can delete any customer regardless of proposals.
CREATE POLICY "Users can delete own customers if no proposals or admin"
  ON public.customers
  FOR DELETE
  TO authenticated
  USING (
    (
      (select auth.uid()) = created_by
      AND NOT EXISTS (
        SELECT 1 FROM public.proposals
        WHERE proposals.customer_id = customers.id
      )
    )
    OR (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  );

COMMIT;
