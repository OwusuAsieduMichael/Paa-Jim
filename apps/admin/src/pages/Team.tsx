import { useState } from 'react';
import { api, errorText } from '../lib/api';
import { phone as prettyPhone, time, toE164 } from '../lib/format';
import { go } from '../lib/router';
import type { Me, Overview, Person } from '../lib/types';
import { Avatar, Badge, Notice, useLoad, useReason } from '../components/ui';

type Tab = 'riders' | 'kitchen' | 'admins';
const TABS: { key: Tab; label: string; role: Person['role']; one: string }[] = [
  { key: 'riders', label: 'Riders', role: 'rider', one: 'rider' },
  { key: 'kitchen', label: 'Kitchen staff', role: 'vendor_staff', one: 'kitchen staff member' },
  { key: 'admins', label: 'Admins', role: 'admin', one: 'admin' },
];

export function Team({ me, tab: tabParam }: { me: Me; tab: string | null }) {
  const tab = TABS.find((t) => t.key === tabParam) ?? TABS[0]!;
  const team = useLoad(() => api<Person[]>('/admin/team'));
  const reason = useReason();
  const people = (team.data ?? []).filter((p) => p.role === tab.role).sort((a, b) => Number(b.is_active) - Number(a.is_active) || (a.full_name ?? '').localeCompare(b.full_name ?? ''));
  const counts = Object.fromEntries(TABS.map((t) => [t.key, (team.data ?? []).filter((p) => p.role === t.role).length]));

  const base = tab.key === 'riders' ? '/admin/riders' : tab.key === 'kitchen' ? '/admin/vendor-staff' : '/admin/admins';

  function pause(p: Person) {
    const name = p.full_name ?? 'this person';
    reason.ask({
      title: p.is_active ? `Pause ${name}?` : `Let ${name} sign in again?`,
      body: p.is_active ? 'They’re signed out straight away and can’t sign in until you resume them. Their role stays.' : 'They can sign in again with their phone number.',
      confirm: p.is_active ? 'Pause' : 'Resume', danger: p.is_active,
      run: (r) => api(`${base}/${p.id}`, { method: 'PATCH', body: { is_active: !p.is_active, reason: r } }),
      onDone: () => void team.reload(),
    });
  }

  function remove(p: Person) {
    const name = p.full_name ?? 'this person';
    reason.ask({
      title: `Remove ${name} as ${tab.one}?`,
      body: `Their account goes back to a normal customer account. They keep their login and can still order food. ${tab.key === 'admins' ? 'They lose access to this dashboard.' : 'They lose the staff screens in the app.'}`,
      confirm: `Remove ${tab.one}`, danger: true,
      run: (r) => tab.key === 'admins'
        ? api(`/admin/admins/${p.id}`, { method: 'PATCH', body: { revoke: true, reason: r } })
        : api(`/admin/team/${p.id}/remove-role`, { body: { reason: r } }),
      onDone: () => void team.reload(),
    });
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Team &amp; controls</h1><p className="sub">Riders, kitchen staff, admins and kitchen switches. Every change asks for a reason and is logged.</p></div>
      </div>

      <section className="card">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} className="tab" role="tab" aria-selected={t.key === tab.key} onClick={() => go('team', t.key === 'riders' ? null : t.key)}>
              {t.label} <span className="muted">({counts[t.key] ?? 0})</span>
            </button>
          ))}
        </div>
        {team.error && <Notice>{team.error}</Notice>}
        {tab.key === 'admins' && (
          <Notice tone="info">Admins can see every order, issue refunds, change prices and add or remove other admins. Each admin signs in with their own phone and sets up their own authenticator app on first sign-in.</Notice>
        )}
        {people.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Phone</th>{tab.key === 'riders' && <><th>Vehicle</th><th>Shift</th></>}<th>Added</th><th>Status</th><th /></tr></thead>
              <tbody>
                {people.map((p) => {
                  const self = p.id === me.id;
                  return (
                    <tr key={p.id}>
                      <td><div className="inline" style={{ flexWrap: 'nowrap' }}><Avatar url={p.avatar_url} name={p.full_name} /><span className="strong">{p.full_name ?? '—'}</span>{self && <Badge tone="blue">You</Badge>}</div></td>
                      <td className="mono">{prettyPhone(p.phone)}</td>
                      {tab.key === 'riders' && <>
                        <td className="muted">{p.rider?.vehicle ?? '—'}</td>
                        <td>{p.rider?.on_shift ? <Badge tone="green" dot>On shift</Badge> : <Badge>Off shift</Badge>}</td>
                      </>}
                      <td className="muted">{time(p.created_at)}</td>
                      <td>{p.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Paused</Badge>}</td>
                      <td className="right">
                        {self ? <span className="small muted">Ask another admin to change your access</span> : (
                          <div className="inline" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                            <button className="btn plain sm" onClick={() => pause(p)}>{p.is_active ? 'Pause' : 'Resume'}</button>
                            <button className="link-btn small" onClick={() => remove(p)}>Remove</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">{team.loading ? 'Loading…' : `No ${tab.label.toLowerCase()} yet.`}</div>}
        <AddPerson tab={tab.key} one={tab.one} onAdded={() => void team.reload()} />
      </section>

      <KitchenControls />
      {reason.node}
    </>
  );
}

function AddPerson({ tab, one, onAdded }: { tab: Tab; one: string; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [raw, setRaw] = useState('');
  const [vehicle, setVehicle] = useState('Motorbike');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function add() {
    const e164 = toE164(raw);
    if (name.trim().length < 2) { setMsg({ ok: false, text: 'Enter their full name.' }); return; }
    if (!e164) { setMsg({ ok: false, text: 'Enter a Ghana mobile number, like 055 123 4567.' }); return; }
    if (reason.trim().length < 10) { setMsg({ ok: false, text: 'Give a reason of at least 10 characters.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const path = tab === 'riders' ? '/admin/riders' : tab === 'kitchen' ? '/admin/vendor-staff' : '/admin/admins';
      const r = await api<{ promoted?: boolean }>(path, { body: { full_name: name.trim(), phone: e164, reason: reason.trim(), ...(tab === 'riders' ? { vehicle } : {}) } });
      setMsg({ ok: true, text: `${name.trim()} is now ${one === 'admin' ? 'an admin' : `a ${one}`}. ${r.promoted ? 'Their existing account was upgraded. ' : ''}They sign in with ${prettyPhone(e164)}${tab === 'admins' ? ' at admin.paajim.app' : ' in the Paa Jim app'}.` });
      setName(''); setRaw(''); setReason('');
      onAdded();
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); }
    finally { setBusy(false); }
  }

  return (
    <form className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }} onSubmit={(e) => { e.preventDefault(); void add(); }}>
      <h3>Add {one === 'admin' ? 'an admin' : `a ${one}`}</h3>
      <div className="form-grid">
        <label className="field"><span>Full name</span><input className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Michael Asiedu" /></label>
        <label className="field"><span>Phone <span className="hint">· the number they sign in with</span></span><input className="input" type="tel" inputMode="tel" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="055 123 4567" /></label>
        {tab === 'riders' && (
          <label className="field"><span>Vehicle</span>
            <select className="select" value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
              <option>Motorbike</option><option>Bicycle</option><option>Car</option><option>On foot</option>
            </select>
          </label>
        )}
        <label className="field"><span>Reason <span className="hint">· 10+ characters</span></span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tab === 'admins' ? 'e.g. Co-owner, manages refunds' : 'e.g. New rider starting Monday'} /></label>
      </div>
      {tab === 'admins' && <p className="small muted">If this number already uses the Paa Jim app as a customer, that account becomes an admin account. Admin accounts open this dashboard, not the ordering screens.</p>}
      {msg && <Notice tone={msg.ok ? 'ok' : undefined}>{msg.text}</Notice>}
      <div><button className="btn" disabled={busy}>{busy ? 'Adding…' : `Add ${one}`}</button></div>
    </form>
  );
}

function KitchenControls() {
  const ov = useLoad(() => api<Overview>('/admin/overview'));
  const v = ov.data?.vendor;
  const [f, setF] = useState<{ max: string; prep: string; km: string } | null>(null);
  const reason = useReason();
  const vals = f ?? (v ? { max: String(v.max_concurrent_orders), prep: String(v.prep_minutes), km: String(Number(v.max_delivery_km)) } : null);
  const dirty = Boolean(v && f && (Number(f.max) !== v.max_concurrent_orders || Number(f.prep) !== v.prep_minutes || Number(f.km) !== Number(v.max_delivery_km)));

  function save() {
    if (!v || !f) return;
    reason.ask({
      title: 'Save kitchen controls?',
      confirm: 'Save',
      run: (r) => api('/admin/vendor/capacity', { method: 'PATCH', body: { max_concurrent_orders: Number(f.max), prep_minutes: Number(f.prep), max_delivery_km: Number(f.km), reason: r } }),
      onDone: () => { setF(null); void ov.reload(); },
    });
  }
  function suspend() {
    if (!v) return;
    reason.ask({
      title: v.is_suspended ? 'Lift the kitchen suspension?' : 'Suspend the kitchen?',
      body: v.is_suspended ? 'The kitchen can take orders again when it opens.' : 'Emergency stop: no new orders at all until you lift it, even if staff open the kitchen. Orders in progress carry on.',
      confirm: v.is_suspended ? 'Lift suspension' : 'Suspend kitchen', danger: !v.is_suspended,
      run: (r) => api('/admin/vendor/suspend', { body: { suspended: !v.is_suspended, reason: r } }),
      onDone: () => void ov.reload(),
    });
  }

  return (
    <section className="card">
      <div className="card-head"><h2>Kitchen controls</h2>{v && <span className="meta">Kitchen staff open and close the kitchen in the app · last opened by staff: {v.is_open ? 'open now' : 'closed'}</span>}</div>
      {ov.error && <Notice>{ov.error}</Notice>}
      {vals && (
        <div className="form-grid">
          <label className="field"><span>Max orders cooking at once</span><input className="input mono" inputMode="numeric" value={vals.max} onChange={(e) => setF({ ...vals, max: e.target.value.replace(/\D/g, '') })} /></label>
          <label className="field"><span>Prep time (minutes)</span><input className="input mono" inputMode="numeric" value={vals.prep} onChange={(e) => setF({ ...vals, prep: e.target.value.replace(/\D/g, '') })} /></label>
          <label className="field"><span>Furthest delivery (km)</span><input className="input mono" inputMode="decimal" value={vals.km} onChange={(e) => setF({ ...vals, km: e.target.value.replace(/[^\d.]/g, '') })} /></label>
        </div>
      )}
      <div className="inline">
        {dirty && <button className="btn green" onClick={save}>Save controls</button>}
        {dirty && <button className="btn plain" onClick={() => setF(null)}>Discard</button>}
        <span className="spacer" />
        {v && <button className={`btn ${v.is_suspended ? 'green' : 'ghost'}`} onClick={suspend}>{v.is_suspended ? 'Lift suspension' : 'Suspend kitchen'}</button>}
      </div>
      {reason.node}
    </section>
  );
}
