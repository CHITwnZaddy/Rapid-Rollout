-- 20261119220158_allow_any_se_to_edit_proposals.sql
-- Lets any signed-in user save changes to a proposal they did not create.
-- SEs act as backups for each other (Austin, 2026-11-19), so editing a
-- proposal becomes shared the same way reading it already is. Change
-- tracking ("who edited what") is deliberately NOT part of this change;
-- status changes keep recording changed_by in proposal_status_history.
--
-- Before:
--   - The six proposal child tables (scenarios, scenario_lines, bid_sheets,
--     scoped_services, migration_config, migration_detail_lines) could only be
--     written by the proposal's owner (proposals.created_by) or an admin.
--   - The proposals row could only be updated by its owner, a manager or an
--     admin. proposal_status_history inserts had the same gate, so a non-owner
--     SE could not change a proposal's status.
--   - save_scenario_grid() repeated the owner/admin check inside its body.
--
-- After (for any authenticated user, on a proposal that exists):
--   - UPDATE on all six child tables.
--   - INSERT and DELETE on scoped_services and migration_detail_lines (Add
--     row, Remove row and Clear Tab write these). INSERT and DELETE on the
--     structural tables (scenarios, scenario_lines, bid_sheets,
--     migration_config) stay owner-or-admin: the app only creates them in
--     create_proposal_bundle (as the owner) and only removes them through the
--     proposal-delete cascade, which runs as the table owner and bypasses RLS.
--   - UPDATE on proposals (name, status, closeout fields, complexity factor).
--   - INSERT into proposal_status_history, only as themselves
--     (changed_by = auth.uid()) and only stamped with the current time
--     (changed_at = now(), the column default the RPCs rely on), so history
--     can't be backdated.
--   - save_scenario_grid(): the owner/admin predicate is gone. The row lock,
--     the not-found check, the validation, the grants and SECURITY INVOKER are
--     unchanged.
--
-- Unchanged and still restricted:
--   - proposals DELETE: owner or admin ("Users can delete own proposals or admin").
--   - proposals INSERT: created_by must be the caller.
--   - proposal_status_history: no UPDATE or DELETE policy (append-only).
--   - change_log, customers, rate_cards, service_hours, profiles and the
--     manager-only sales-ops tables.
--
-- New column guard on proposals (trigger trg_guard_proposal_ownership):
--   - created_by (who owns the proposal) can only be changed by an admin.
--     DELETE stays owner-or-admin, so without this guard any SE could make
--     themselves the owner and then delete someone else's proposal. The old
--     UPDATE policy also let managers reassign; there are no manager accounts
--     on either project and the app never writes created_by on update.
--   - closed_financials_corrected_at / _by (the audit stamp of a closed-won
--     correction) can only be changed by a manager or an admin, matching
--     correctClosedProposalFinancials(), so an SE can't forge who corrected
--     closed-won numbers.
--   The guard applies to the API roles (anon, authenticated) only;
--   service_role and postgres (server-side admin client, dashboard,
--   migrations) are not restricted.
--
-- Policies are replaced with DROP POLICY IF EXISTS + CREATE POLICY inside one
-- transaction, so no session ever sees a table without its policy and the file
-- is safe to re-run. All eight tables are locked up front, parent first, with
-- a short lock_timeout: that avoids a lock upgrade on proposals that could
-- deadlock against a concurrent proposal create or delete, and a busy table
-- makes the migration fail fast (and be re-run) instead of stalling the app.
-- The old policy names are dropped verbatim, including the ones PostgreSQL
-- truncated to 63 characters (one ends in a trailing space). The self-check at
-- the end fails the whole migration if an old owner-only write policy survives
-- or a table ends up with the wrong number of policies.

BEGIN;

SET LOCAL lock_timeout = '5s';

LOCK TABLE
  public.proposals,
  public.proposal_status_history,
  public.scenarios,
  public.scenario_lines,
  public.bid_sheets,
  public.scoped_services,
  public.migration_config,
  public.migration_detail_lines
