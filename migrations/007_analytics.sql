-- Migration: 007_analytics.sql
-- Purpose: Track booking history locally for analytics and reporting

-- 1. Create bookings table
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  location_id text, -- Optional: Link to specific location
  
  customer_name text,
  customer_email text,
  customer_phone text,
  
  service_type text, -- e.g. "Dental Cleaning"
  description text,
  
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  
  status text DEFAULT 'confirmed', -- 'confirmed', 'cancelled', 'completed'
  provider text DEFAULT 'google',
  event_link text, -- Link to Google Calendar event
  
  created_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);

-- 2. Enable RLS
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- 3. Policies

-- Policy: Users can view their own bookings
DROP POLICY IF EXISTS "Users can view own bookings" ON public.bookings;
CREATE POLICY "Users can view own bookings" ON public.bookings
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Service Role (Server) can do everything
DROP POLICY IF EXISTS "Service role full access bookings" ON public.bookings;
CREATE POLICY "Service role full access bookings" ON public.bookings
  FOR ALL USING (true) WITH CHECK (true);

-- 4. Index for reporting performance
CREATE INDEX IF NOT EXISTS bookings_user_id_start_time_idx ON public.bookings (user_id, start_time);
