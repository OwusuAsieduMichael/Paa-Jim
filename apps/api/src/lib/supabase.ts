import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../env.js';

// Service-role client. BYPASSES RLS. Every caller is responsible for its own
// authorisation checks (see auth.ts). Never expose this client or its key.
export function createServiceClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
