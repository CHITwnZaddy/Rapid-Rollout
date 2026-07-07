-- 20260706191500_centralize_admin_check_rls.sql
-- Centralizes the copy-pasted "is this caller an admin?" RLS check behind a
-- single helper, public.auth_is_admin(), and rewrites the 28 policies that
-- inlined the raw JWT expression to call it instead.
--
-- Before: every admin-capable policy inlined
--   ((( SELECT auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
-- across 10 tables (bid_sheets, customers, migration_config,
-- migration_detail_lines, proposals, rate_cards, scenario_lines, scenarios,
-- scoped_services, service_hours). A single typo in any copy could silently
-- widen or break admin access, and there was no one place to audit "what
-- counts as an admin".
--
-- After: policies call (SELECT public.auth_is_admin()). Behavior is
-- identical -- the function body is the exact same expression -- but the
-- definition now lives in one auditable place.
--
-- Performance: the helper is STABLE and every call site keeps the (SELECT ...)
-- wrapper, so PostgreSQL evaluates it once per statement as an InitPlan
-- (the same optimization applied in 20260424193621_rls_perf_and_indexes),
-- not once per row.
--
-- Security: SECURITY INVOKER (the default). It reads only auth.jwt() -- the
-- caller's own token -- so it needs no elevated rights. search_path is pinned
-- to '' (advisor 0011); auth.jwt() is fully schema-qualified and the -> / ->>
-- operators resolve from pg_catalog. EXECUTE is granted only to the
-- authenticated role (which every one of these policies runs under);
-- PUBLIC/anon are not granted, matching the least-privilege posture of
-- 20260629184500_lock_down_definer_function_execute.
--
-- Policies are updated with ALTER POLICY (not DROP/CREATE): there is no window
-- where the row is unprotected, and cmd/roles are preserved untouched. Each
-- expression below is the current policy definition with only the inline admin
-- clause swapped for (SELECT public.auth_is_admin()).

BEGIN;

-- 1. The helper. coalesce(...) returns false (never NULL) when the role claim
--    is absent. In a boolean OR / policy context NULL and false both deny, so
--    this preserves prior behavior exactly while being easier to reason about.
CREATE OR REPLACE FUNCTION public.auth_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT coalesce(
    ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.auth_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO authenticated;

-- 2. bid_sheets -- mutate rows whose parent proposal is owned by the caller
--    (or admin).
ALTER POLICY "Users can delete bid_sheets via owned proposal or admin"
  ON public.bid_sheets
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals
      WHERE proposals.id = bid_sheets.proposal_id
        AND (proposals.created_by = (SELECT auth.uid()) OR (SELECT public.auth_is_admin()))
    )
  );

ALTER POLICY "Users can insert bid_sheets via owned proposal or admin"
  ON public.bid_sheets
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.proposals
      WHERE proposals.id = bid_sheets.proposal_id
        AND (proposals.created_by = (SELECT auth.uid()) OR (SELECT public.auth_is_admin()))
    )
  );

ALTER POLICY "Users can update bid_sheets via owned proposal or admin"
  ON public.bid_sheets
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals
      WHERE proposals.id = bid_sheets.proposal_id
        AND (proposals.created_by = (SELECT auth.uid()) OR (SELECT public.auth_is_admin()))
    )
  );

-- 3. customers.
ALTER POLICY "Authenticated users can create customers"
  ON public.customers
  WITH CHECK (
    ((SELECT auth.uid()) = created_by) OR (SELECT public.auth_is_admin())
  );

ALTER POLICY "Users can delete own customers if no proposals or admin"
  ON public.customers
  USING (
    (
      ((SELECT auth.uid()) = created_by)
      AND NOT EXISTS (
        SELECT 1 FROM public.proposals WHERE proposals.customer_id = customers.id
      )
    )
    OR (SELECT public.auth_is_admin())
  );

ALTER POLICY "Users can update own customers or admin"
  ON public.customers
  USING (
    ((SELECT auth.uid()) = created_by) OR (SELECT public.auth_is_admin())
  )
  WITH CHECK (
    ((SELECT auth.uid()) = created_by) OR (SELECT public.auth_is_admin())
  );

-- 4. migration_config (parent proposal aliased p).
ALTER POLICY "Users can delete migration_config via owned proposal or admin"
  ON public.migration_config
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = migration_config.proposal_id
        AND (p.created_by = (SELECT auth.uid()) OR (SELECT public.auth_is_admin()))
    )
  );

ALTER POLICY "Users can insert migration_config via owned proposal or admin"
  ON public.migration_config
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = migration_config.proposal_id
        AND (p.created_by = (SELECT auth.uid()) OR (SELECT public.auth_is_admin()))
    )
  );

ALTER POLICY "Users can update migration_config via owned proposal or admin"
  ON public.migration_config
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = migration_config.proposal_id
        AND (p.created_by = (SELECT auth.uid()) OR (SELECT public.auth_is_admin()))
    )
  );

