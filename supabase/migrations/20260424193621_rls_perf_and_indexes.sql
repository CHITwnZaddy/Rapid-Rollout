-- Migration 023: RLS performance tuning + covering indexes
--
-- Addresses Phase 2 findings from the Solution Architect Review (April 24, 2026):
--   PERF-01: Wrap auth.uid() and auth.jwt() calls in (SELECT ...) so PostgreSQL
--            evaluates them once per query instead of once per row.
--   PERF-02: Replace stacked "FOR ALL" + separate "FOR SELECT" policies with
--            explicit per-command policies (FOR INSERT / FOR UPDATE / FOR DELETE).
--            This eliminates duplicate permissive SELECT warnings on:
--              bid_sheets, migration_services, rate_cards, scenario_lines,
--              scenarios, scoped_services, service_hours.
--            (customers already split during earlier remediation; not touched here.)
--   PERF-03: Add covering index on bid_sheets.customer_id.
--   PERF-04: Add covering index on proposal_status_history.changed_by.
--   PERF-03b (new, discovered in advisor scan but not in review doc):
--            Add covering index on customers.created_by to support the per-user
--            owner check `(SELECT auth.uid()) = created_by` introduced during
--            the customers policy split.
--
-- PERF-05 (drop idx_service_hours_lookup) is DEFERRED: it requires a usage-plan
-- verification window in production before drop. Tracked separately.
-- PERF-06 (auth pool % vs absolute count) is a Supabase dashboard toggle, not SQL.
--
-- IMPORTANT: DROP POLICY + CREATE POLICY are atomic within a transaction. If any
-- single statement fails, the entire migration rolls back and no policies are
-- left in an inconsistent state.

BEGIN;

-- =====================================================================
-- proposals (3 policies to rewrap; no ALL policy to split)
-- =====================================================================

DROP POLICY IF EXISTS "Users can delete own proposals or admin" ON public.proposals;
CREATE POLICY "Users can delete own proposals or admin"
  ON public.proposals FOR DELETE
  TO authenticated
  USING (
    (created_by = (SELECT auth.uid()))
    OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin')
  );

DROP POLICY IF EXISTS "Users can insert own proposals" ON public.proposals;
CREATE POLICY "Users can insert own proposals"
  ON public.proposals FOR INSERT
  TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own proposals or admin" ON public.proposals;
CREATE POLICY "Users can update own proposals or admin"
  ON public.proposals FOR UPDATE
  TO authenticated
  USING (
    (created_by = (SELECT auth.uid()))
    OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin')
  );

-- =====================================================================
-- scenarios (split ALL -> INSERT/UPDATE/DELETE; rewrap auth calls)
-- =====================================================================

DROP POLICY IF EXISTS "Users can modify scenarios via owned proposal or admin"
  ON public.scenarios;