IN ACCESS EXCLUSIVE MODE;

-- 1. scenarios: UPDATE only (INSERT/DELETE stay owner-or-admin).
DROP POLICY IF EXISTS "Users can update scenarios via owned proposal or admin" ON public.scenarios;
DROP POLICY IF EXISTS "Authenticated users can update scenarios" ON public.scenarios;

CREATE POLICY "Authenticated users can update scenarios"
  ON public.scenarios FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.proposals WHERE proposals.id = scenarios.proposal_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.proposals WHERE proposals.id = scenarios.proposal_id)
  );

-- 2. scenario_lines (parent scenario -> proposal): UPDATE only.
DROP POLICY IF EXISTS "Users can update scenario_lines via owned proposal or admin" ON public.scenario_lines;
DROP POLICY IF EXISTS "Authenticated users can update scenario_lines" ON public.scenario_lines;

CREATE POLICY "Authenticated users can update scenario_lines"
  ON public.scenario_lines FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.scenarios
        JOIN public.proposals ON proposals.id = scenarios.proposal_id
      WHERE scenarios.id = scenario_lines.scenario_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scenarios
        JOIN public.proposals ON proposals.id = scenarios.proposal_id
      WHERE scenarios.id = scenario_lines.scenario_id
    )
  );

-- 3. bid_sheets: UPDATE only.
DROP POLICY IF EXISTS "Users can update bid_sheets via owned proposal or admin" ON public.bid_sheets;
DROP POLICY IF EXISTS "Authenticated users can update bid_sheets" ON public.bid_sheets;

CREATE POLICY "Authenticated users can update bid_sheets"
  ON public.bid_sheets FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.proposals WHERE proposals.id = bid_sheets.proposal_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.proposals WHERE proposals.id = bid_sheets.proposal_id)
  );

-- 4. scoped_services: INSERT, UPDATE and DELETE (Add/Remove line, Clear Tab).
DROP POLICY IF EXISTS "Users can insert scoped_services via owned proposal or admin" ON public.scoped_services;
DROP POLICY IF EXISTS "Users can update scoped_services via owned proposal or admin" ON public.scoped_services;
DROP POLICY IF EXISTS "Users can delete scoped_services via owned proposal or admin" ON public.scoped_services;
DROP POLICY IF EXISTS "Authenticated users can insert scoped_services" ON public.scoped_services;
DROP POLICY IF EXISTS "Authenticated users can update scoped_services" ON public.scoped_services;
DROP POLICY IF EXISTS "Authenticated users can delete scoped_services" ON public.scoped_services;

CREATE POLICY "Authenticated users can insert scoped_services"
  ON public.scoped_services FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.proposals WHERE proposals.id = scoped_services.proposal_id)
  );

CREATE POLICY "Authenticated users can update scoped_services"
  ON public.scoped_services FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.proposals WHERE proposals.id = scoped_services.proposal_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.proposals WHERE proposals.id = scoped_services.proposal_id)
  );

CREATE POLICY "Authenticated users can delete scoped_services"
  ON public.scoped_services FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.proposals WHERE proposals.id = scoped_services.proposal_id)
  );

-- 5. migration_config (parent proposal, aliased p as in its SELECT policy):
--    UPDATE only.
DROP POLICY IF EXISTS "Users can update migration_config via owned proposal or admin" ON public.migration_config;
DROP POLICY IF EXISTS "Authenticated users can update migration_config" ON public.migration_config;

CREATE POLICY "Authenticated users can update migration_config"
  ON public.migration_config FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = migration_config.proposal_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = migration_config.proposal_id)
  );

