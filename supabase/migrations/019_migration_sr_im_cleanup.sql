-- Phase 3 cleanup for the migration_config Sr. IM rename rollout.
-- The app has already cut over to sr_im_* fields, so we can now
-- remove the compatibility trigger/function and drop the legacy
-- ba_* columns that used to store Sr. IM-side migration settings.

DROP TRIGGER IF EXISTS trg_sync_migration_config_sr_im_compat ON migration_config;

DROP FUNCTION IF EXISTS sync_migration_config_sr_im_compat();

ALTER TABLE migration_config
  DROP COLUMN ba_complexity_factor,
  DROP COLUMN ba_trips;
