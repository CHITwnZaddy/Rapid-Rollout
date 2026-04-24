-- 021_fix_trigger_search_path.sql
-- Addresses SEC-02 from Solution Architect Review:
-- set_change_log_author and log_customer_change had no explicit
-- search_path, leaving them vulnerable to search_path hijacking
-- via objects created in an earlier-resolved schema.
--
-- Pragmatic remediation: pin search_path on each function to the
-- schemas each actually uses. Function bodies are unchanged.
--
-- Applied to prod via Supabase MCP apply_migration on 2026-04-24
-- as version 20260424184144 (name: fix_trigger_search_path).
-- This file is the source-of-truth record in the repo.

CREATE OR REPLACE FUNCTION public.set_change_log_author()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, auth, pg_temp
AS $function$
BEGIN
  -- Always stamp the author server-side. If the caller supplied
  -- a value, overwrite it. auth.uid() returns NULL for service-
  -- role or unauthenticated inserts, which remains compatible
  -- with the policy check (NULL = NULL passes CHECK constraints).
  NEW.changed_by := auth.uid();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_customer_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
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
$function$;
