-- Phase 3A report optimization:
-- centralize proposal/customer/scenario/scoped revenue totals in a read-only
-- view while keeping migration totals in TypeScript to avoid stored-total drift.

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
