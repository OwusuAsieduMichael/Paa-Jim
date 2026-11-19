import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { errorText } from '../lib/api';
import { initials } from '../lib/format';

export function Badge({ tone = 'grey', children, dot }: { tone?: string; children: ReactNode; dot?: boolean }) {
  return <span className={`badge ${tone === 'grey' ? '' : tone}`}>{dot && <span className="dot" />}{children}</span>;
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" className="switch" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} />;
}

export function Avatar({ url, name, size = 34 }: { url?: string | null; name?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {url && !broken ? <img src={url} alt="" onError={() => setBroken(true)} /> : initials(name)}
    </span>
  );
}

export function Notice({ tone, children }: { tone?: 'info' | 'ok'; children: ReactNode }) {
  return <div className={`notice ${tone ?? ''}`} role={tone ? 'status' : 'alert'}>{children}</div>;
}

/** Loads data, with loading/error state and a reload(). Refreshes every `everyMs` if given. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = [], everyMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    setLoading(true);
    try { setData(await fnRef.current()); setError(null); }
    catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void reload();
    if (!everyMs) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') void reload(); }, everyMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading, reload, setData };
}

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export interface ReasonRequest {
  title: string;
  body?: ReactNode;
  confirm: string;
  danger?: boolean;
  /** Extra fields shown above the reason (e.g. refund amount). */
  extra?: ReactNode;
  run: (reason: string) => Promise<unknown>;
}

/** Every admin action needs a written reason (10+ characters); it's saved to the audit log. */
export function ReasonDialog({ req, onClose, onDone }: { req: ReasonRequest; onClose: () => void; onDone?: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = reason.trim().length >= 10;
  async function submit() {
    if (!ok || busy) return;
    setBusy(true); setError(null);
    try { await req.run(reason.trim()); onDone?.(); onClose(); }
    catch (e) { setError(errorText(e)); setBusy(false); }
  }
  return (
    <Dialog title={req.title} onClose={busy ? () => undefined : onClose}>
      {req.body && <div className="muted">{req.body}</div>}
      {req.extra}
      <label className="field">
        <span>Reason <span className="hint">· at least 10 characters, saved to the audit log</span></span>
        <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus maxLength={500}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(); }} />
      </label>
      {error && <Notice>{error}</Notice>}
      <div className="actions">
        <button className="btn plain" onClick={onClose} disabled={busy}>Cancel</button>
        <button className={`btn ${req.danger ? '' : 'green'}`} onClick={() => void submit()} disabled={!ok || busy}>{busy ? 'Saving…' : req.confirm}</button>
      </div>
    </Dialog>
  );
}

/** Small helper so pages can open a ReasonDialog with one call. */
export function useReason() {
  const [req, setReq] = useState<(ReasonRequest & { onDone?: () => void }) | null>(null);
  const node = req ? <ReasonDialog req={req} onClose={() => setReq(null)} onDone={req.onDone} /> : null;
  return { ask: (r: ReasonRequest & { onDone?: () => void }) => setReq(r), node };
}
