// A tiny in-memory stand-in for the supabase-js query builder: just enough of
// the chain (select/insert/update/eq/in/lt/gt/order/limit/single/maybeSingle)
// for route tests. Not a database — RLS and triggers are tested in supabase/tests.
type Row = Record<string, unknown>;

export function fakeDb(seed: Record<string, Row[]>, users: Record<string, string> = {}) {
  const tables: Record<string, Row[]> = structuredClone(seed);
  const uniques: Record<string, string[]> = { webhook_events: ['id'], payments: ['reference'] };

  function builder(table: string) {
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row | Row[] | null = null;
    let returning = false;
    let head = false;
    const filters: Array<(r: Row) => boolean> = [];
    let limitN: number | null = null;

    const rows = () => (tables[table] ??= []);
    const exec = () => {
      if (op === 'insert') {
        const list = Array.isArray(payload) ? payload : [payload!];
        for (const r of list) {
          for (const col of uniques[table] ?? []) {
            if (rows().some((x) => x[col] === r[col])) return { data: null, error: { code: '23505', message: 'duplicate key' } };
          }
          rows().push({ created_at: new Date().toISOString(), ...r });
        }
        return { data: returning ? list : null, error: null };
      }
      let matched = rows().filter((r) => filters.every((f) => f(r)));
      if (op === 'update') { matched.forEach((r) => Object.assign(r, payload)); }
      if (op === 'delete') { tables[table] = rows().filter((r) => !matched.includes(r)); }
      if (limitN != null) matched = matched.slice(0, limitN);
      if (head) return { data: null, error: null, count: matched.length };
      return { data: op === 'select' || returning ? matched : null, error: null, count: matched.length };
    };

    const b: Record<string, unknown> = {
      select(_cols?: string, o?: { head?: boolean }) { if (op !== 'select') returning = true; head = Boolean(o?.head); return b; },
      insert(p: Row | Row[]) { op = 'insert'; payload = p; return b; },
      update(p: Row) { op = 'update'; payload = p; return b; },
      delete() { op = 'delete'; return b; },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return b; },
      neq(c: string, v: unknown) { filters.push((r) => r[c] !== v); return b; },
      in(c: string, v: unknown[]) { filters.push((r) => v.includes(r[c])); return b; },
      lt(c: string, v: string) { filters.push((r) => String(r[c]) < v); return b; },
      gt(c: string, v: string) { filters.push((r) => String(r[c]) > v); return b; },
      order() { return b; },
      limit(n: number) { limitN = n; return b; },
      single() { const r = exec(); const d = r.data as Row[] | null; return Promise.resolve({ ...r, data: d?.[0] ?? null, error: r.error ?? (d?.length ? null : { message: 'no rows' }) }); },
      maybeSingle() { const r = exec(); const d = r.data as Row[] | null; return Promise.resolve({ ...r, data: d?.[0] ?? null }); },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(exec()).then(res, rej); },
    };
    return b;
  }

  return {
    tables,
    from: (t: string) => builder(t),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    auth: {
      getUser: async (token: string) => users[token]
        ? { data: { user: { id: users[token] } }, error: null }
        : { data: { user: null }, error: { message: 'invalid' } },
    },
  };
}
