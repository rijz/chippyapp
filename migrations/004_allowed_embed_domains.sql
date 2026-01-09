-- Migration: Add allowed_embed_domains column to settings table
-- Purpose: Store list of domains allowed to embed the chat widget (for CSP frame-ancestors)

-- Add allowed_embed_domains column (JSONB array of domain strings)
ALTER TABLE settings
ADD COLUMN IF NOT EXISTS allowed_embed_domains TEXT[] DEFAULT '{}';

-- Comment explaining the column
COMMENT ON COLUMN settings.allowed_embed_domains IS 'List of domains allowed to embed the chat widget. Used to set Content-Security-Policy frame-ancestors header.';
