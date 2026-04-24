-- Migration 016: Atomic proposal status transitions
--
-- Problem:
--   updateProposalStatus previously updated proposals.status first and
--   inserted proposal_status_history second. If the history insert
--   failed, reporting drifted from truth because the status change had
--   already committed.
--
-- Fix:
--   1. Align proposal_status_history RLS with the broader proposal
--      visibility/update model (all authenticated users can read;
--      owners/admins can insert).
--   2. Move the transition into one Postgres function so the proposal
--      update and history insert commit or roll back together.

DROP POLICY IF EXISTS "status_history_select_own" ON proposal_status_history;
DROP POLICY IF EXISTS "status_history_insert_own" ON proposal_status_history;

CREATE POLICY "Authenticated users can read proposal_status_history via proposal"
  ON proposal_status_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM proposals
      WHERE proposals.id = proposal_status_history.proposal_id
    )
  );

CREATE POLICY "Users can insert proposal_status_history via owned proposal or admin"
  ON proposal_status_history FOR INSERT TO authenticated
  WITH CHECK (
    changed_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM proposals
      WHERE proposals.id = proposal_status_history.proposal_id
        AND (
          proposals.created_by = auth.uid()
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  );

CREATE OR REPLACE FUNCTION transition_proposal_status(
  p_proposal_id UUID,
  p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to change status.';
  END IF;

  SELECT proposals.status
    INTO v_current_status
  FROM proposals
  WHERE proposals.id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found or you do not have permission to edit it.';
  END IF;

  IF v_current_status = p_new_status THEN
    RETURN FALSE;
  END IF;

  UPDATE proposals
  SET status = p_new_status
  WHERE id = p_proposal_id;

  INSERT INTO proposal_status_history (
    proposal_id,
    old_status,
    new_status,
    changed_by
  )
  VALUES (
    p_proposal_id,
    v_current_status,
    p_new_status,
    auth.uid()
  );

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION transition_proposal_status(UUID, TEXT) TO authenticated;