-- 6. migration_detail_lines (parent proposal, aliased p): INSERT, UPDATE and
--    DELETE (Add/Remove row, Clear Tab). The old names are stored truncated
--    to 63 characters and end in "or a".
DROP POLICY IF EXISTS "Users can insert migration_detail_lines via owned proposal or a" ON public.migration_detail_lines;
DROP POLICY IF EXISTS "Users can update migration_detail_lines via owned proposal or a" ON public.migration_detail_lines;
DROP POLICY IF EXISTS "Users can delete migration_detail_lines via owned proposal or a" ON public.migration_detail_lines;
DROP POLICY IF EXISTS "Authenticated users can insert migration_detail_lines" ON public.migration_detail_lines;
DROP POLICY IF EXISTS "Authenticated users can update migration_detail_lines" ON public.migration_detail_lines;
DROP POLICY IF EXISTS "Authenticated users can delete migration_detail_lines" ON public.migration_detail_lines;

CREATE POLICY "Authenticated users can insert migration_detail_lines"
  ON public.migration_detail_lines FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = migration_detail_lines.proposal_id)
  );

CREATE POLICY "Authenticated users can update migration_detail_lines"
  ON public.migration_detail_lines FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = migration_detail_lines.proposal_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = migration_detail_lines.proposal_id)
  );

CREATE POLICY "Authenticated users can delete migration_detail_lines"
  ON public.migration_detail_lines FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = migration_detail_lines.proposal_id)
  );

-- 7. proposals UPDATE: any authenticated user. (SELECT auth.uid()) IS NOT NULL
--    is always true for the authenticated role; it is written this way so the
--    intent ("signed in") is explicit and the policy is not a bare `true`.
--    The column guard in step 9 is what keeps ownership (and therefore
--    DELETE) and the closed-won correction stamp safe. INSERT and DELETE policies on proposals are not touched.
DROP POLICY IF EXISTS "Users can update own proposals or manager" ON public.proposals;
DROP POLICY IF EXISTS "Authenticated users can update proposals" ON public.proposals;

CREATE POLICY "Authenticated users can update proposals"
  ON public.proposals FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL)
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- 8. proposal_status_history INSERT: any authenticated user, recorded as
--    themselves and stamped now. transition_proposal_status() and
--    create_proposal_bundle() leave changed_at to its DEFAULT now(), which is
--    the same transaction timestamp now() returns here, so they pass; a
--    direct insert with a backdated changed_at does not. The old name is
--    stored truncated to 63 characters and ends in a trailing space.
DROP POLICY IF EXISTS "Users can insert proposal_status_history via owned proposal or " ON public.proposal_status_history;
DROP POLICY IF EXISTS "Authenticated users can insert own proposal_status_history" ON public.proposal_status_history;

CREATE POLICY "Authenticated users can insert own proposal_status_history"
  ON public.proposal_status_history FOR INSERT TO authenticated
  WITH CHECK (
    changed_by = (SELECT auth.uid())
    AND changed_at = now()
    AND EXISTS (
      SELECT 1 FROM public.proposals
      WHERE proposals.id = proposal_status_history.proposal_id
    )
  );

-- 9. Column guard on proposals. Fires only when one of the guarded columns
--    actually changes (UPDATE OF + WHEN). Restricts the API roles only: RLS
--    already governs exactly these roles, while service_role bypasses RLS and
--    is server-side only. No SECURITY DEFINER function updates proposals, so
--    current_user inside this INVOKER trigger is the API role. ERRCODE 42501
--    (insufficient_privilege) makes PostgREST answer 403, and the app's
--    isRowLevelSecurityError() already treats 42501 as "not permitted".
CREATE OR REPLACE FUNCTION public.guard_proposal_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF NEW.created_by IS DISTINCT FROM OLD.created_by
     AND NOT (SELECT public.auth_is_admin()) THEN
    RAISE EXCEPTION 'Only an admin can change who owns a proposal.'
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.closed_financials_corrected_at IS DISTINCT FROM OLD.closed_financials_corrected_at
      OR NEW.closed_financials_corrected_by IS DISTINCT FROM OLD.closed_financials_corrected_by)
     AND NOT (SELECT public.is_manager_or_admin()) THEN
    RAISE EXCEPTION 'Only a manager or an admin can correct closed-won financials.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- PostgreSQL does not check EXECUTE when firing a trigger, so the API roles
