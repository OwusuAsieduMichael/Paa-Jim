import type { SupabaseClient } from '@supabase/supabase-js';

// Supabase Auth names the authenticator-app entry after the user's email and fails
// enrolment with "error generating QR Code" when there is none. Admins sign in by
// phone only, so give them an internal label address. Nothing is ever sent to it:
// it is only the account name shown in the authenticator app.
export function totpLabel(phone: string): string {
  return `${phone.replace(/\D/g, '')}@admin.paajim.app`;
}

export async function ensureTotpLabel(db: SupabaseClient, userId: string, phone: string): Promise<void> {
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error) throw new Error(`Couldn't read the login: ${error.message}`);
  if (data.user?.email) return;
  const { error: upErr } = await db.auth.admin.updateUserById(userId, { email: totpLabel(phone), email_confirm: true });
  if (upErr) throw new Error(`Couldn't prepare the authenticator setup: ${upErr.message}`);
}
