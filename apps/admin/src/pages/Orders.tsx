import { useMemo, useRef, useState, type MutableRefObject } from 'react';
import { api } from '../lib/api';
import { ghs, LIVE_STATUSES, NETWORK, phone, REFUND_STATUS, STATUS, time } from '../lib/format';
import { go } from '../lib/router';
import type { OrderDetail, OrderRow } from '../lib/types';
import { Badge, Notice, useLoad, useReason } from '../components/ui';

const FILTERS: { key: string; label: string; match: (s: string) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'live', label: 'In progress', match: (s) => LIVE_STATUSES.includes(s) },
  { key: 'delivered', label: 'Delivered', match: (s) => s === 'delivered' },
  { key: 'problems', label: 'Problems', match: (s) => ['rejected', 'delivery_failed', 'cancelled'].includes(s) },
  { key: 'payment', label: 'Payment pending / failed', match: (s) => s === 'pending_payment' || s === 'payment_failed' },
];

export function Orders({ selected }: { selected: string | null }) {
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const list = useLoad(() => api<OrderRow[]>(`/admin/orders?limit=300${search ? `&q=${encodeURIComponent(search)}` : ''}`), [search], 30_000);
  const f = FILTERS.find((x) => x.key === filter)!;
  const rows = useMemo(() => (list.data ?? []).filter((o) => f.match(o.status)), [list.data, f]);

  return (
    <>
      <div className="page-head">
        <div><h1>Orders &amp; refunds</h1><p className="sub">Click an order to see payment details and act on it.</p></div>
      </div>
      <div className="split">
        <section className="card">
          <div className="inline" style={{ justifyContent: 'space-between' }}>
            <div className="chips" role="group" aria-label="Filter orders">
              {FILTERS.map((x) => <button key={x.key} className="chip" aria-pressed={filter === x.key} onClick={() => setFilter(x.key)}>{x.label}</button>)}
            </div>
            <form className="inline" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim().toUpperCase()); }}>
              <input className="input sm" style={{ width: 170 }} placeholder="Order no. e.g. PJ-1042" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search by order number" />
              <button className="btn plain sm">Search</button>
              {search && <button type="button" className="link-btn small" onClick={() => { setQ(''); setSearch(''); }}>Clear</button>}
            </form>
          </div>
          {list.error && <Notice>{list.error}</Notice>}
          {rows.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Order</th><th>Time</th><th>Customer</th><th>Status</th><th>Payment</th><th className="right">Total</th></tr></thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id} className={`clickable ${selected === o.id ? 'selected' : ''}`} onClick={() => go('orders', o.id)}>
                      <td className="strong">{o.order_no}</td>
                      <td className="muted">{time(o.created_at)}</td>
                      <td>{o.customer_name ?? '—'}</td>
                      <td><Badge tone={STATUS[o.status]?.tone}>{STATUS[o.status]?.label ?? o.status}</Badge></td>
                      <td className="muted">{o.momo_network ? NETWORK[o.momo_network] : '—'}</td>
                      <td className="right strong mono">{ghs(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="empty">{list.loading && !list.data ? 'Loading…' : 'No orders match.'}</div>}
        </section>
        {selected && <OrderPanel id={selected} onChanged={() => void list.reload()} />}
      </div>
    </>
  );
}

