BEGIN;

-- The P3/P4 rollout rewrote create_proposal_bundle and accidentally dropped
-- the migration_detail_lines seed insert. New proposals then opened the
-- Migration Services tab with a config row but no editable detail rows.
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

-- Repair proposals created while the bootstrap function was missing
-- migration detail rows. This is intentionally idempotent.
INSERT INTO public.migration_config (proposal_id)
SELECT p.id
FROM public.proposals p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.migration_config mc
  WHERE mc.proposal_id = p.id
)
ON CONFLICT (proposal_id) DO NOTHING;

WITH target_proposals AS (
  SELECT p.id AS proposal_id
  FROM public.proposals p
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.migration_detail_lines mdl
    WHERE mdl.proposal_id = p.id
  )
),
default_lines AS (
  SELECT *
  FROM (
    VALUES
      ('project', 'Project Info/Detail', 0::numeric, 0::numeric, 0::numeric, 0),
      ('project', 'Schedules', 0::numeric, 0::numeric, 0::numeric, 1),
      ('workflow', 'WF Object Name', 0::numeric, 0::numeric, 0::numeric, 0),
      ('workflow', 'WF Object Name', 0::numeric, 0::numeric, 0::numeric, 1),
      ('workflow', 'WF Object Name', 0::numeric, 0::numeric, 0::numeric, 2),
      ('workflow', 'WF Object Name', 0::numeric, 0::numeric, 0::numeric, 3),
      ('workflow', 'WF Object Name', 0::numeric, 0::numeric, 0::numeric, 4),
      ('workflow', 'WF Object Name', 0::numeric, 0::numeric, 0::numeric, 5),
      ('workflow', 'WF Object Name', 0::numeric, 0::numeric, 0::numeric, 6),
      ('workflow', 'WF Object Name', 0::numeric, 0::numeric, 0::numeric, 7),
      ('workflow', 'WF Object Name', 0::numeric, 0::numeric, 0::numeric, 8),
      ('workflow', 'WF Object Name', 0::numeric, 0::numeric, 0::numeric, 9),
      ('workflow', 'WF Object Name', 0::numeric, 0::numeric, 0::numeric, 10),
      ('cost', 'Budgets', 1::numeric, 0::numeric, 0::numeric, 0),
      ('cost', 'Commitments', 0::numeric, 0::numeric, 0::numeric, 1),
      ('cost', 'Commitment Changes', 0::numeric, 0::numeric, 0::numeric, 2),
      ('cost', 'Commitment Invoices', 0::numeric, 0::numeric, 0::numeric, 3),
      ('cost', 'General Invoices', 0::numeric, 0::numeric, 0::numeric, 4),
      ('cost', 'TBD', 0::numeric, 0::numeric, 0::numeric, 5),
      ('cost', 'TBD', 0::numeric, 0::numeric, 0::numeric, 6),
      ('cost', 'TBD', 0::numeric, 0::numeric, 0::numeric, 7),
      ('cost', 'TBD', 0::numeric, 0::numeric, 0::numeric, 8)
  ) AS lines(section, label, quantity, items_per_object, total_line_items, row_order)
)
INSERT INTO public.migration_detail_lines (
  proposal_id,
  section,
  label,
  quantity,
  items_per_object,
  total_line_items,
  row_order
)
SELECT
  target_proposals.proposal_id,
  default_lines.section,
  default_lines.label,
  default_lines.quantity,
  default_lines.items_per_object,
  default_lines.total_line_items,
  default_lines.row_order
FROM target_proposals
CROSS JOIN default_lines;

COMMIT;
