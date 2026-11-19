import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { api, ApiError, errorText } from './lib/api';
import type { Me } from './lib/types';
import { Mfa, NotAdmin, PhoneLogin } from './pages/Login';
import { Shell } from './components/Shell';

type Gate =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'not-admin'; message: string }
  | { kind: 'mfa' }
  | { kind: 'ready'; me: Me };

export function App() {
  const [gate, setGate] = useState<Gate>({ kind: 'loading' });

  const check = useCallback(async (session: Session | null) => {
    if (!session) { setGate({ kind: 'signed-out' }); return; }
    try {
      const me = await api<Me>('/admin/me');
      setGate(me.aal === 'aal2' ? { kind: 'ready', me } : { kind: 'mfa' });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
        setGate({ kind: 'not-admin', message: e.status === 403 ? 'This number isn’t a Paa Jim admin.' : e.message });
      } else {
        setGate({ kind: 'not-admin', message: errorText(e) });
      }
    }
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => check(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Token refreshes don't change who's signed in.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'MFA_CHALLENGE_VERIFIED' || event === 'USER_UPDATED') {
        setTimeout(() => void check(session), 0);
      }
    });
    const mfa = () => setGate({ kind: 'mfa' });
    window.addEventListener('paajim:mfa-required', mfa);
    return () => { sub.subscription.unsubscribe(); window.removeEventListener('paajim:mfa-required', mfa); };
  }, [check]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' });
    setGate({ kind: 'signed-out' });
  }, []);

  switch (gate.kind) {
    case 'loading': return <div className="empty">Loading…</div>;
    case 'signed-out': return <PhoneLogin />;
    case 'not-admin': return <NotAdmin message={gate.message} onSignOut={() => void signOut()} />;
    case 'mfa': return <Mfa onDone={() => void supabase.auth.getSession().then(({ data }) => check(data.session))} onSignOut={() => void signOut()} />;
    case 'ready': return <Shell me={gate.me} onSignOut={() => void signOut()} />;
  }
}
