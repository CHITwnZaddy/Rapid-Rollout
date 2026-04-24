-- Migration 015: Proposal status history
--
-- Rationale: leadership reports (Time to Close, Stale Proposals,
-- expanded Proposal Log) need reliable timestamps for *when* a
-- proposal transitioned between statuses. `proposals.updated_at`
-- changes on any column edit, so it's not a reliable signal.
--
-- This table captures one row per status transition. It is written
-- to exclusively by the `updateProposalStatus` server action — the
-- old "save on change" dropdown is being replaced with an explicit
-- Save button so transitions are intentional and match a history row.
--
-- Backfill: seed one row per existing proposal at its created_at so
-- reports can compute "days in current status" from day one.

CREATE TABLE proposal_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_history_proposal
  ON proposal_status_history(proposal_id, changed_at DESC);

-- Backfill: one row per existing proposal seeded at created_at.
-- old_status is NULL to mark this as the initial entry.
INSERT INTO proposal_status_history
  (proposal_id, old_status, new_status, changed_by, changed_at)
SELECT id, NULL, status, created_by, created_at
  FROM proposals;

-- RLS: mirror the proposals policy — users can read/insert history
-- rows for proposals they own. Deletes cascade from proposals.
ALTER TABLE proposal_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "status_history_select_own"
  ON proposal_status_history FOR SELECT
  USING (
    proposal_id IN (SELECT id FROM proposals WHERE created_by = auth.uid())
  );

CREATE POLICY "status_history_insert_own"
  ON proposal_status_history FOR INSERT
  WITH CHECK (
    proposal_id IN (SELECT id FROM proposals WHERE created_by = auth.uid())
    AND changed_by = auth.uid()
  );
