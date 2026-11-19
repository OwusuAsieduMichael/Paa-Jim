import { useEffect, useState, type ReactNode } from 'react';
import type { Me } from '../lib/types';
import { go, useRoute, type Page } from '../lib/router';
import { Avatar } from './ui';
import { Overview } from '../pages/Overview';
import { Orders } from '../pages/Orders';
import { MenuPage } from '../pages/Menu';
import { Team } from '../pages/Team';
import { Audit } from '../pages/Audit';

const Icon = {
  overview: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></svg>,
  orders: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M5 8h14l-1 12H6z" /><path d="M9 8a3 3 0 0 1 6 0" /></svg>,
  menu: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>,
  team: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></svg>,
  audit: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 3h8l4 4v14H7z" /><path d="M10 11h6M10 15h6" /></svg>,
};

const NAV: { page: Page; label: string }[] = [
  { page: 'overview', label: 'Overview' },
  { page: 'orders', label: 'Orders & refunds' },
  { page: 'menu', label: 'Menu & prices' },
  { page: 'team', label: 'Team & controls' },
  { page: 'audit', label: 'Audit log' },
];

export function Shell({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const { page, param } = useRoute();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [page, param]);
  useEffect(() => { document.title = `${NAV.find((n) => n.page === page)?.label ?? 'Overview'} · Paa Jim Admin`; }, [page]);

  let body: ReactNode;
  switch (page) {
    case 'orders': body = <Orders selected={param} />; break;
    case 'menu': body = <MenuPage />; break;
    case 'team': body = <Team me={me} tab={param} />; break;
    case 'audit': body = <Audit />; break;
    default: body = <Overview />;
  }

  return (
    <div className="shell">
      <div className="topbar">
        <button aria-label="Open menu" onClick={() => setOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <b>Paa Jim Admin</b>
      </div>
      <nav className={`side ${open ? 'open' : ''}`} aria-label="Admin">
        <div className="brand"><img src="/icon-192.png" alt="" /> Paa Jim <span>Admin</span></div>
        {NAV.map((n) => (
          <a key={n.page} className="nav-link" href={n.page === 'overview' ? '/' : `/${n.page}`} aria-current={page === n.page ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); go(n.page); }}>
            {Icon[n.page]}{n.label}
          </a>
        ))}
        <div className="me">
          <Avatar url={me.avatar_url} name={me.full_name} />
          <span className="who"><b>{me.full_name || 'Admin'}</b><span>Admin · 2-step on</span></span>
          <button onClick={onSignOut} title="Sign out">Sign out</button>
        </div>
      </nav>
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 35 }} onClick={() => setOpen(false)} aria-hidden="true" />}
      <main className="main">{body}</main>
    </div>
  );
}
