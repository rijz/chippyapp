-- Multi-Location Support Migration
-- This adds support for multiple calendars and links them to business locations

-- 1. Add location_id and location_name to leads table
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS location_id TEXT,
ADD COLUMN IF NOT EXISTS location_name TEXT;

-- Create index for location-based filtering
CREATE INDEX IF NOT EXISTS idx_leads_location_id ON public.leads(location_id);

-- 2. Modify calendar_connections to support multiple calendars per user
-- Drop the unique constraint that limits one connection per provider
ALTER TABLE calendar_connections 
DROP CONSTRAINT IF EXISTS calendar_connections_user_id_provider_key;

-- Add columns for location association and naming
ALTER TABLE calendar_connections
ADD COLUMN IF NOT EXISTS location_id TEXT,
ADD COLUMN IF NOT EXISTS location_name TEXT,
ADD COLUMN IF NOT EXISTS calendar_name TEXT,
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Create new unique constraint: one calendar per location per provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_connections_user_location_provider 
  ON calendar_connections(user_id, location_id, provider) 
  WHERE is_active = true AND location_id IS NOT NULL;

-- Create index for faster lookups by location
CREATE INDEX IF NOT EXISTS idx_calendar_connections_location 
  ON calendar_connections(user_id, location_id);

-- 3. Add metadata column to store additional calendar settings
ALTER TABLE calendar_connections
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- The metadata field can store:
-- - appointmentDuration
-- - workingHours
-- - bufferTime
-- - etc.

COMMENT ON COLUMN calendar_connections.location_id IS 'Links calendar to a specific business location';
COMMENT ON COLUMN calendar_connections.location_name IS 'Cached location name for display purposes';
COMMENT ON COLUMN calendar_connections.calendar_name IS 'User-friendly name for this calendar (e.g., "Downtown Office")';
COMMENT ON COLUMN calendar_connections.display_order IS 'Order in which calendars should be displayed';
COMMENT ON COLUMN calendar_connections.metadata IS 'Additional calendar-specific settings (JSON)';
