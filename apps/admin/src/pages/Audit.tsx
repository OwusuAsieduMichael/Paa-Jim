import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { time } from '../lib/format';
import { go } from '../lib/router';
import type { AuditRow, Person } from '../lib/types';
import { Notice, useLoad } from '../components/ui';

const ACTION: Record<string, string> = {
  'admin.create': 'Added an admin', 'admin.revoke': 'Removed an admin', 'admin.update': 'Paused/resumed an admin',
  'rider.create': 'Added a rider', 'rider.update': 'Changed a rider', 'rider.remove_role': 'Removed a rider',
  'vendor_staff.create': 'Added kitchen staff', 'vendor_staff.update': 'Changed kitchen staff', 'vendor_staff.remove_role': 'Removed kitchen staff',
  'refund.create': 'Issued a refund', 'refund.retry': 'Retried a refund', 'payment.reverify': 'Re-checked a payment',
  'order.force_cancel': 'Cancelled an order', 'order.force_complete': 'Marked an order delivered',
  'vendor.suspend': 'Suspended the kitchen', 'vendor.unsuspend': 'Lifted the kitchen suspension', 'vendor.capacity': 'Changed kitchen controls',
  'menu_item.create': 'Added a menu item', 'menu_item.update': 'Changed a menu item', 'menu_item.delete': 'Removed a menu item',
  'menu_category.create': 'Added a category', 'delivery_fee_bands.replace': 'Changed delivery fees',
};

export function Audit() {
  const log = useLoad(() => api<AuditRow[]>('/admin/actions'));
  const team = useLoad(() => api<Person[]>('/admin/team'));
  const [q, setQ] = useState('');
  const names = useMemo(() => new Map((team.data ?? []).map((p) => [p.id, p.full_name ?? 'Admin'])), [team.data]);
  const rows = (log.data ?? []).filter((r) => {
    if (!q) return true;
    const hay = `${ACTION[r.action] ?? r.action} ${r.reason} ${names.get(r.admin_id) ?? ''} ${JSON.stringify(r.payload)}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <>
      <div className="page-head">
        <div><h1>Audit log</h1><p className="sub">The last 200 admin actions, newest first. Entries can’t be edited or deleted.</p></div>
        <input className="input" style={{ width: 240 }} placeholder="Search actions and reasons" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the audit log" />
      </div>
      {log.error && <Notice>{log.error}</Notice>}
      <section className="card">
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Reason</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{time(r.created_at)}</td>
                    <td className="strong">{names.get(r.admin_id) ?? 'Former admin'}</td>
                    <td>{ACTION[r.action] ?? r.action}</td>
                    <td>“{r.reason}”</td>
                    <td className="right">{r.target_type === 'order' && r.target_id && <button className="link-btn small" onClick={() => go('orders', r.target_id)}>Open order</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty">{log.loading ? 'Loading…' : q ? 'Nothing matches.' : 'No admin actions yet.'}</div>}
      </section>
    </>
  );
}