function OrderPanel({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { data, error, loading, reload } = useLoad(() => api<OrderDetail>(`/admin/orders/${id}`), [id]);
  const reason = useReason();
  const amountRef = useRef('');

  if (!data) return <section className="card panel">{error ? <Notice>{error}</Notice> : <div className="empty">Loading…</div>}</section>;
  const { order: o, items, payments, refunds, rating } = data;
  const paid = payments.find((p) => p.status === 'success');
  const refund = refunds[0];
  const done = () => { void reload(); onChanged(); };

  const canRefund = Boolean(paid) && !refund;
  const canRecheck = payments.some((p) => p.status === 'pending');
  const canCancel = !['delivered', 'cancelled', 'rejected', 'payment_failed'].includes(o.status);
  const canComplete = ['en_route', 'arrived', 'delivery_failed'].includes(o.status);

  const events: [string, string | null][] = [
    ['Placed', o.created_at], ['Paid', o.paid_at], ['Kitchen accepted', o.accepted_at], ['Ready for pickup', o.ready_at],
    ['Rider picked up', o.claimed_at], ['Rider arrived', o.arrived_at], ['Delivered', o.delivered_at ?? null], ['Closed', o.closed_at],
  ];

  return (
    <section className="card panel" aria-label={`Order ${o.order_no}`}>
      <div className="card-head">
        <h2>{o.order_no}</h2>
        <div className="inline">
          <Badge tone={STATUS[o.status]?.tone}>{STATUS[o.status]?.label ?? o.status}</Badge>
          <button className="link-btn small" onClick={() => go('orders')} aria-label="Close order">Close</button>
        </div>
      </div>
      {error && <Notice>{error}</Notice>}
      {loading && <span className="small muted">Refreshing…</span>}

      <div className="stack" style={{ gap: 6 }}>
        {items.map((it, i) => (
          <div key={i} className="inline" style={{ justifyContent: 'space-between' }}>
            <span>{it.qty} × {it.name}{it.note ? <span className="small muted"> · {it.note}</span> : null}</span>
            <span className="mono">{ghs(it.line_total)}</span>
          </div>
        ))}
        <div className="inline muted small" style={{ justifyContent: 'space-between' }}><span>Delivery ({o.distance_km} km)</span><span className="mono">{ghs(o.delivery_fee)}</span></div>
        <div className="inline strong" style={{ justifyContent: 'space-between' }}><span>Total</span><span className="mono">{ghs(o.total)}</span></div>
      </div>

      <dl className="kv">
        <dt>Customer</dt><dd>{o.customer_name ?? '—'} · {phone(o.customer_phone)}</dd>
        <dt>Deliver to</dt><dd>{o.address_label}{o.gps_code ? ` · ${o.gps_code}` : ''}{o.landmark ? ` · ${o.landmark}` : ''}</dd>
        {o.rider_note && <><dt>Note</dt><dd>{o.rider_note}</dd></>}
        <dt>Rider</dt><dd>{o.rider_name ? `${o.rider_name} · ${phone(o.rider_phone)}` : '—'}</dd>
        {o.reject_reason && <><dt>Rejected</dt><dd>{o.reject_reason}</dd></>}
        {o.failure_reason && <><dt>Failed</dt><dd>{o.failure_reason}</dd></>}
        {o.cancel_reason && <><dt>Cancelled</dt><dd>{o.cancel_reason}</dd></>}
      </dl>

      <h3>Payment</h3>
      {payments.length ? payments.map((p) => (
        <dl className="kv" key={p.id}>
          <dt>Charged</dt><dd>{ghs(p.amount)} · <Badge tone={p.status === 'success' ? 'green' : p.status === 'pending' ? 'amber' : 'grey'}>{p.status}</Badge></dd>
          <dt>Wallet</dt><dd>{NETWORK[p.network] ?? p.network} · {phone(p.phone)}</dd>
          <dt>Paystack ref</dt><dd className="small">{p.reference}</dd>
          {p.gateway_response && <><dt>Gateway</dt><dd className="small">{p.gateway_response}</dd></>}
        </dl>
      )) : <p className="muted">No payment attempt.</p>}

      {refund && (
        <>
          <h3>Refund</h3>
          <dl className="kv">
            <dt>Amount</dt><dd>{ghs(refund.amount)} · <Badge tone={REFUND_STATUS[refund.status]?.tone}>{REFUND_STATUS[refund.status]?.label ?? refund.status}</Badge></dd>
            <dt>Reason</dt><dd>{refund.reason}</dd>
            {refund.last_error && <><dt>Last error</dt><dd className="small">{refund.last_error}</dd></>}
            <dt>Attempts</dt><dd>{refund.attempts}</dd>
          </dl>
        </>
      )}

      {rating && (
        <>
          <h3>Rating</h3>
          <p>{'★'.repeat(rating.food_stars)}{'☆'.repeat(5 - rating.food_stars)} food{rating.rider_thumb != null ? ` · rider ${rating.rider_thumb ? '👍' : '👎'}` : ''}</p>
          {rating.comment && <p className="muted">“{rating.comment}”</p>}
        </>
      )}

      <h3>History</h3>
      <ul className="timeline">
        {events.filter(([, t]) => t).map(([label, t]) => <li key={label}><span className="strong">{label}</span><span className="muted small">{time(t)}</span></li>)}
      </ul>

      <h3>Actions</h3>
      <div className="inline">
        {canRefund && (
          <button className="btn sm" onClick={() => { amountRef.current = ''; reason.ask({
            title: `Refund ${o.order_no}?`,
            body: `Paid ${ghs(paid!.amount)}. Leave the amount empty for a full refund.`,
            extra: <RefundAmount max={paid!.amount} valueRef={amountRef} />,
            confirm: 'Send refund', danger: true,
            run: (r) => api('/admin/refunds', { body: { orderId: o.id, reason: r, ...(amountRef.current ? { amount: amountRef.current } : {}) } }),
            onDone: done,
          }); }}>Refund…</button>
        )}
        {refund?.status === 'failed' && (
          <button className="btn sm" onClick={() => reason.ask({ title: 'Retry this refund?', confirm: 'Retry refund', run: (r) => api(`/admin/refunds/${refund.id}/retry`, { body: { reason: r } }), onDone: done })}>Retry refund</button>
        )}
        {canRecheck && (
          <button className="btn plain sm" onClick={() => reason.ask({ title: 'Re-check payment with Paystack?', body: 'Use this when a customer says they paid but the order is still waiting.', confirm: 'Re-check', run: (r) => api(`/admin/payments/${o.id}/reverify`, { body: { reason: r } }), onDone: done })}>Re-check payment</button>
        )}
        {canComplete && (
          <button className="btn plain sm" onClick={() => reason.ask({ title: 'Mark as delivered?', body: 'Only when you’ve confirmed with the customer that they received the food.', confirm: 'Mark delivered', run: (r) => api(`/admin/orders/${o.id}/force-complete`, { body: { reason: r } }), onDone: done })}>Force complete</button>
        )}
        {canCancel && (
          <button className="btn ghost sm" onClick={() => reason.ask({ title: `Cancel ${o.order_no}?`, body: 'If it was paid, the customer is refunded in full automatically.', confirm: 'Cancel order', danger: true, run: (r) => api(`/admin/orders/${o.id}/force-cancel`, { body: { reason: r } }), onDone: done })}>Force cancel</button>
        )}
        {!canRefund && !canRecheck && !canComplete && !canCancel && refund?.status !== 'failed' && <span className="muted">No actions for this order.</span>}
      </div>
      {reason.node}
    </section>
  );
}

// The dialog's run() is created before typing, so it reads the amount through a ref.
function RefundAmount({ max, valueRef }: { max: string; valueRef: MutableRefObject<string> }) {
  const [v, setV] = useState('');
  return (
    <label className="field">
      <span>Amount (GH₵) <span className="hint">· up to {max}; empty = full refund</span></span>
      <input className="input" inputMode="decimal" placeholder={max} value={v}
        onChange={(e) => { const x = e.target.value.replace(/[^\d.]/g, ''); setV(x); valueRef.current = x; }} />
    </label>
  );
}