-- 5. migration_detail_lines. NOTE: the policy names are truncated to
--    PostgreSQL's 63-character identifier limit (they end in "or a"); the
--    strings below match the stored names exactly.
ALTER POLICY "Users can delete migration_detail_lines via owned proposal or a"
  ON public.migration_detail_lines
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = migration_detail_lines.proposal_id
        AND (p.created_by = (SELECT auth.uid()) OR (SELECT public.auth_is_admin()))
    )
  );

ALTER POLICY "Users can insert migration_detail_lines via owned proposal or a"
  ON public.migration_detail_lines
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = migration_detail_lines.proposal_id
        AND (p.created_by = (SELECT auth.uid()) OR (SELECT public.auth_is_admin()))
    )
  );

ALTER POLICY "Users can update migration_detail_lines via owned proposal or a"
  ON public.migration_detail_lines
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      WHERE p.id = migration_detail_lines.proposal_id
        AND (p.created_by = (SELECT auth.uid()) OR (SELECT public.auth_is_admin()))
    )
  );

-- 6. proposals.
ALTER POLICY "Users can delete own proposals or admin"
  ON public.proposals
  USING (
    (created_by = (SELECT auth.uid())) OR (SELECT public.auth_is_admin())
  );

-- 7. rate_cards (admin-only writes).
ALTER POLICY "Admins can delete rate_cards"
  ON public.rate_cards
  USING ((SELECT public.auth_is_admin()));

ALTER POLICY "Admins can insert rate_cards"
  ON public.rate_cards
  WITH CHECK ((SELECT public.auth_is_admin()));

ALTER POLICY "Admins can update rate_cards"
  ON public.rate_cards
  USING ((SELECT public.auth_is_admin()));

-- 8. scenario_lines (parent scenario -> proposal).
ALTER POLICY "Users can delete scenario_lines via owned proposal or admin"
  ON public.scenario_lines
  USING (
    EXISTS (
      SELECT 1 FROM public.scenarios
        JOIN public.proposals ON proposals.id = scenarios.proposal_id
      WHERE scenarios.id = scenario_lines.scenario_id
        AND (proposals.created_by = (SELECT auth.uid()) OR (SELECT public.auth_is_admin()))
    )
  );

ALTER POLICY "Users can insert scenario_lines via owned proposal or admin"
  ON public.scenario_lines
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scenarios
        JOIN public.proposals ON proposals.id = scenarios.proposal_id
      WHERE scenarios.id = scenario_lines.scenario_id
        AND (proposals.created_by = (SELECT auth.uid()) OR (SELECT public.auth_is_admin()))
    )
  );

ALTER POLICY "Users can update scenario_lines via owned proposal or admin"
  ON public.scenario_lines
  USING (
    EXISTS (
      SELECT 1 FROM public.scenarios
        JOIN public.proposals ON proposals.id = scenarios.proposal_id
      WHERE scenarios.id = scenario_lines.scenario_id
        AND (proposals.created_by = (SELECT auth.uid()) OR (SELECT public.auth_is_admin()))
    )
  );

-- 9. scenarios (parent proposal).
ALTER POLICY "Users can delete scenarios via owned proposal or admin"
  ON public.scenarios
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals
      WHERE proposals.id = scenarios.proposal_id
        AND (proposals.created_by = (SELECT auth.uid()) OR (SELECT public.auth_is_admin()))
    )
  );

ALTER POLICY "Users can insert scenarios via owned proposal or admin"
  ON public.scenarios
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.proposals
      WHERE proposals.id = scenarios.proposal_id
        AND (proposals.created_by = (SELECT auth.uid()) OR (SELECT public.auth_is_admin()))
    )
  );

ALTER POLICY "Users can update scenarios via owned proposal or admin"
  ON public.scenarios
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals
      WHERE proposals.id = scenarios.proposal_id
        AND (proposals.created_by = (SELECT auth.uid()) OR (SELECT public.auth_is_admin()))
    )
  );

-- 10. scoped_services (parent proposal).
ALTER POLICY "Users can delete scoped_services via owned proposal or admin"
  ON public.scoped_services
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals
      WHERE proposals.id = scoped_services.proposal_id
        AND (proposals.created_by = (SELECT auth.uid()) OR (SELECT public.auth_is_admin()))
    )
  );

ALTER POLICY "Users can insert scoped_services via owned proposal or admin"
  ON public.scoped_services
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.proposals
      WHERE proposals.id = scoped_services.proposal_id
        AND (proposals.created_by = (SELECT auth.uid()) OR (SELECT public.auth_is_admin()))
    )
  );

ALTER POLICY "Users can update scoped_services via owned proposal or admin"
  ON public.scoped_services
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals
      WHERE proposals.id = scoped_services.proposal_id
        AND (proposals.created_by = (SELECT auth.uid()) OR (SELECT public.auth_is_admin()))
    )
  );

-- 11. service_hours (admin-only writes).
ALTER POLICY "Admins can delete service_hours"
  ON public.service_hours
  USING ((SELECT public.auth_is_admin()));

ALTER POLICY "Admins can insert service_hours"
  ON public.service_hours
  WITH CHECK ((SELECT public.auth_is_admin()));

ALTER POLICY "Admins can update service_hours"
  ON public.service_hours
  USING ((SELECT public.auth_is_admin()));

COMMIT;
