// All of these are public — they ship inside the APK. (Handbook §2.10)
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
export const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

/**
 * Demo mode: no backend configured. The app runs on an in-memory backend so
 * screens and flows can be tried on a phone before Supabase is set up.
 * Never shipped: production builds must define the Supabase variables.
 */
export const DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_DEMO === '1';

// Help & contact (Account): the support line and the WhatsApp number.
export const SUPPORT_PHONE = '+233559776547';
export const SUPPORT_WHATSAPP = '233246259166'; // digits only, for wa.me links
export const LEGAL_URL = 'https://paajim.app';
