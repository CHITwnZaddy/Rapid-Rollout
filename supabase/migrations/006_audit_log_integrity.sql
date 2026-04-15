-- ─────────────────────────────────────────────────────────────
-- Migration 006: audit-log integrity + customer change logging
-- ─────────────────────────────────────────────────────────────
-- Phase 1.1 — Fix change_log forgery vulnerability:
--   Migration 003 created an INSERT policy on change_log with
--   `WITH CHECK (true)`, which let any authenticated user insert
--   rows with an arbitrary `changed_by` UUID, forging audit
--   entries attributed to other users. We tighten this in two
--   layers:
--     (a) Replace the policy with `changed_by = auth.uid()`
--     (b) Add a BEFORE INSERT trigger that auto-sets changed_by,
--         so the client can't even supply the value.
--
-- Phase 1.2 — Auto-log customer changes:
--   Migration 005 intentionally opened the customers table so
--   any authenticated user can insert/update/delete customers
--   (the team manages customers collaboratively). That design
--   decision needs an audit trail. We add AFTER INSERT/UPDATE/
--   DELETE triggers on `customers` that write to change_log so
--   every change is attributed and reversible.
--
--   Customer changes have no proposal_id, so change_log rows are
--   written with proposal_id = NULL. The SELECT policy from 003
--   allows all authenticated users to read rows with proposal_id
--   IS NULL, which matches the "everyone manages customers" model.
-- ─────────────────────────────────────────────────────────────

-- Phase 1.1: change_log INSERT integrity ───────────────────────

DROP POLICY IF EXISTS "Authenticated users can insert change_log" ON change_log;

CREATE POLICY "Authenticated users can insert own change_log"
  ON change_log FOR INSERT TO authenticated
  WITH CHECK (changed_by = auth.uid());

CREATE OR REPLACE FUNCTION set_change_log_author()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Always stamp the author server-side. If the caller supplied
  -- a value, overwrite it. auth.uid() returns NULL for service-
  -- role or unauthenticated inserts, which remains compatible
  -- with the policy check (NULL = NULL passes CHECK constraints).
  NEW.changed_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_change_log_author ON change_log;
CREATE TRIGGER trg_set_change_log_author
  BEFORE INSERT ON change_log
  FOR EACH ROW
  EXECUTE FUNCTION set_change_log_author();

-- Phase 1.2: customer change-logging triggers ──────────────────

CREATE OR REPLACE FUNCTION log_customer_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO change_log (table_name, record_id, action, old_values, new_values)
    VALUES ('customers', NEW.id, 'INSERT', NULL, to_jsonb(NEW));
    RETURN NEW;

  ELSIF (TG_OP = 'UPDATE') THEN
    -- Skip no-op updates (e.g. touching updated_at with no real change)
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      INSERT INTO change_log (table_name, record_id, action, old_values, new_values)
      VALUES ('customers', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;

  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO change_log (table_name, record_id, action, old_values, new_values)
    VALUES ('customers', OLD.id, 'DELETE', to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_customer_change ON customers;
CREATE TRIGGER trg_log_customer_change
  AFTER INSERT OR UPDATE OR DELETE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION log_customer_change();
