import type { SupabaseClient } from '@supabase/supabase-js';
import type { Env } from './env.js';
import type { Paystack } from './lib/paystack.js';
import type { Notifier } from './lib/notify.js';
import type { Jobs } from './jobs.js';

export interface Ctx {
  env: Env;
  db: SupabaseClient;
  paystack: Paystack;
  notifier: Notifier;
  jobs: Jobs;
}
