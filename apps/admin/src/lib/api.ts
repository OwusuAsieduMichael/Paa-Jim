import { API_URL } from './config';
import { supabase } from './supabase';

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

/** Calls the Paa Jim API as the signed-in admin. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, 'Your session has ended. Sign in again.');
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the Paa Jim server. Check your connection and try again.');
  }
  const text = await res.text();
  const json = text ? safeJson(text) : null;
  if (!res.ok) {
    const msg = (json as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    if (res.status === 403 && (json as { code?: string } | null)?.code === 'mfa_required') {
      window.dispatchEvent(new Event('paajim:mfa-required'));
    }
    throw new ApiError(res.status, msg, (json as { code?: string } | null)?.code);
  }
  return json as T;
}

function safeJson(t: string): unknown {
  try { return JSON.parse(t); } catch { return null; }
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
