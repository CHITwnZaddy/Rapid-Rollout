-- =============================================================
-- ASSIGN / REVOKE ADMIN ROLE
-- Roles live in auth.users.app_metadata (Supabase-managed).
-- Run these in the Supabase SQL Editor (requires service_role).
-- =============================================================

-- Promote a user to admin by email
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'REPLACE_WITH_USER_EMAIL';

-- Verify
SELECT id, email, raw_app_meta_data->>'role' AS role
FROM auth.users
WHERE email = 'REPLACE_WITH_USER_EMAIL';

-- ---------------------------------------------------------------
-- Revoke admin (reset role to null / standard user)
-- ---------------------------------------------------------------
-- UPDATE auth.users
-- SET raw_app_meta_data = raw_app_meta_data - 'role'
-- WHERE email = 'REPLACE_WITH_USER_EMAIL';

-- ---------------------------------------------------------------
-- List all users and their current roles
-- ---------------------------------------------------------------
-- SELECT id, email, raw_app_meta_data->>'role' AS role
-- FROM auth.users
-- ORDER BY email;
