import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { phone as prettyPhone, toE164 } from '../lib/format';
import { Notice } from '../components/ui';
import { errorText } from '../lib/api';

function Frame({ step, children }: { step: 1 | 2 | 3; children: ReactNode }) {
  return (
    <div className="login">
      <section className="hero">
        <img src="/icon-192.png" alt="" />
        <h1>Paa Jim Admin</h1>
        <p>Money, people and switches in one place: orders, refunds, the menu, riders, kitchen staff and admins. Every action is logged with a reason.</p>
      </section>
      <section className="pane">
        <div className="box">
          <div className="steps" aria-hidden="true">{[1, 2, 3].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
          {children}
        </div>
      </section>
    </div>
  );
}

function friendly(msg: string): string {
  if (/signups? not allowed|user not found/i.test(msg)) return 'This number doesn’t have a Paa Jim admin account.';
  if (/expired|invalid/i.test(msg)) return 'That code is wrong or has expired. Check it, or send a new one.';
  if (/rate|too many|security purposes/i.test(msg)) return 'Too many attempts. Wait a minute, then try again.';
  if (/hook|sms/i.test(msg)) return 'We couldn’t send the SMS code right now. Try again shortly.';
  return msg;
}

/** Steps 1–2: phone number and SMS code. Only existing accounts can sign in here. */
export function PhoneLogin() {
  const [raw, setRaw] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const e164 = toE164(raw);
    if (!e164) { setError('Enter a Ghana mobile number, like 055 123 4567.'); return; }
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({ phone: `+${e164}`, options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) { setError(friendly(error.message)); return; }
    setSentTo(e164); setCode('');
  }

  async function verify() {
    if (!sentTo || code.length !== 6) return;
    setBusy(true); setError(null);
    const { error } = await supabase.auth.verifyOtp({ phone: `+${sentTo}`, token: code, type: 'sms' });
    setBusy(false);
    if (error) setError(friendly(error.message));
    // On success the auth listener in App moves on to the authenticator step.
  }

  if (!sentTo) {
    return (
      <Frame step={1}>
        <h2>Sign in</h2>
        <p className="muted">For Paa Jim admins only. We’ll text a code to your number.</p>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <label className="field"><span>Phone number</span>
            <input className="input" type="tel" inputMode="tel" autoComplete="tel" placeholder="055 123 4567" value={raw} onChange={(e) => setRaw(e.target.value)} autoFocus />
          </label>
          {error && <Notice>{error}</Notice>}
          <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
        </form>
      </Frame>
    );
  }
  return (
    <Frame step={2}>
      <h2>Enter the SMS code</h2>
      <p className="muted">Sent to {prettyPhone(sentTo)}.</p>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
        <input className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label="6-digit code"
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
        {error && <Notice>{error}</Notice>}
        <button className="btn" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Continue'}</button>
        <div className="inline">
          <button type="button" className="link-btn" onClick={() => void send()} disabled={busy}>Send a new code</button>
          <span className="spacer" />
          <button type="button" className="link-btn" onClick={() => { setSentTo(null); setError(null); }}>Use a different number</button>
        </div>
      </form>
    </Frame>
  );
}

/** Step 3: the authenticator app. Sets it up the first time, then asks for the code each sign-in. */
export function Mfa({ onDone, onSignOut }: { onDone: () => void; onSignOut: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        const verified = data.totp[0];
        if (verified) { if (live) { setFactorId(verified.id); setReady(true); } return; }
        // Clear half-finished setups, then start a fresh one.
        for (const f of data.all.filter((f) => f.factor_type === 'totp' && f.status !== 'verified')) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
        const r = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Paa Jim admin ${new Date().toISOString().slice(0, 10)}` });
        if (r.error) throw r.error;
        if (live) { setFactorId(r.data.id); setEnroll({ qr: r.data.totp.qr_code, secret: r.data.totp.secret }); setReady(true); }
      } catch (e) {
        if (live) { setError(errorText(e)); setReady(true); }
      }
    })();
    return () => { live = false; };
  }, []);

  async function verify() {
    if (!factorId || code.length !== 6) return;
    setBusy(true); setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (error) { setError(/invalid|expired/i.test(error.message) ? 'That code didn’t match. Use the newest code in your authenticator app.' : error.message); setCode(''); return; }
    onDone();
  }

  return (
    <Frame step={3}>
      <h2>{enroll ? 'Set up your authenticator app' : 'Two-step check'}</h2>
      {!ready && <p className="muted">Loading…</p>}
      {enroll && (
        <>
          <p className="muted">Install Google Authenticator or Microsoft Authenticator on your phone, tap <b>+</b>, and scan this code. You only do this once.</p>
          <img className="qr" src={enroll.qr} alt="QR code for your authenticator app" />
          <details>
            <summary className="small muted">Can’t scan? Enter this key instead</summary>
            <p className="secret">{enroll.secret}</p>
          </details>
        </>
      )}
      {ready && factorId && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
          <label className="field"><span>6-digit code from the app</span>
            <input className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
          </label>
          {error && <Notice>{error}</Notice>}
          <button className="btn" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : enroll ? 'Finish setup & open dashboard' : 'Verify & open dashboard'}</button>
        </form>
      )}
      {ready && !factorId && error && <Notice>{error}</Notice>}
      <button type="button" className="link-btn" onClick={onSignOut}>Use a different account</button>
    </Frame>
  );
}

export function NotAdmin({ message, onSignOut }: { message: string; onSignOut: () => void }) {
  return (
    <Frame step={1}>
      <h2>No admin access</h2>
      <Notice>{message}</Notice>
      <p className="muted">Ask an existing admin to add your number under Team → Admins.</p>
      <button className="btn plain" onClick={onSignOut}>Sign out</button>
    </Frame>
  );
}
