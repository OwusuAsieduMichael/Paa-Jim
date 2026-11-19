const TZ = 'Africa/Accra';

export function ghs(v: string | number | null | undefined): string {
  const n = Number(v ?? 0);
  return `GH₵ ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function time(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toLocaleDateString('en-GB', { timeZone: TZ }) === today.toLocaleDateString('en-GB', { timeZone: TZ });
  const t = d.toLocaleTimeString('en-GB', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
  return sameDay ? t : `${d.toLocaleDateString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' })}, ${t}`;
}

export function dateLong(d = new Date()): string {
  return d.toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
}

export function todayKey(): string {
  // YYYY-MM-DD in Accra (UTC+0 all year)
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

/** 233559776547 → 055 977 6547 */
export function phone(p?: string | null): string {
  if (!p) return '—';
  const d = p.replace(/\D/g, '');
  const local = d.startsWith('233') && d.length === 12 ? '0' + d.slice(3) : d;
  return /^0\d{9}$/.test(local) ? local.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1 $2 $3') : p;
}

/** Accepts 055…, 55…, 233…, +233… and returns 233XXXXXXXXX, or null. */
export function toE164(input: string): string | null {
  const d = input.replace(/\D/g, '');
  if (d.startsWith('233') && d.length === 12) return d;
  if (d.startsWith('0') && d.length === 10) return '233' + d.slice(1);
  if (d.length === 9) return '233' + d;
  return null;
}

export function initials(name?: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export const NETWORK: Record<string, string> = { mtn: 'MTN', vod: 'Telecel', atl: 'AirtelTigo' };

type Tone = 'green' | 'red' | 'amber' | 'blue' | 'grey' | 'solid-red';
export const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending_payment: { label: 'Payment pending', tone: 'grey' },
  payment_failed: { label: 'Payment failed', tone: 'grey' },
  paid: { label: 'Waiting for kitchen', tone: 'amber' },
  accepted: { label: 'Cooking', tone: 'amber' },
  rejected: { label: 'Rejected', tone: 'red' },
  ready_for_pickup: { label: 'Ready for pickup', tone: 'blue' },
  en_route: { label: 'On the way', tone: 'red' },
  arrived: { label: 'Rider arrived', tone: 'red' },
  delivered: { label: 'Delivered', tone: 'green' },
  delivery_failed: { label: 'Delivery failed', tone: 'solid-red' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};
export const LIVE_STATUSES = ['paid', 'accepted', 'ready_for_pickup', 'en_route', 'arrived', 'delivery_failed'];

export const REFUND_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Refund queued', tone: 'amber' },
  processing: { label: 'Refund processing', tone: 'blue' },
  success: { label: 'Refunded', tone: 'green' },
  failed: { label: 'Refund failed', tone: 'solid-red' },
};

export const ROLE: Record<string, string> = { admin: 'Admin', rider: 'Rider', vendor_staff: 'Kitchen staff', customer: 'Customer' };
