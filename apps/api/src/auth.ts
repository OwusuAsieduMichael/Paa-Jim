import type { FastifyRequest } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';

// The Node service bypasses RLS, so every handler checks authorisation here.
// There is no safety net underneath. (Handbook §1.3)

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export type Role = 'customer' | 'vendor_staff' | 'rider' | 'admin';

export interface Caller {
  id: string;
  role: Role;
  phone: string | null;
  aal: 'aal1' | 'aal2';
}

function bearer(req: FastifyRequest): string {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) throw new HttpError(401, 'Sign in required');
  return h.slice(7);
}

function decodeClaims(jwt: string): Record<string, unknown> {
  // Signature is verified by auth.getUser() below; this only reads claims
  // (aal) that getUser() doesn't return.
  const part = jwt.split('.')[1];
  if (!part) return {};
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

export async function assertUser(req: FastifyRequest, db: SupabaseClient): Promise<Caller> {
  const token = bearer(req);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Session expired — sign in again');

  const { data: profile } = await db
    .from('profiles')
    .select('role, phone, is_active')
    .eq('id', data.user.id)
    .single();
  if (!profile || !profile.is_active) throw new HttpError(403, 'Account disabled');

  const claims = decodeClaims(token);
  return {
    id: data.user.id,
    role: profile.role as Role,
    phone: profile.phone,
    aal: claims.aal === 'aal2' ? 'aal2' : 'aal1',
  };
}

export async function assertRole(req: FastifyRequest, db: SupabaseClient, ...roles: Role[]): Promise<Caller> {
  const caller = await assertUser(req, db);
  if (!roles.includes(caller.role)) throw new HttpError(403, 'Not allowed');
  return caller;
}

/** Admin routes require role=admin AND a second factor (TOTP) on this session. */
export async function assertAdmin(req: FastifyRequest, db: SupabaseClient): Promise<Caller> {
  const caller = await assertRole(req, db, 'admin');
  if (caller.aal !== 'aal2') throw new HttpError(403, 'Verify with your authenticator app first', 'mfa_required');
  return caller;
}

/** Every admin action is written with a reason. Enforced here and by a DB CHECK. */
export async function audit(
  db: SupabaseClient,
  admin: Caller,
  action: string,
  target: { type: string; id?: string },
  reason: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  if (!reason || reason.trim().length < 10) {
    throw new HttpError(400, 'Give a reason of at least 10 characters');
  }
  const { error } = await db.from('admin_actions').insert({
    admin_id: admin.id,
    action,
    target_type: target.type,
    target_id: target.id ?? null,
    reason: reason.trim(),
    payload,
  });
  if (error) throw new HttpError(500, `Audit write failed: ${error.message}`);
}
