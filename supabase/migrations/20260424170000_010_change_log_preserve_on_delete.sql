-- Migration 010: Preserve change_log rows when a proposal is deleted.
--
-- The original FK was ON DELETE CASCADE, which silently wiped audit records
-- the moment a proposal was removed — defeating the purpose of the audit log.
-- Changing to ON DELETE SET NULL keeps every log entry; proposal_id becomes
-- NULL for deleted proposals but the justification, action, and deleted_by
-- fields are all preserved for manager review.
--
-- The existing RLS policy already handles NULL proposal_id:
--   USING (proposal_id IS NULL OR EXISTS (...))
-- so deleted-proposal audit rows remain readable by admins without any
-- policy changes.

ALTER TABLE change_log
  DROP CONSTRAINT IF EXISTS change_log_proposal_id_fkey;

ALTER TABLE change_log
  ADD CONSTRAINT change_log_proposal_id_fkey
  FOREIGN KEY (proposal_id)
  REFERENCES proposals(id)
  ON DELETE SET NULL;
