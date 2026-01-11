-- Migration to add location fields to leads table
-- Run this after 002_leads_table.sql

-- Add location_id column
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS location_id TEXT;

-- Add location_name column  
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS location_name TEXT;

-- Add service column (for tracking what service was booked/requested)
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS service TEXT;

-- Create index for location lookups
CREATE INDEX IF NOT EXISTS idx_leads_location_id ON public.leads(location_id);
