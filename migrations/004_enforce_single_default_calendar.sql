-- Migration: Enforce Single Default Calendar
-- Prevents duplicate calendar connections for the default (NULL) location

-- 1. Create a unique index for NULL location_id
-- This ensures a user can only have one Google connection that isn't assigned to a location
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_connections_user_null_location_provider 
  ON calendar_connections(user_id, provider) 
  WHERE is_active = true AND location_id IS NULL;

-- Note: If you see an error running this migration "could not create unique index",
-- it means you currently have duplicate connections. 
-- Please delete the duplicates from the Dashboard UI first, then run this script.
