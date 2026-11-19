import { useMemo, useState } from 'react';
import { api, errorText } from '../lib/api';
import { supabase } from '../lib/supabase';
import { ghs } from '../lib/format';
import type { Menu, MenuItem } from '../lib/types';
import { Badge, Dialog, Notice, Switch, useLoad, useReason } from '../components/ui';

type Draft = Partial<Pick<MenuItem, 'price' | 'is_available' | 'is_popular'>>;
const BUCKET = 'menu-photos';

export function MenuPage() {
  const { data, error, loading, reload } = useLoad(() => api<Menu>('/admin/menu'));
  const [cat, setCat] = useState<number | 'all' | 'removed'>('all');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saveReason, setSaveReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null);
  const reason = useReason();

  const catName = useMemo(() => new Map((data?.categories ?? []).map((c) => [c.id, c.name])), [data]);
  const items = (data?.items ?? []).filter((i) => (cat === 'removed' ? !i.is_active : i.is_active && (cat === 'all' || i.category_id === cat)));
  const changed = Object.keys(drafts).length;

  const draftOf = (i: MenuItem) => ({ ...i, ...drafts[i.id] });
  function setDraft(i: MenuItem, patch: Draft) {
    setDrafts((d) => {
      const next = { ...d[i.id], ...patch };
      // Drop fields that are back to their saved value.
      for (const k of Object.keys(next) as (keyof Draft)[]) {
        const same = k === 'price' ? next.price !== '' && Number(next.price) === Number(i.price) : next[k] === i[k];
        if (same) delete next[k];
      }
      const out = { ...d };
      if (Object.keys(next).length) out[i.id] = next; else delete out[i.id];
      return out;
    });
  }

  async function saveAll() {
    const r = saveReason.trim();
    if (r.length < 10) { setSaveError('Give a reason of at least 10 characters.'); return; }
    for (const [id, d] of Object.entries(drafts)) {
      if (d.price !== undefined && !/^\d{1,6}(\.\d{1,2})?$/.test(String(d.price))) { setSaveError(`Check the price of ${data?.items.find((i) => i.id === id)?.name}.`); return; }
    }
    setSaving(true); setSaveError(null);
    try {
      for (const [id, d] of Object.entries(drafts)) {
        await api(`/admin/menu-items/${id}`, { method: 'PATCH', body: { ...d, reason: r } });
        setDrafts((x) => { const y = { ...x }; delete y[id]; return y; });
      }
      setSaveReason('');
      await reload();
    } catch (e) { setSaveError(errorText(e)); }
    finally { setSaving(false); }
  }

  function removeOrRestore(i: MenuItem) {
    reason.ask(i.is_active
      ? { title: `Remove “${i.name}” from the menu?`, body: 'Customers stop seeing it. Past orders keep it. You can restore it later under “Removed”.', confirm: 'Remove item', danger: true,
          run: (r) => api(`/admin/menu-items/${i.id}`, { method: 'DELETE', body: { reason: r } }), onDone: () => void reload() }
      : { title: `Restore “${i.name}”?`, confirm: 'Restore item',
          run: (r) => api(`/admin/menu-items/${i.id}`, { method: 'PATCH', body: { is_active: true, reason: r } }), onDone: () => void reload() });
  }

  function addCategory() {
    let name = '';
    reason.ask({
      title: 'Add a category',
      extra: <label className="field"><span>Name</span><input className="input" maxLength={40} onChange={(e) => { name = e.target.value; }} placeholder="e.g. Sides" /></label>,
      confirm: 'Add category',
      run: async (r) => {
        if (name.trim().length < 2) throw new Error('Give the category a name.');
        await api('/admin/menu-categories', { body: { name: name.trim(), sort: (data?.categories.length ?? 0) + 1, reason: r } });
      },
      onDone: () => void reload(),
    });
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Menu &amp; prices</h1><p className="sub">Only admins change prices. The kitchen can also mark items sold out in the app. Orders already placed keep the price they were charged.</p></div>
        <div className="inline">
          <button className="btn plain" onClick={addCategory}>Add category</button>
          <button className="btn" onClick={() => setEditing('new')}>Add item</button>
        </div>
      </div>
      {error && <Notice>{error}</Notice>}

      <section className="card">
        <div className="chips" role="group" aria-label="Category">
          <button className="chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>All</button>
          {(data?.categories ?? []).map((c) => <button key={c.id} className="chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</button>)}
          <button className="chip" aria-pressed={cat === 'removed'} onClick={() => setCat('removed')}>Removed</button>
        </div>
        {items.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Item</th><th>Category</th><th>Price (GH₵)</th><th>Available</th><th>Bestseller</th><th /></tr></thead>
              <tbody>
                {items.map((i) => {
                  const d = draftOf(i);
                  const dirty = Boolean(drafts[i.id]);
                  return (
                    <tr key={i.id} style={dirty ? { background: '#FFFBEF' } : undefined}>
                      <td>
                        <div className="inline" style={{ flexWrap: 'nowrap' }}>
                          <span className="thumb" style={{ background: i.tint }}>{i.image_url ? <img src={i.image_url} alt="" /> : 'App photo'}</span>
                          <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                            <span className="strong">{i.name}</span>
                            <span className="small muted" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.description || '—'}</span>
                          </span>
                        </div>
                      </td>
                      <td className="muted">{catName.get(i.category_id) ?? '—'}</td>
                      <td>
                        <input className="input sm mono" style={{ width: 96 }} inputMode="decimal" aria-label={`Price of ${i.name}`} disabled={!i.is_active}
                          value={String(d.price)} onChange={(e) => setDraft(i, { price: e.target.value.replace(/[^\d.]/g, '') })} />
                      </td>
                      <td><Switch checked={d.is_available} label={`${i.name} available`} disabled={!i.is_active} onChange={(v) => setDraft(i, { is_available: v })} /></td>
                      <td><Switch checked={d.is_popular} label={`${i.name} bestseller`} disabled={!i.is_active} onChange={(v) => setDraft(i, { is_popular: v })} /></td>
                      <td className="right">
                        <div className="inline" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          {i.is_active && <button className="btn plain sm" onClick={() => setEditing(i)}>Edit</button>}
                          <button className="link-btn small" onClick={() => removeOrRestore(i)}>{i.is_active ? 'Remove' : 'Restore'}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">{loading ? 'Loading…' : 'Nothing here.'}</div>}
      </section>

      {changed > 0 && (
        <div className="save-bar" role="region" aria-label="Unsaved changes">
          <b>{changed} item{changed > 1 ? 's' : ''} changed</b>
          <input className="input" placeholder="Reason (10+ characters), e.g. New prices from 1 December" value={saveReason} onChange={(e) => setSaveReason(e.target.value)} />
          <button className="btn plain sm" onClick={() => { setDrafts({}); setSaveError(null); }} disabled={saving}>Discard</button>
          <button className="btn green" onClick={() => void saveAll()} disabled={saving}>{saving ? 'Saving…' : 'Publish changes'}</button>
          {saveError && <span style={{ flexBasis: '100%', color: '#FFB4B4', fontWeight: 600 }}>{saveError}</span>}
        </div>
      )}

      {data && <FeeBands key={JSON.stringify(data.bands)} bands={data.bands} onSaved={() => void reload()} />}
      {editing && data && <ItemDialog item={editing === 'new' ? null : editing} menu={data} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
      {reason.node}
    </>
  );
}

// ---------------------------------------------------------------- photo upload

async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that image'))), 'image/jpeg', 0.82));
}

async function uploadPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Use a JPG, PNG or WebP photo.');
  const blob = await shrink(file);
  const path = `items/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(`Photo upload failed: ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// ---------------------------------------------------------------- add / edit

function ItemDialog({ item, menu, onClose, onSaved }: { item: MenuItem | null; menu: Menu; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    category_id: item?.category_id ?? menu.categories[0]?.id ?? 1,
    name: item?.name ?? '',
    description: item?.description ?? '',
    price: item?.price ?? '',
    is_popular: item?.is_popular ?? false,
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(item?.image_url ?? null);
  const [clearPhoto, setClearPhoto] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (f.name.trim().length < 2) { setError('Give the item a name.'); return; }
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(String(f.price)) || Number(f.price) <= 0) { setError('Enter a price like 45 or 45.50.'); return; }
    if (reason.trim().length < 10) { setError('Give a reason of at least 10 characters.'); return; }
    setBusy(true); setError(null);
    try {
      const image_url = photo ? await uploadPhoto(photo) : clearPhoto ? null : undefined;
      const body = { ...f, name: f.name.trim(), description: f.description.trim(), price: String(f.price), ...(image_url !== undefined ? { image_url } : {}), reason: reason.trim() };
      if (item) await api(`/admin/menu-items/${item.id}`, { method: 'PATCH', body });
      else await api('/admin/menu-items', { body: { ...body, sort: menu.items.filter((i) => i.category_id === f.category_id).length + 1 } });
      onSaved();
    } catch (e) { setError(errorText(e)); setBusy(false); }
  }

  return (
    <Dialog title={item ? `Edit ${item.name}` : 'Add a menu item'} onClose={busy ? () => undefined : onClose}>
      <div className="inline" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
        <span className="thumb" style={{ width: 88, height: 88, borderRadius: 16, background: item?.tint ?? '#F9DCCB' }}>{preview ? <img src={preview} alt="" /> : 'App photo'}</span>
        <div className="stack" style={{ gap: 6 }}>
          <label className="btn plain sm" style={{ alignSelf: 'flex-start' }}>
            {preview ? 'Change photo' : 'Upload photo'}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => {
              const file = e.target.files?.[0]; if (!file) return;
              setPhoto(file); setClearPhoto(false); setPreview(URL.createObjectURL(file));
            }} />
          </label>
          {preview && <button type="button" className="link-btn small" style={{ alignSelf: 'flex-start' }} onClick={() => { setPhoto(null); setPreview(null); setClearPhoto(true); }}>Use the app’s built-in photo</button>}
          <span className="small muted">Square photos look best. Shown in the app straight away, no update needed.</span>
        </div>
      </div>
      <div className="form-grid">
        <label className="field"><span>Name</span><input className="input" maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="field"><span>Price (GH₵)</span><input className="input mono" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d.]/g, '') })} /></label>
        <label className="field"><span>Category</span>
          <select className="select" value={f.category_id} onChange={(e) => setF({ ...f, category_id: Number(e.target.value) })}>
            {menu.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field" style={{ justifyContent: 'flex-end' }}>
          <span className="inline"><Switch checked={f.is_popular} label="Bestseller" onChange={(v) => setF({ ...f, is_popular: v })} /> Bestseller</span>
        </label>
      </div>
      <label className="field"><span>Description <span className="hint">· shown under the name</span></span>
        <textarea className="textarea" maxLength={200} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </label>
      <label className="field"><span>Reason <span className="hint">· at least 10 characters, saved to the audit log</span></span>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={item ? 'e.g. Real photo from the kitchen' : 'e.g. New item on the menu'} />
      </label>
      {error && <Notice>{error}</Notice>}
      <div className="actions">
        <button className="btn plain" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn green" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : item ? 'Save item' : 'Add item'}</button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- delivery fees

function FeeBands({ bands: saved, onSaved }: { bands: Menu['bands']; onSaved: () => void }) {
  const initial = saved.map((b) => ({ min_km: String(Number(b.min_km)), max_km: String(Number(b.max_km)), fee: String(Number(b.fee)) }));
  const [rows, setRows] = useState(initial);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  function set(i: number, k: 'max_km' | 'fee', v: string) {
    setRows((r) => r.map((row, j) => {
      if (j === i) return { ...row, [k]: v.replace(/[^\d.]/g, '') };
      if (k === 'max_km' && j === i + 1) return { ...row, min_km: v.replace(/[^\d.]/g, '') }; // keep bands touching
      return row;
    }));
  }

  async function save() {
    if (reason.trim().length < 10) { setMsg({ ok: false, text: 'Give a reason of at least 10 characters.' }); return; }
    setBusy(true); setMsg(null);
    try {
      await api('/admin/delivery-fee-bands', { method: 'PUT', body: { bands: rows.map((r) => ({ min_km: Number(r.min_km), max_km: Number(r.max_km), fee: Number(r.fee) })), reason: reason.trim() } });
      setReason(''); setMsg({ ok: true, text: 'Delivery fees saved.' }); onSaved();
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); }
    finally { setBusy(false); }
  }

  const last = rows[rows.length - 1];
  return (
    <section className="card">
      <div className="card-head"><h2>Delivery fees</h2><span className="meta">Charged by distance from the kitchen. Addresses beyond the last band can’t order.</span></div>
      <div className="table-wrap">
        <table style={{ maxWidth: 560 }}>
          <thead><tr><th>From (km)</th><th>To (km)</th><th>Fee (GH₵)</th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="mono muted">{r.min_km}</td>
                <td><input className="input sm mono" style={{ width: 90 }} inputMode="decimal" value={r.max_km} onChange={(e) => set(i, 'max_km', e.target.value)} aria-label={`Band ${i + 1} up to km`} /></td>
                <td><input className="input sm mono" style={{ width: 90 }} inputMode="decimal" value={r.fee} onChange={(e) => set(i, 'fee', e.target.value)} aria-label={`Band ${i + 1} fee`} /></td>
                <td>{rows.length > 1 && i === rows.length - 1 && <button className="link-btn small" onClick={() => setRows(rows.slice(0, -1))}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="inline">
        <button className="btn plain sm" onClick={() => setRows([...rows, { min_km: last?.max_km ?? '0', max_km: String(Number(last?.max_km ?? 0) + 2), fee: last?.fee ?? '5' }])}>Add a band</button>
        <span className="muted small">Furthest delivery: {last ? `${last.max_km} km` : '—'} · {rows.map((r) => `${r.min_km}–${r.max_km} km ${ghs(r.fee)}`).join(' · ')}</span>
      </div>
      {dirty && (
        <div className="inline">
          <input className="input" style={{ flex: '1 1 260px' }} placeholder="Reason (10+ characters)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn plain" onClick={() => { setRows(initial); setMsg(null); }} disabled={busy}>Discard</button>
          <button className="btn green" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save delivery fees'}</button>
        </div>
      )}
      {msg && <Notice tone={msg.ok ? 'ok' : undefined}>{msg.text}</Notice>}
      <p className="small muted">The kitchen’s delivery limit is set under Team &amp; controls. <Badge>Max distance applies too</Badge></p>
    </section>
  );
}