-- need no grant; removing it keeps the rpc surface minimal (same approach as
-- 20260629184500_lock_down_definer_function_execute).
REVOKE ALL ON FUNCTION public.guard_proposal_ownership() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_guard_proposal_ownership
  BEFORE UPDATE OF created_by, closed_financials_corrected_at, closed_financials_corrected_by
  ON public.proposals
  FOR EACH ROW
  WHEN (
    OLD.created_by IS DISTINCT FROM NEW.created_by
    OR OLD.closed_financials_corrected_at IS DISTINCT FROM NEW.closed_financials_corrected_at
    OR OLD.closed_financials_corrected_by IS DISTINCT FROM NEW.closed_financials_corrected_by
  )
  EXECUTE FUNCTION public.guard_proposal_ownership();

-- 10. save_scenario_grid: drop the hard-coded owner/admin predicate (and the
--     proposals join it needed). Everything else is the live definition,
--     unchanged. CREATE OR REPLACE keeps the existing grants and owner. The
--     row lock still goes through the scenarios UPDATE policy (FOR UPDATE
--     applies it), which step 1 opened to any authenticated user.
CREATE OR REPLACE FUNCTION public.save_scenario_grid(
  p_scenario_id UUID,
  p_lines JSONB,
  p_summary_total_hours NUMERIC,
  p_summary_total_cost NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_payload_count INTEGER;
  v_distinct_line_count INTEGER;
  v_valid_line_count INTEGER;
  v_existing_line_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to save scenario changes.';
  END IF;

  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Scenario grid payload must be a JSON array.';
  END IF;

  PERFORM 1
  FROM scenarios
  WHERE scenarios.id = p_scenario_id
  FOR UPDATE OF scenarios;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scenario not found. Reload the page and try again.';
  END IF;

  WITH payload AS (
    SELECT *
    FROM jsonb_to_recordset(p_lines) AS lines(
      id UUID,
      scope_selection TEXT,
      sr_im_hours NUMERIC,
      sr_im_cost NUMERIC,
      pm_hours NUMERIC,
      pm_cost NUMERIC,
      ba_hours NUMERIC,
      ba_cost NUMERIC,
      total_hours NUMERIC,
      total_cost NUMERIC
    )
  )
  SELECT
    COUNT(*),
    COUNT(DISTINCT payload.id),
    COUNT(scenario_lines.id),
    (
      SELECT COUNT(*)
      FROM scenario_lines
      WHERE scenario_lines.scenario_id = p_scenario_id
    )
  INTO
    v_payload_count,
    v_distinct_line_count,
    v_valid_line_count,
    v_existing_line_count
  FROM payload
  LEFT JOIN scenario_lines
    ON scenario_lines.id = payload.id
   AND scenario_lines.scenario_id = p_scenario_id;

  IF v_payload_count = 0 THEN
    RAISE EXCEPTION 'Scenario grid payload must include at least one line.';
  END IF;

  IF v_distinct_line_count <> v_payload_count THEN
    RAISE EXCEPTION 'Scenario grid payload contains duplicate or null line ids.';
  END IF;

  IF v_valid_line_count <> v_payload_count THEN
    RAISE EXCEPTION 'Scenario grid payload contains lines outside the target scenario.';
  END IF;

  IF v_payload_count <> v_existing_line_count THEN
    RAISE EXCEPTION 'Scenario grid payload must include every line in the scenario.';
  END IF;

  WITH payload AS (
    SELECT *
    FROM jsonb_to_recordset(p_lines) AS lines(
      id UUID,
      scope_selection TEXT,
      sr_im_hours NUMERIC,
      sr_im_cost NUMERIC,
      pm_hours NUMERIC,
      pm_cost NUMERIC,
      ba_hours NUMERIC,
      ba_cost NUMERIC,
      total_hours NUMERIC,
      total_cost NUMERIC
    )
  )
  UPDATE scenario_lines
  SET
    scope_selection = payload.scope_selection,
    sr_im_hours = payload.sr_im_hours,
    sr_im_cost = payload.sr_im_cost,
    pm_hours = payload.pm_hours,
    pm_cost = payload.pm_cost,
    ba_hours = payload.ba_hours,
    ba_cost = payload.ba_cost,
    total_hours = payload.total_hours,
    total_cost = payload.total_cost
  FROM payload
  WHERE scenario_lines.id = payload.id
    AND scenario_lines.scenario_id = p_scenario_id;

  UPDATE scenarios
  SET
    summary_total_hours = p_summary_total_hours,
    summary_total_cost = p_summary_total_cost
  WHERE scenarios.id = p_scenario_id;

  RETURN TRUE;
END;
$$;

-- 11. Self-check. Fails (and rolls back everything above) if an owner-only
--     write policy that this migration replaces survived (e.g. a mistyped old
--     name), if the kept owner-or-admin INSERT/DELETE policies on the
--     structural tables are missing, or if a table does not have exactly the
--     expected number of policies afterwards.
DO $$
DECLARE
  v_stale TEXT;
  v_wrong TEXT;
  v_missing TEXT;
BEGIN
  SELECT string_agg(format('%I.%I', tablename, policyname), ', ')
    INTO v_stale
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND (
      (policyname LIKE '%via owned proposal%' AND cmd = 'UPDATE')
      OR (policyname LIKE '%via owned proposal%'
          AND tablename IN ('scoped_services', 'migration_detail_lines', 'proposal_status_history'))
      OR policyname = 'Users can update own proposals or manager'
    );

  IF v_stale IS NOT NULL THEN
    RAISE EXCEPTION 'Owner-only proposal write policies are still present: %', v_stale;
  END IF;

  SELECT string_agg(format('%s.%s', e.tbl, e.pol), ', ')
    INTO v_missing
  FROM (VALUES
    ('scenarios', 'Users can insert scenarios via owned proposal or admin'),
    ('scenarios', 'Users can delete scenarios via owned proposal or admin'),
    ('scenario_lines', 'Users can insert scenario_lines via owned proposal or admin'),
    ('scenario_lines', 'Users can delete scenario_lines via owned proposal or admin'),
    ('bid_sheets', 'Users can insert bid_sheets via owned proposal or admin'),
    ('bid_sheets', 'Users can delete bid_sheets via owned proposal or admin'),
    ('migration_config', 'Users can insert migration_config via owned proposal or admin'),
    ('migration_config', 'Users can delete migration_config via owned proposal or admin'),
    ('proposals', 'Users can delete own proposals or admin'),
    ('proposals', 'Users can insert own proposals')
  ) AS e(tbl, pol)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = e.tbl AND p.policyname = e.pol
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Policies that must stay owner-or-admin are missing: %', v_missing;
  END IF;

  SELECT string_agg(format('%s (%s, expected %s)', e.tbl, coalesce(c.n, 0), e.expected), ', ')
    INTO v_wrong
  FROM (VALUES
    ('scenarios', 4),
    ('scenario_lines', 4),
    ('bid_sheets', 4),
    ('scoped_services', 4),
    ('migration_config', 4),
    ('migration_detail_lines', 4),
    ('proposals', 4),
    ('proposal_status_history', 2)
  ) AS e(tbl, expected)
  LEFT JOIN (
    SELECT tablename, count(*)::INT AS n
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
    GROUP BY tablename
  ) AS c ON c.tablename = e.tbl
  WHERE coalesce(c.n, 0) <> e.expected;

  IF v_wrong IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected policy count after migration: %', v_wrong;
  END IF;
END;
$$;

COMMIT;
