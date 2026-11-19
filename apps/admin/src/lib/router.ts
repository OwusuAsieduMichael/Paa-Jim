import { useEffect, useState } from 'react';

export type Page = 'overview' | 'orders' | 'menu' | 'team' | 'audit';
const PAGES: Page[] = ['overview', 'orders', 'menu', 'team', 'audit'];

function read(): { page: Page; param: string | null } {
  const [, first, second] = location.pathname.split('/');
  const page = (PAGES as string[]).includes(first ?? '') ? (first as Page) : 'overview';
  return { page, param: second ? decodeURIComponent(second) : null };
}

/** Tiny path router: /orders, /orders/<id>, /menu, /team, /audit. */
export function useRoute() {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return route;
}

export function go(page: Page, param?: string | null) {
  const path = page === 'overview' && !param ? '/' : `/${page}${param ? `/${encodeURIComponent(param)}` : ''}`;
  if (path !== location.pathname) history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