CREATE POLICY "Users can insert scenarios via owned proposal or admin"
  ON public.scenarios FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = scenarios.proposal_id
        AND ((proposals.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

CREATE POLICY "Users can update scenarios via owned proposal or admin"
  ON public.scenarios FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = scenarios.proposal_id
        AND ((proposals.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

CREATE POLICY "Users can delete scenarios via owned proposal or admin"
  ON public.scenarios FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = scenarios.proposal_id
        AND ((proposals.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

-- =====================================================================
-- scenario_lines (split ALL -> INSERT/UPDATE/DELETE; rewrap auth calls)
-- =====================================================================

DROP POLICY IF EXISTS "Users can modify scenario_lines via owned proposal or admin"
  ON public.scenario_lines;

CREATE POLICY "Users can insert scenario_lines via owned proposal or admin"
  ON public.scenario_lines FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scenarios
        JOIN proposals ON proposals.id = scenarios.proposal_id
      WHERE scenarios.id = scenario_lines.scenario_id
        AND ((proposals.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

CREATE POLICY "Users can update scenario_lines via owned proposal or admin"
  ON public.scenario_lines FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios
        JOIN proposals ON proposals.id = scenarios.proposal_id
      WHERE scenarios.id = scenario_lines.scenario_id
        AND ((proposals.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

CREATE POLICY "Users can delete scenario_lines via owned proposal or admin"
  ON public.scenario_lines FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios
        JOIN proposals ON proposals.id = scenarios.proposal_id
      WHERE scenarios.id = scenario_lines.scenario_id
        AND ((proposals.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

-- =====================================================================
-- scoped_services (split ALL -> INSERT/UPDATE/DELETE; rewrap auth calls)
-- =====================================================================

DROP POLICY IF EXISTS "Users can modify scoped_services via owned proposal or admin"
  ON public.scoped_services;

CREATE POLICY "Users can insert scoped_services via owned proposal or admin"
  ON public.scoped_services FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = scoped_services.proposal_id
        AND ((proposals.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

CREATE POLICY "Users can update scoped_services via owned proposal or admin"
  ON public.scoped_services FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = scoped_services.proposal_id
        AND ((proposals.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

CREATE POLICY "Users can delete scoped_services via owned proposal or admin"
  ON public.scoped_services FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = scoped_services.proposal_id
        AND ((proposals.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

-- =====================================================================
-- bid_sheets (split ALL -> INSERT/UPDATE/DELETE; rewrap auth calls)
-- =====================================================================

DROP POLICY IF EXISTS "Users can modify bid_sheets via owned proposal or admin"
  ON public.bid_sheets;

CREATE POLICY "Users can insert bid_sheets via owned proposal or admin"
  ON public.bid_sheets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = bid_sheets.proposal_id
        AND ((proposals.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

CREATE POLICY "Users can update bid_sheets via owned proposal or admin"
  ON public.bid_sheets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = bid_sheets.proposal_id
        AND ((proposals.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

CREATE POLICY "Users can delete bid_sheets via owned proposal or admin"
  ON public.bid_sheets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = bid_sheets.proposal_id
        AND ((proposals.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

-- =====================================================================
-- migration_config (already split into per-command; rewrap auth calls only)
-- =====================================================================

DROP POLICY IF EXISTS "Users can insert migration_config via owned proposal or admin"
  ON public.migration_config;
CREATE POLICY "Users can insert migration_config via owned proposal or admin"
  ON public.migration_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_config.proposal_id
        AND ((p.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

DROP POLICY IF EXISTS "Users can update migration_config via owned proposal or admin"
  ON public.migration_config;
CREATE POLICY "Users can update migration_config via owned proposal or admin"
  ON public.migration_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_config.proposal_id
        AND ((p.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

DROP POLICY IF EXISTS "Users can delete migration_config via owned proposal or admin"
  ON public.migration_config;
CREATE POLICY "Users can delete migration_config via owned proposal or admin"
  ON public.migration_config FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_config.proposal_id
        AND ((p.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

-- =====================================================================
-- migration_detail_lines (already split; rewrap auth calls only)
-- =====================================================================

DROP POLICY IF EXISTS "Users can insert migration_detail_lines via owned proposal or a"
  ON public.migration_detail_lines;
CREATE POLICY "Users can insert migration_detail_lines via owned proposal or a"
  ON public.migration_detail_lines FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_detail_lines.proposal_id
        AND ((p.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

DROP POLICY IF EXISTS "Users can update migration_detail_lines via owned proposal or a"
  ON public.migration_detail_lines;
CREATE POLICY "Users can update migration_detail_lines via owned proposal or a"
  ON public.migration_detail_lines FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_detail_lines.proposal_id
        AND ((p.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

DROP POLICY IF EXISTS "Users can delete migration_detail_lines via owned proposal or a"
  ON public.migration_detail_lines;
CREATE POLICY "Users can delete migration_detail_lines via owned proposal or a"
  ON public.migration_detail_lines FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_detail_lines.proposal_id
        AND ((p.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

-- =====================================================================
-- migration_services (split ALL -> INSERT/UPDATE/DELETE; rewrap auth calls)
-- =====================================================================

DROP POLICY IF EXISTS "Users can modify migration_services via owned proposal or admin"
  ON public.migration_services;

CREATE POLICY "Users can insert migration_services via owned proposal or admin"
  ON public.migration_services FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = migration_services.proposal_id
        AND ((proposals.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

CREATE POLICY "Users can update migration_services via owned proposal or admin"
  ON public.migration_services FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = migration_services.proposal_id
        AND ((proposals.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

CREATE POLICY "Users can delete migration_services via owned proposal or admin"
  ON public.migration_services FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = migration_services.proposal_id
        AND ((proposals.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

-- =====================================================================
-- change_log (2 policies to rewrap; INSERT + SELECT only, no ALL policy)
-- =====================================================================

DROP POLICY IF EXISTS "Authenticated users can insert own change_log"
  ON public.change_log;
CREATE POLICY "Authenticated users can insert own change_log"
  ON public.change_log FOR INSERT
  TO authenticated
  WITH CHECK (changed_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can read change_log via proposal" ON public.change_log;
CREATE POLICY "Users can read change_log via proposal"
  ON public.change_log FOR SELECT
  TO authenticated
  USING (
    (proposal_id IS NULL)
    OR EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = change_log.proposal_id
        AND ((proposals.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

-- =====================================================================
-- rate_cards (split admin ALL -> admin INSERT/UPDATE/DELETE; rewrap auth.jwt)
-- =====================================================================

DROP POLICY IF EXISTS "Admins can modify rate_cards" ON public.rate_cards;

CREATE POLICY "Admins can insert rate_cards"
  ON public.rate_cards FOR INSERT
  TO authenticated
  WITH CHECK ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin');

CREATE POLICY "Admins can update rate_cards"
  ON public.rate_cards FOR UPDATE
  TO authenticated
  USING ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin');

CREATE POLICY "Admins can delete rate_cards"
  ON public.rate_cards FOR DELETE
  TO authenticated
  USING ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin');

-- =====================================================================
-- service_hours (split admin ALL -> admin INSERT/UPDATE/DELETE; rewrap auth.jwt)
-- =====================================================================

DROP POLICY IF EXISTS "Admins can modify service_hours" ON public.service_hours;

CREATE POLICY "Admins can insert service_hours"
  ON public.service_hours FOR INSERT
  TO authenticated
  WITH CHECK ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin');

CREATE POLICY "Admins can update service_hours"
  ON public.service_hours FOR UPDATE
  TO authenticated
  USING ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin');

CREATE POLICY "Admins can delete service_hours"
  ON public.service_hours FOR DELETE
  TO authenticated
  USING ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin');

-- =====================================================================
-- proposal_status_history (1 policy to rewrap; INSERT only, SELECT already clean)
-- =====================================================================

DROP POLICY IF EXISTS "Users can insert proposal_status_history via owned proposal or "
  ON public.proposal_status_history;
CREATE POLICY "Users can insert proposal_status_history via owned proposal or "
  ON public.proposal_status_history FOR INSERT
  TO authenticated
  WITH CHECK (
    (changed_by = (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_status_history.proposal_id
        AND ((proposals.created_by = (SELECT auth.uid()))
          OR ((((SELECT auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin'))
    )
  );

-- =====================================================================
-- Covering indexes for foreign keys
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_bid_sheets_customer_id
  ON public.bid_sheets (customer_id);

CREATE INDEX IF NOT EXISTS idx_proposal_status_history_changed_by
  ON public.proposal_status_history (changed_by);

CREATE INDEX IF NOT EXISTS idx_customers_created_by
  ON public.customers (created_by);

COMMIT;
