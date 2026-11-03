import type { Order, OrderStatus } from '@/backend';
import { color } from '@/theme';

export const NETWORK_LABEL = { mtn: 'MTN MoMo', vod: 'Telecel Cash', atl: 'AirtelTigo Money' } as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** 20:45 → "8:45 PM" (Accra is UTC+0, no DST) */
export function clock(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const h = d.getHours();
  return `${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Sat, 31 Oct · 1:20 PM" */
export function dayStamp(iso: string): string {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} · ${clock(d)}`;
}

export const minutesSince = (iso: string | null | undefined, now = Date.now()) => (iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000)) : 0);

export function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** "284615" → "284 615" */
export const spaced6 = (s: string) => `${s.slice(0, 3)} ${s.slice(3)}`;

export function itemsSummary(o: Pick<Order, 'items'>): string {
  const first = o.items[0];
  if (!first) return '';
  const more = o.items.length - 1;
  return more > 0 ? `${first.name} + ${more} more` : first.qty > 1 ? `${first.name} ×${first.qty}` : first.name;
}

export const itemsShort = (o: Pick<Order, 'items'>) =>
  o.items.map((i) => `${i.name.replace(' & ', ' & ')}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ');

export const itemCount = (o: Pick<Order, 'items'>) => o.items.reduce((s, i) => s + i.qty, 0);

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  payment_failed: 'Payment failed',
  paid: 'Waiting for kitchen',
  accepted: 'Cooking',
  rejected: 'Refunded',
  ready_for_pickup: 'Ready for pickup',
  en_route: 'On the way',
  arrived: 'Rider has arrived',
  delivered: 'Delivered',
  delivery_failed: 'Delivery problem',
  cancelled: 'Cancelled',
};

export function statusTone(s: OrderStatus): { fg: string; bg: string; dot: string } {
  if (s === 'delivered') return { fg: color.successText, bg: color.successTint, dot: color.success };
  if (s === 'rejected' || s === 'cancelled' || s === 'payment_failed' || s === 'delivery_failed') return { fg: color.primaryText, bg: color.primaryTint, dot: color.primary };
  if (s === 'accepted' || s === 'paid') return { fg: color.warningInk, bg: color.warningTint, dot: color.warning };
  return { fg: color.primaryText, bg: color.primaryTint, dot: color.primary };
}
