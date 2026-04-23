-- Migration 020: Atomic scenario grid persistence
--
-- Problem:
--   Scenario Grid currently saves from the browser through two direct
--   writes: one to scenario_lines and one to scenarios.summary_total_*.
--   If either write fails independently, the stored line items and the
--   stored scenario totals can drift apart.
--
-- Fix:
--   Persist the full authoritative grid payload through one Postgres
--   function so the line updates and parent summary update commit or
--   roll back together.

CREATE OR REPLACE FUNCTION save_scenario_grid(
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
  JOIN proposals ON proposals.id = scenarios.proposal_id
  WHERE scenarios.id = p_scenario_id
    AND (
      proposals.created_by = auth.uid()
      OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    )
  FOR UPDATE OF scenarios;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scenario not found or you do not have permission to edit it.';
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

GRANT EXECUTE ON FUNCTION save_scenario_grid(UUID, JSONB, NUMERIC, NUMERIC) TO authenticated;
