-- Compatibility rename for migration_config BA fields that now represent
-- Sr. IM-side migration effort. This is phase 1 of a staged rollout:
-- add the new columns, backfill them, and keep old/new names mirrored
-- until the app has fully cut over and the legacy columns can be dropped.

ALTER TABLE migration_config
  ADD COLUMN sr_im_complexity_factor NUMERIC(5,2) DEFAULT 1.00,
  ADD COLUMN sr_im_trips INTEGER DEFAULT 0;

UPDATE migration_config
SET
  sr_im_complexity_factor = ba_complexity_factor,
  sr_im_trips = ba_trips
WHERE
  sr_im_complexity_factor IS DISTINCT FROM ba_complexity_factor
  OR sr_im_trips IS DISTINCT FROM ba_trips;

CREATE OR REPLACE FUNCTION sync_migration_config_sr_im_compat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.sr_im_complexity_factor :=
      COALESCE(NEW.sr_im_complexity_factor, NEW.ba_complexity_factor, 1.00);
    NEW.ba_complexity_factor := NEW.sr_im_complexity_factor;

    NEW.sr_im_trips := COALESCE(NEW.sr_im_trips, NEW.ba_trips, 0);
    NEW.ba_trips := NEW.sr_im_trips;

    RETURN NEW;
  END IF;

  IF NEW.sr_im_complexity_factor IS DISTINCT FROM OLD.sr_im_complexity_factor
     AND NEW.ba_complexity_factor IS NOT DISTINCT FROM OLD.ba_complexity_factor THEN
    NEW.ba_complexity_factor := NEW.sr_im_complexity_factor;
  ELSIF NEW.ba_complexity_factor IS DISTINCT FROM OLD.ba_complexity_factor
     AND NEW.sr_im_complexity_factor IS NOT DISTINCT FROM OLD.sr_im_complexity_factor THEN
    NEW.sr_im_complexity_factor := NEW.ba_complexity_factor;
  ELSIF NEW.sr_im_complexity_factor IS DISTINCT FROM OLD.sr_im_complexity_factor
     AND NEW.ba_complexity_factor IS DISTINCT FROM OLD.ba_complexity_factor THEN
    NEW.ba_complexity_factor := NEW.sr_im_complexity_factor;
  ELSE
    NEW.sr_im_complexity_factor :=
      COALESCE(NEW.sr_im_complexity_factor, NEW.ba_complexity_factor, 1.00);
    NEW.ba_complexity_factor := NEW.sr_im_complexity_factor;
  END IF;

  IF NEW.sr_im_trips IS DISTINCT FROM OLD.sr_im_trips
     AND NEW.ba_trips IS NOT DISTINCT FROM OLD.ba_trips THEN
    NEW.ba_trips := NEW.sr_im_trips;
  ELSIF NEW.ba_trips IS DISTINCT FROM OLD.ba_trips
     AND NEW.sr_im_trips IS NOT DISTINCT FROM OLD.sr_im_trips THEN
    NEW.sr_im_trips := NEW.ba_trips;
  ELSIF NEW.sr_im_trips IS DISTINCT FROM OLD.sr_im_trips
     AND NEW.ba_trips IS DISTINCT FROM OLD.ba_trips THEN
    NEW.ba_trips := NEW.sr_im_trips;
  ELSE
    NEW.sr_im_trips := COALESCE(NEW.sr_im_trips, NEW.ba_trips, 0);
    NEW.ba_trips := NEW.sr_im_trips;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_migration_config_sr_im_compat ON migration_config;

CREATE TRIGGER trg_sync_migration_config_sr_im_compat
BEFORE INSERT OR UPDATE ON migration_config
FOR EACH ROW
EXECUTE FUNCTION sync_migration_config_sr_im_compat();
