BEGIN;

-- Team request (2026-06-10): retire the Phase 4 scenario and add an
-- Option 3 scenario. Austin chose DELETE for existing P4 rows after we
-- verified production has 3 P4 scenarios, all with zero cost and zero
-- hours. The guard below makes that assumption explicit: if any P4 row
-- ever carries real data (e.g. staging/prod drift), the migration
-- aborts instead of silently destroying work.

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.scenarios
  WHERE scenario_type = 'P4'
    AND (COALESCE(summary_total_cost, 0) > 0 OR COALESCE(summary_total_hours, 0) > 0);

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Aborting: % Phase 4 scenario(s) carry hours or cost. Review before deleting.',
      v_count;
  END IF;
END;
$$;

-- 1. Remove Phase 4 (lines first, then the scenario rows).
DELETE FROM public.scenario_lines
WHERE scenario_id IN (
  SELECT id FROM public.scenarios WHERE scenario_type = 'P4'
);

DELETE FROM public.scenarios WHERE scenario_type = 'P4';

-- 2. Allowed scenario types: P4 out, Opt3 in.
ALTER TABLE public.scenarios
  DROP CONSTRAINT IF EXISTS scenarios_scenario_type_check;

ALTER TABLE public.scenarios
  ADD CONSTRAINT scenarios_scenario_type_check
  CHECK (scenario_type IN ('P1', 'P2', 'P3', 'Opt1', 'Opt2', 'Opt3'));

-- 3. Every existing proposal gets an (empty) Option 3 scenario so old
--    and new proposals behave identically. Same backfill pattern the
--    P3/P4 rollout used (20260512050000).
WITH missing_scenarios AS (
  SELECT p.id AS proposal_id
  FROM public.proposals p
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.scenarios s
    WHERE s.proposal_id = p.id
      AND s.scenario_type = 'Opt3'
  )
)
INSERT INTO public.scenarios (proposal_id, scenario_type, is_active)
SELECT proposal_id, 'Opt3', false
FROM missing_scenarios;

WITH modules AS (
  SELECT
    service_name,
    ROW_NUMBER() OVER (ORDER BY min_sort_order, service_name) - 1 AS row_order
  FROM (
    SELECT
      service_name,
      MIN(sort_order) AS min_sort_order
    FROM public.service_hours
    WHERE status = 'Active'
    GROUP BY service_name
  ) distinct_services
)
INSERT INTO public.scenario_lines (scenario_id, row_order, module)
SELECT
  s.id,
  modules.row_order,
  modules.service_name
FROM public.scenarios s
JOIN modules ON true
WHERE s.scenario_type = 'Opt3'
  AND NOT EXISTS (
    SELECT 1
    FROM public.scenario_lines sl
    WHERE sl.scenario_id = s.id
  );

-- 4. Reporting view: p4_cost out, opt3_cost in.
DROP VIEW IF EXISTS public.proposal_revenue_report_base;

CREATE OR REPLACE VIEW public.proposal_revenue_report_base
WITH (security_invoker = true)
AS
WITH scenario_costs AS (
  SELECT
    s.proposal_id,
    SUM(s.summary_total_cost * COALESCE(NULLIF(s.complexity_factor, 0), 1))
      FILTER (WHERE s.scenario_type = 'P1') AS p1_cost,
    SUM(s.summary_total_cost * COALESCE(NULLIF(s.complexity_factor, 0), 1))
      FILTER (WHERE s.scenario_type = 'P2') AS p2_cost,
    SUM(s.summary_total_cost * COALESCE(NULLIF(s.complexity_factor, 0), 1))
      FILTER (WHERE s.scenario_type = 'P3') AS p3_cost,
    SUM(s.summary_total_cost * COALESCE(NULLIF(s.complexity_factor, 0), 1))
      FILTER (WHERE s.scenario_type = 'Opt1') AS opt1_cost,
    SUM(s.summary_total_cost * COALESCE(NULLIF(s.complexity_factor, 0), 1))
      FILTER (WHERE s.scenario_type = 'Opt2') AS opt2_cost,
    SUM(s.summary_total_cost * COALESCE(NULLIF(s.complexity_factor, 0), 1))
      FILTER (WHERE s.scenario_type = 'Opt3') AS opt3_cost,
    SUM(s.summary_total_cost * COALESCE(NULLIF(s.complexity_factor, 0), 1))
      AS scenario_total
  FROM public.scenarios s
  GROUP BY s.proposal_id
),
scoped_costs AS (
  SELECT
    ss.proposal_id,
    SUM(ss.cost) AS scoped_raw_total
  FROM public.scoped_services ss
  GROUP BY ss.proposal_id
)
SELECT
  p.id AS proposal_id,
  p.name AS proposal_name,
  p.status,
  p.customer_id,
  c.company_name AS customer_name,
  p.created_by,
  p.created_at,
  p.updated_at,
  p.scoped_complexity_factor,
  COALESCE(sc.p1_cost, 0) AS p1_cost,
  COALESCE(sc.p2_cost, 0) AS p2_cost,
  COALESCE(sc.p3_cost, 0) AS p3_cost,
  COALESCE(sc.opt1_cost, 0) AS opt1_cost,
  COALESCE(sc.opt2_cost, 0) AS opt2_cost,
  COALESCE(sc.opt3_cost, 0) AS opt3_cost,
  COALESCE(sc.scenario_total, 0) AS scenario_total,
  COALESCE(svc.scoped_raw_total, 0) *
    COALESCE(NULLIF(p.scoped_complexity_factor, 0), 1) AS scoped_total
