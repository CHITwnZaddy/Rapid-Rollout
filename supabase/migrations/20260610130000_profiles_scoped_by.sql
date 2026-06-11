BEGIN;

-- "Scoped by" (team request, 2026-06-10): the proposal header shows the
-- creator's name, but the app had no way to turn an auth user id into a
-- human-readable name. This adds a minimal profiles table, auto-filled
-- from the signup email's local part, and backfills existing users.
-- It also unlocks future "by scoper" reporting.

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Any signed-in user can read names (needed wherever a proposal shows
-- its scoper). No client-side writes: rows are managed by the trigger.
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON public.profiles TO authenticated;

-- Derive "austin.guzman@x.com" -> "Austin Guzman". Dots/underscores/
-- hyphens in the local part become spaces, then each word is capitalized.
CREATE OR REPLACE FUNCTION public.display_name_from_email(p_email TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT initcap(
    regexp_replace(split_part(COALESCE(p_email, ''), '@', 1), '[._-]+', ' ', 'g')
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, public.display_name_from_email(NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- Backfill profiles for every existing user.
INSERT INTO public.profiles (id, display_name)
SELECT u.id, public.display_name_from_email(u.email)
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

COMMIT;
