// All of these ship to the browser. They are public by design: access is
// controlled by Supabase row-level security and the API's admin checks.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://wakqutehluzrwsiqncye.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const API_URL = (import.meta.env.VITE_API_URL || 'https://paajim-api.onrender.com').replace(/\/$/, '');
