// Money arrives from Postgres numeric(10,2) as a string. Parse it into integer
// pesewas and never let it become a float you then round. (Handbook §5.3)

export type Pesewas = number & { readonly __brand: 'pesewas' };

export function toPesewas(v: string | number): Pesewas {
  const s = typeof v === 'number' ? v.toFixed(2) : v.trim();
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new Error(`Bad money value: ${v}`);
  const n = Number(m[2]) * 100 + Number((m[3] ?? '0').padEnd(2, '0'));
  return (m[1] ? -n : n) as Pesewas;
}

export const p = (n: number) => n as Pesewas;
export const add = (...xs: Pesewas[]) => xs.reduce((a, b) => a + b, 0) as Pesewas;
export const times = (x: Pesewas, q: number) => (x * q) as Pesewas;

/** 13500 → "GH₵ 135.00"; with short: 5500 → "GH₵ 55" */
export function ghs(x: Pesewas | string, opts: { short?: boolean; bare?: boolean } = {}): string {
  const n = typeof x === 'string' ? toPesewas(x) : x;
  const whole = Math.trunc(Math.abs(n) / 100);
  const frac = Math.abs(n) % 100;
  const body = opts.short && frac === 0
    ? group(whole)
    : `${group(whole)}.${String(frac).padStart(2, '0')}`;
  const sign = n < 0 ? '-' : '';
  return opts.bare ? `${sign}${body}` : `${sign}GH₵ ${body}`;
}

/** 13500 → "135.00" (no grouping, no symbol) — the wire format numeric(10,2) uses. */
export function dec(x: Pesewas): string {
  const sign = x < 0 ? '-' : '';
  const a = Math.abs(x);
  return `${sign}${Math.trunc(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
