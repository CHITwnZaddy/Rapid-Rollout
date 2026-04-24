-- Migration 017: Atomic proposal bootstrap
--
-- Problem:
--   New proposals were created from the browser through a fan-out of
--   inserts across proposals, scenarios, scenario_lines, bid_sheets,
--   migration_config, and migration_detail_lines. Several child writes
--   were explicitly "best effort", which allowed half-created proposals.
--
-- Fix:
--   Move proposal bootstrap into one Postgres function so either the
--   entire proposal skeleton exists, or nothing does.

CREATE OR REPLACE FUNCTION create_proposal_bundle(
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

  INSERT INTO proposals (
    name,
    customer_id,
    created_by
  )
  VALUES (
    p_name,
    p_customer_id,
    auth.uid()
  )
  RETURNING id INTO v_proposal_id;

  INSERT INTO scenarios (proposal_id, scenario_type, is_active)
  VALUES
    (v_proposal_id, 'P1', true),
    (v_proposal_id, 'P2', false),
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
      ROW_NUMBER() OVER (ORDER BY service_name) - 1 AS row_order
    FROM (
      SELECT DISTINCT service_name
      FROM service_hours
      WHERE status = 'Active'
    ) distinct_services
  ) modules ON true
  WHERE s.proposal_id = v_proposal_id;

  INSERT INTO bid_sheets (proposal_id, customer_id)
  VALUES (v_proposal_id, p_customer_id);

  INSERT INTO migration_config (proposal_id, doc_avg_mb_per_project)
  VALUES (v_proposal_id, 0);

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

GRANT EXECUTE ON FUNCTION create_proposal_bundle(TEXT, UUID) TO authenticated;
