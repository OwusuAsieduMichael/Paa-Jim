import { createClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

if (!SUPABASE_KEY) throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY is not set');

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'paajim-admin' },
});
