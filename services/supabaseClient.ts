import { createClient } from '@supabase/supabase-js';

// ------------------------------------------------------------------
// CONFIGURATION
// Replace these with your actual Project URL and Anon Key from Supabase
// ------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zkqgqnmjnbcnemswodub.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '<REDACTED_SUPABASE_ANON_KEY>';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
