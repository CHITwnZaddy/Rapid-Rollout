-- Phase 1C: approved proposal lifecycle statuses.
--
-- Existing rows are mapped forward so staging/prod data does not keep old
-- labels that the application no longer offers.

UPDATE public.proposals
SET status = CASE status
  WHEN 'Draft' THEN 'Discovery'
  WHEN 'Proposal Sent' THEN 'Sent for Review'
  WHEN 'Customer Review' THEN 'Awaiting Sig'
  WHEN 'Won' THEN 'Closed Won'
  WHEN 'Lost' THEN 'Closed Lost'
  WHEN 'VOID' THEN 'Closed Lost'
  ELSE status
END
WHERE status IN (
  'Draft',
  'Proposal Sent',
  'Customer Review',
  'Won',
  'Lost',
  'VOID'
);

UPDATE public.proposal_status_history
SET
  old_status = CASE old_status
    WHEN 'Draft' THEN 'Discovery'
    WHEN 'Proposal Sent' THEN 'Sent for Review'
    WHEN 'Customer Review' THEN 'Awaiting Sig'
    WHEN 'Won' THEN 'Closed Won'
    WHEN 'Lost' THEN 'Closed Lost'
    WHEN 'VOID' THEN 'Closed Lost'
    ELSE old_status
  END,
  new_status = CASE new_status
    WHEN 'Draft' THEN 'Discovery'
    WHEN 'Proposal Sent' THEN 'Sent for Review'
    WHEN 'Customer Review' THEN 'Awaiting Sig'
    WHEN 'Won' THEN 'Closed Won'
    WHEN 'Lost' THEN 'Closed Lost'
    WHEN 'VOID' THEN 'Closed Lost'
    ELSE new_status
  END
WHERE old_status IN (
    'Draft',
    'Proposal Sent',
    'Customer Review',
    'Won',
    'Lost',
    'VOID'
  )
  OR new_status IN (
    'Draft',
    'Proposal Sent',
    'Customer Review',
    'Won',
    'Lost',
    'VOID'
  );

ALTER TABLE public.proposals
  ALTER COLUMN status SET DEFAULT 'Discovery';

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
  v_scenario_type TEXT;
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

  FOREACH v_scenario_type IN ARRAY ARRAY['P1', 'P2', 'OPT1', 'OPT2']
  LOOP
    INSERT INTO scenarios (proposal_id, scenario_type)
    VALUES (v_proposal_id, v_scenario_type);
  END LOOP;

  INSERT INTO bid_sheets (proposal_id)
  VALUES (v_proposal_id);

  INSERT INTO migration_config (proposal_id)
  VALUES (v_proposal_id);

  RETURN v_proposal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_proposal_bundle(TEXT, UUID) TO authenticated;
