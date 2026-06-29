-- 20260629184500_lock_down_definer_function_execute.sql
-- Addresses Supabase database-linter advisors:
--   0028 anon_security_definer_function_executable
--   0029 authenticated_security_definer_function_executable
--   0011 function_search_path_mutable
--
-- Findings (security advisors, 2026-06-29):
--   - public.handle_new_user_profile()  SECURITY DEFINER, EXECUTE granted to
--     PUBLIC -> callable by anon/authenticated via /rest/v1/rpc.
--   - public.set_customer_created_by()  same.
--   - public.rls_auto_enable()          same (staging only; an event-trigger
--     helper that auto-enables RLS on new public tables).
--   - public.display_name_from_email()  no pinned search_path (0011) and
--     needlessly exposed on the REST API.
--
-- Why revoking EXECUTE is safe: all three SECURITY DEFINER functions are
-- (event) trigger functions. PostgreSQL does NOT check the EXECUTE privilege
-- of the triggering role when firing a trigger, so revoking EXECUTE from the
-- API roles does not affect INSERTs on customers, new-user profile creation,
-- or the DDL event trigger. It only removes the rpc call surface.
-- rls_auto_enable additionally returns event_trigger, which Postgres refuses
-- to invoke outside an event-trigger context, so it was never a live rpc.
--
-- display_name_from_email is IMMUTABLE SQL (string formatting only). It is
-- called internally by handle_new_user_profile, which is SECURITY DEFINER
-- owned by postgres and therefore retains EXECUTE regardless of these grants.
-- No application code calls it via .rpc(), so removing the anon/authenticated
-- grant is pure attack-surface reduction.
--
-- The rls_auto_enable revoke is guarded by to_regprocedure() because the
-- function exists on staging but not production; the guard makes this
-- migration safe to apply unchanged to both projects.
--
-- Applied to staging (Rapid-Rollout-Staging, qskevpfxmvdlykollnod) via
-- Supabase MCP apply_migration on 2026-06-29; security advisors returned
-- zero lints afterward. Production application pending. This file is the
-- source-of-truth record in the repo.

BEGIN;

-- 1. Pin search_path on display_name_from_email (advisor 0011). Body is
--    unchanged; it only uses pg_catalog built-ins, which remain resolvable
--    under an empty search_path. CREATE OR REPLACE preserves the existing
--    ACL, so the REVOKE below still applies.
CREATE OR REPLACE FUNCTION public.display_name_from_email(p_email TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT initcap(
    regexp_replace(split_part(COALESCE(p_email, ''), '@', 1), '[._-]+', ' ', 'g')
  );
$$;

-- 2. Revoke EXECUTE from the API roles. Guarded for existence so the same
--    file applies cleanly to both staging (has rls_auto_enable) and prod
--    (does not).
DO $$
BEGIN
  IF to_regprocedure('public.handle_new_user_profile()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile()
      FROM PUBLIC, anon, authenticated;
  END IF;

  IF to_regprocedure('public.set_customer_created_by()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.set_customer_created_by()
      FROM PUBLIC, anon, authenticated;
  END IF;

  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()
      FROM PUBLIC, anon, authenticated;
  END IF;

  IF to_regprocedure('public.display_name_from_email(text)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.display_name_from_email(text)
      FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

COMMIT;