FROM public.proposals p
LEFT JOIN public.customers c ON c.id = p.customer_id
LEFT JOIN scenario_costs sc ON sc.proposal_id = p.id
LEFT JOIN scoped_costs svc ON svc.proposal_id = p.id;

GRANT SELECT ON public.proposal_revenue_report_base TO authenticated;

-- 5. New proposals seed Opt3 instead of P4. Based on the current
--    function body (20260601042929, which includes the migration
--    detail seed) with ONLY the scenarios VALUES changed.
CREATE OR REPLACE FUNCTION public.create_proposal_bundle(
  p_name TEXT,
  p_customer_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_proposal_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to create a proposal.';
  END IF;

  INSERT INTO proposals (name, customer_id, created_by, status)
  VALUES (p_name, p_customer_id, auth.uid(), 'Discovery')
  RETURNING id INTO v_proposal_id;

  INSERT INTO proposal_status_history (
    proposal_id,
    old_status,
    new_status,
    changed_by
  )
  VALUES (
    v_proposal_id,
    NULL,
    'Discovery',
    auth.uid()
  );

  INSERT INTO scenarios (proposal_id, scenario_type, is_active)
  VALUES
    (v_proposal_id, 'P1', true),
    (v_proposal_id, 'P2', false),
    (v_proposal_id, 'P3', false),
    (v_proposal_id, 'Opt1', false),
    (v_proposal_id, 'Opt2', false),
    (v_proposal_id, 'Opt3', false);

  INSERT INTO scenario_lines (scenario_id, row_order, module)
  SELECT
    s.id,
    modules.row_order,
    modules.service_name
  FROM scenarios s
  JOIN (
    SELECT
      service_name,
      ROW_NUMBER() OVER (ORDER BY min_sort_order, service_name) - 1 AS row_order
    FROM (
      SELECT
        service_name,
        MIN(sort_order) AS min_sort_order
      FROM service_hours
      WHERE status = 'Active'
      GROUP BY service_name
    ) distinct_services
  ) modules ON true
  WHERE s.proposal_id = v_proposal_id;

  INSERT INTO bid_sheets (proposal_id, customer_id)
  VALUES (v_proposal_id, p_customer_id);

  INSERT INTO migration_config (proposal_id)
  VALUES (v_proposal_id);

  INSERT INTO migration_detail_lines (
    proposal_id,
    section,
    label,
    quantity,
    items_per_object,
    total_line_items,
    row_order
  )
  VALUES
    (v_proposal_id, 'project', 'Project Info/Detail', 0, 0, 0, 0),
    (v_proposal_id, 'project', 'Schedules', 0, 0, 0, 1),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 0),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 1),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 2),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 3),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 4),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 5),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 6),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 7),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 8),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 9),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 10),
    (v_proposal_id, 'cost', 'Budgets', 1, 0, 0, 0),
    (v_proposal_id, 'cost', 'Commitments', 0, 0, 0, 1),
    (v_proposal_id, 'cost', 'Commitment Changes', 0, 0, 0, 2),
    (v_proposal_id, 'cost', 'Commitment Invoices', 0, 0, 0, 3),
    (v_proposal_id, 'cost', 'General Invoices', 0, 0, 0, 4),
    (v_proposal_id, 'cost', 'TBD', 0, 0, 0, 5),
    (v_proposal_id, 'cost', 'TBD', 0, 0, 0, 6),
    (v_proposal_id, 'cost', 'TBD', 0, 0, 0, 7),
    (v_proposal_id, 'cost', 'TBD', 0, 0, 0, 8);

  RETURN v_proposal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_proposal_bundle(TEXT, UUID) TO authenticated;

COMMIT;
