import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../utils/env';

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------
const SUPABASE_URL = getEnv('VITE_SUPABASE_URL');
const SUPABASE_ANON_KEY = getEnv('VITE_SUPABASE_ANON_KEY');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn("Missing Supabase Credentials in .env file. The app will not persist data.");
}

export const supabase = createClient(
    SUPABASE_URL || 'https://placeholder.supabase.co',
    SUPABASE_ANON_KEY || 'placeholder-key'
);
