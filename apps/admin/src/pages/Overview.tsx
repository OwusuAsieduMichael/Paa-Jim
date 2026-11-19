import { api } from '../lib/api';
import { dateLong, ghs, REFUND_STATUS, STATUS, time, todayKey } from '../lib/format';
import { go } from '../lib/router';
import type { Overview as Data } from '../lib/types';
import { Badge, Notice, useLoad, useReason } from '../components/ui';

export function Overview() {
  const { data, error, loading, reload } = useLoad(() => api<Data>('/admin/overview'), [], 30_000);
  const reason = useReason();

  const today = data?.metrics?.find((m) => m.day === todayKey());
  const days = [...(data?.metrics ?? [])].slice(0, 14).reverse();
  const maxDay = Math.max(1, ...days.map((d) => d.orders_paid));
  const v = data?.vendor;
  const live = data?.live ?? [];
  const refunds = data?.refunds ?? [];

  const taking = v ? v.ordering_enabled && !v.is_suspended : false;
  const kitchenText = !v ? '…' : v.is_suspended ? 'Kitchen suspended' : !v.ordering_enabled ? 'Orders paused by admin' : v.is_open ? 'Kitchen open' : 'Kitchen closed by staff';

  function toggleOrders() {
    if (!v) return;
    const pause = v.ordering_enabled;
    reason.ask({
      title: pause ? 'Pause all orders?' : 'Resume orders?',
      body: pause ? 'Customers will see “Kitchen closed” and can’t place new orders. Orders already in progress carry on.' : 'Customers can order again while the kitchen is open.',
      confirm: pause ? 'Pause orders' : 'Resume orders',
      danger: pause,
      run: (r) => api('/admin/vendor/capacity', { method: 'PATCH', body: { ordering_enabled: !pause, reason: r } }),
      onDone: () => void reload(),
    });
  }

  function retry(id: string) {
    reason.ask({
      title: 'Retry this refund?',
      body: 'Paystack will be asked to send the money back to the customer’s MoMo again.',
      confirm: 'Retry refund',
      run: (r) => api(`/admin/refunds/${id}/retry`, { body: { reason: r } }),
      onDone: () => void reload(),
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="sub">{dateLong()}{loading && data ? ' · refreshing…' : ''}</p>
        </div>
        <div className="inline">
          <Badge tone={taking && v?.is_open ? 'green' : 'red'} dot>{kitchenText}{v && taking ? ` · up to ${v.max_concurrent_orders} at once` : ''}</Badge>
          {v && <button className={`btn ${v.ordering_enabled ? 'ghost' : 'green'}`} onClick={toggleOrders}>{v.ordering_enabled ? 'Pause all orders' : 'Resume orders'}</button>}
        </div>
      </div>

      {error && <Notice>{error}</Notice>}

      <div className="grid kpis">
        <Kpi label="Orders paid today" value={today?.orders_paid ?? 0} />
        <Kpi label="Delivered today" value={today?.delivered ?? 0} />
        <Kpi label="Revenue today" value={ghs(today?.revenue ?? 0)} note="Delivered orders only" />
        <Kpi label="Rejected by kitchen" value={`${today?.rejection_rate_pct ?? 0}%`} note={`${today?.rejected ?? 0} orders`} />
        <Kpi label="Paid → delivered" value={today?.paid_to_delivered_p50_min != null ? `${Math.round(today.paid_to_delivered_p50_min)} min` : '—'} note="Typical (median)" />
      </div>

      <div className="row">
        <section className="card wide">
          <div className="card-head"><h2>Orders, last 14 days</h2><span className="meta">Paid orders per day</span></div>
          {days.length ? (
            <>
              <div className="bars" role="img" aria-label={`Paid orders per day: ${days.map((d) => `${d.day} ${d.orders_paid}`).join(', ')}`}>
                {days.map((d) => (
                  <div className="bar" key={d.day}>
                    <b>{d.orders_paid || ''}</b>
                    <i className={d.day === todayKey() ? 'today' : ''} style={{ height: `${(d.orders_paid / maxDay) * 100}%` }} />
                  </div>
                ))}
              </div>
              <div className="bar-labels">{days.map((d) => <span key={d.day}>{d.day.slice(8)}</span>)}</div>
            </>
          ) : <div className="empty">{loading ? 'Loading…' : 'No orders yet.'}</div>}
        </section>

        <section className="card">
          <div className="card-head"><h2>Refunds needing attention</h2><span className="meta">{refunds.length}</span></div>
          {refunds.length ? (
            <div className="stack">
              {refunds.map((r) => (
                <div key={r.id} className="inline" style={{ justifyContent: 'space-between' }}>
                  <div className="stack" style={{ gap: 2 }}>
                    <span className="strong">{ghs(r.amount)} <Badge tone={REFUND_STATUS[r.status]?.tone}>{REFUND_STATUS[r.status]?.label ?? r.status}</Badge></span>
                    <span className="small muted">{time(r.created_at)} · {r.last_error ? r.last_error.slice(0, 80) : r.reason.slice(0, 80)}</span>
                  </div>
                  <div className="inline">
                    {r.order_id && <button className="btn plain sm" onClick={() => go('orders', r.order_id)}>Open order</button>}
                    {r.status === 'failed' && <button className="btn sm" onClick={() => retry(r.id)}>Retry</button>}
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="empty">{loading && !data ? 'Loading…' : 'All refunds are settled.'}</div>}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Live orders</h2>
          <button className="link-btn" onClick={() => go('orders')}>All orders</button>
        </div>
        {live.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Order</th><th>Placed</th><th>Customer</th><th>Status</th><th>Rider</th><th className="right">Total</th></tr></thead>
              <tbody>
                {live.map((o) => (
                  <tr key={o.id} className="clickable" onClick={() => go('orders', o.id)}>
                    <td className="strong">{o.order_no}</td>
                    <td className="muted">{time(o.paid_at ?? o.created_at)}</td>
                    <td>{o.customer_name ?? '—'}</td>
                    <td><Badge tone={STATUS[o.status]?.tone}>{STATUS[o.status]?.label ?? o.status}</Badge></td>
                    <td className="muted">{o.rider_name ?? '—'}</td>
                    <td className="right strong mono">{ghs(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">{loading && !data ? 'Loading…' : 'No orders in progress right now.'}</div>}
      </section>
      {reason.node}
    </>
  );
}

function Kpi({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="kpi">
      <span className="label">{label}</span>
      <span className="value mono">{value}</span>
      {note && <span className="note">{note}</span>}
    </div>
  );
}
