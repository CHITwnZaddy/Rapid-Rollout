BEGIN;

UPDATE public.scenarios
SET scenario_type = 'Opt1'
WHERE scenario_type = 'OPT1';

UPDATE public.scenarios
SET scenario_type = 'Opt2'
WHERE scenario_type = 'OPT2';

ALTER TABLE public.scenarios
  DROP CONSTRAINT IF EXISTS scenarios_scenario_type_check;

ALTER TABLE public.scenarios
  ADD CONSTRAINT scenarios_scenario_type_check
  CHECK (scenario_type IN ('P1', 'P2', 'P3', 'P4', 'Opt1', 'Opt2'));

WITH missing_scenarios AS (
  SELECT
    p.id AS proposal_id,
    wanted.scenario_type
  FROM public.proposals p
  CROSS JOIN (VALUES ('P3'), ('P4')) AS wanted(scenario_type)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.scenarios s
    WHERE s.proposal_id = p.id
      AND s.scenario_type = wanted.scenario_type
  )
)
INSERT INTO public.scenarios (proposal_id, scenario_type, is_active)
SELECT proposal_id, scenario_type, false
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
WHERE s.scenario_type IN ('P3', 'P4')
  AND NOT EXISTS (
    SELECT 1
    FROM public.scenario_lines sl
    WHERE sl.scenario_id = s.id
  );

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
      FILTER (WHERE s.scenario_type = 'P4') AS p4_cost,
    SUM(s.summary_total_cost * COALESCE(NULLIF(s.complexity_factor, 0), 1))
      FILTER (WHERE s.scenario_type = 'Opt1') AS opt1_cost,
    SUM(s.summary_total_cost * COALESCE(NULLIF(s.complexity_factor, 0), 1))
      FILTER (WHERE s.scenario_type = 'Opt2') AS opt2_cost,
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
  COALESCE(sc.p4_cost, 0) AS p4_cost,
  COALESCE(sc.opt1_cost, 0) AS opt1_cost,
  COALESCE(sc.opt2_cost, 0) AS opt2_cost,
  COALESCE(sc.scenario_total, 0) AS scenario_total,
  COALESCE(svc.scoped_raw_total, 0) *
    COALESCE(NULLIF(p.scoped_complexity_factor, 0), 1) AS scoped_total
FROM public.proposals p
LEFT JOIN public.customers c ON c.id = p.customer_id
LEFT JOIN scenario_costs sc ON sc.proposal_id = p.id
LEFT JOIN scoped_costs svc ON svc.proposal_id = p.id;

GRANT SELECT ON public.proposal_revenue_report_base TO authenticated;

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
    (v_proposal_id, 'P4', false),
    (v_proposal_id, 'Opt1', false),
    (v_proposal_id, 'Opt2', false);

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

  RETURN v_proposal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_proposal_bundle(TEXT, UUID) TO authenticated;

COMMIT;
