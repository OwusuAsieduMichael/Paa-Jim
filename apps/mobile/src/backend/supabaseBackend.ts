import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { API_URL } from '@/lib/config';
import {
  BackendError, type Address, type Backend, type Order, type OrderStatus, type User, type MenuItem,
  ACTIVE_STATUSES, KITCHEN_STATUSES,
} from './types';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ORDER_COLS = '*, order_items(name, qty, unit_price, line_total, note), ratings(order_id)';

function mapOrder(r: Row): Order {
  return {
    id: r.id, orderNo: r.order_no, status: r.status,
    subtotal: String(r.subtotal), deliveryFee: String(r.delivery_fee), total: String(r.total),
    items: (r.order_items ?? []).map((i: Row) => ({ name: i.name, qty: i.qty, unitPrice: String(i.unit_price), lineTotal: String(i.line_total), note: i.note })),
    addressLabel: r.address_label, gpsCode: r.gps_code, landmark: r.landmark, distanceKm: Number(r.distance_km),
    destLat: r.dest_lat, destLng: r.dest_lng, riderNote: r.rider_note,
    customerId: r.customer_id, customerName: r.customer_name, customerPhone: r.customer_phone,
    riderId: r.rider_id, riderName: r.rider_name, riderPhone: r.rider_phone,
    momoNetwork: r.momo_network, momoLast4: r.momo_last4,
    rejectReason: r.reject_reason, cancelReason: r.cancel_reason, failureReason: r.failure_reason,
    verifyAttempts: r.verify_attempts ?? 0,
    createdAt: r.created_at, paidAt: r.paid_at, acceptedAt: r.accepted_at, readyAt: r.ready_at,
    claimedAt: r.claimed_at, arrivedAt: r.arrived_at, deliveredAt: r.delivered_at,
    rated: Array.isArray(r.ratings) ? r.ratings.length > 0 : Boolean(r.ratings),
  };
}

/** Realtime payloads carry raw columns; map only what's there. */
function mapOrderPatch(r: Row): Partial<Order> & { id: string } {
  const full = mapOrder({ order_items: undefined, ...r });
  const out: Partial<Order> & { id: string } = { id: r.id };
  for (const [k, v] of Object.entries(full)) if (v !== undefined && k !== 'items' && k !== 'rated') (out as Row)[k] = v;
  return out;
}

const mapAddress = (r: Row): Address => ({ id: r.id, label: r.label, gpsCode: r.gps_code, landmark: r.landmark, lat: r.lat, lng: r.lng, isDefault: r.is_default });
const mapItem = (r: Row): MenuItem => ({ id: r.id, categoryId: r.category_id, name: r.name, description: r.description, price: String(r.price), isAvailable: r.is_available, isPopular: r.is_popular, imageUrl: r.image_url, tint: r.tint, sort: r.sort });

function fail(error: { message: string; code?: string } | null): never {
  const msg = error?.message ?? 'Something went wrong';
  const network = /network|fetch|timed? ?out/i.test(msg);
  throw new BackendError(network ? 'No connection — check your data and try again' : msg, error?.code, network);
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) fail(error);
  return data as T;
}

async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new BackendError('Please sign in again');
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new BackendError('No connection — check your data and try again', undefined, true);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new BackendError(json.error ?? `Request failed (${res.status})`, json.code);
  return json as T;
}

async function loadUser(): Promise<User | null> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) return null;
  const { data: p } = await supabase.from('profiles').select('id, role, phone, full_name, is_active').eq('id', uid).maybeSingle();
  if (!p || !p.is_active) return null;
  return { id: p.id, role: p.role, phone: p.phone, fullName: p.full_name };
}

function channel(name: string, setup: (c: RealtimeChannel) => RealtimeChannel) {
  const c = setup(supabase.channel(`${name}:${Math.random().toString(36).slice(2, 8)}`));
  c.subscribe();
  // Unsubscribe on unmount — a leaked channel per navigation drains the battery.
  return () => { supabase.removeChannel(c); };
}

export const supabaseBackend: Backend = {
  demo: false,

  currentUser: loadUser,

  async sendOtp(e164) {
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    if (error) fail(error);
  },

  async verifyOtp(e164, code) {
    const { error } = await supabase.auth.verifyOtp({ phone: e164, token: code, type: 'sms' });
    if (error) throw new BackendError(/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired' : error.message);
    const u = await loadUser();
    if (!u) throw new BackendError('This account is disabled. Contact Paa Jim.');
    return u;
  },

  async signOut() { await supabase.auth.signOut(); },

  async updateName(fullName) {
    const { data } = await supabase.auth.getSession();
    const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', data.session!.user.id);
    if (error) fail(error);
  },

  onAuthChange(cb) {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') cb(null);
      else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') loadUser().then(cb);
    });
    return () => data.subscription.unsubscribe();
  },

  async registerPushToken(token, platform) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await supabase.from('device_tokens').upsert({ token, platform, user_id: data.session.user.id, last_seen: new Date().toISOString() });
  },

  async kitchenStatus() {
    const s = await rpc<Row>('kitchen_status');
    return {
      accepting: s.accepting, reason: s.reason, isOpen: s.is_open, closes: s.closes,
      etaMin: s.eta_min, etaMax: s.eta_max, vendorName: s.vendor_name,
      vendorLat: s.vendor_lat, vendorLng: s.vendor_lng, vendorPhone: s.vendor_phone,
    };
  },

  async menu() {
    const [c, i] = await Promise.all([
      supabase.from('menu_categories').select('*').order('sort'),
      supabase.from('menu_items').select('*').eq('is_active', true).order('sort'),
    ]);
    if (c.error) fail(c.error);
    if (i.error) fail(i.error);
    return { categories: c.data!.map((r) => ({ id: r.id, name: r.name, sort: r.sort })), items: i.data!.map(mapItem) };
  },

  subscribeMenu(cb) {
    return channel('menu', (c) => c.on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, cb));
  },

  async addresses() {
    const { data, error } = await supabase.from('addresses').select('*').order('is_default', { ascending: false }).order('created_at');
    if (error) fail(error);
    return data!.map(mapAddress);
  },

  async saveAddress(a) {
    const { data: s } = await supabase.auth.getSession();
    const row = { user_id: s.session!.user.id, label: a.label, gps_code: a.gpsCode.toUpperCase().trim(), landmark: a.landmark, lat: a.lat, lng: a.lng, is_default: a.isDefault };
    const q = a.id
      ? supabase.from('addresses').update(row).eq('id', a.id).select().single()
      : supabase.from('addresses').insert(row).select().single();
    const { data, error } = await q;
    if (error) {
      if (/gps_code/.test(error.message)) throw new BackendError('Check the GPS address — it looks like AK-485-9302');
      fail(error);
    }
    return mapAddress(data!);
  },

  async quoteDelivery(addressId) {
    const q = await rpc<Row>('quote_delivery', { p_address_id: addressId });
    return { distanceKm: Number(q.distance_km), deliverable: q.deliverable, fee: q.fee == null ? null : String(q.fee), band: q.band };
  },

  async createOrder({ orderId, addressId, lines, riderNote }) {
    await rpc('create_order', {
      p_order_id: orderId,
      p_address_id: addressId,
      p_items: lines.map((l) => ({ menu_item_id: l.menuItemId, qty: l.qty, note: l.note ?? null })),
      p_rider_note: riderNote ?? null,
    });
    return this.order(orderId);
  },

  initiatePayment: (orderId, network, phone) => api('POST', '/payments/initiate', { orderId, network, phone }),
  async submitOtp(reference, otp) { await api('POST', '/payments/otp', { reference, otp }); },
  paymentStatus: (orderId) => api('GET', `/payments/${orderId}/status`),

  async order(id) {
    const { data, error } = await supabase.from('orders').select(ORDER_COLS).eq('id', id).single();
    if (error) fail(error);
    return mapOrder(data!);
  },

  async myOrders() {
    const { data: s } = await supabase.auth.getSession();
    const { data, error } = await supabase.from('orders').select(ORDER_COLS)
      .eq('customer_id', s.session!.user.id).neq('status', 'pending_payment')
      .order('created_at', { ascending: false }).limit(50);
    if (error) fail(error);
    return data!.map(mapOrder);
  },

  async deliveryCode(orderId) {
    const { data } = await supabase.from('order_delivery_codes').select('code').eq('order_id', orderId).maybeSingle();
    return data?.code ?? null;
  },

  subscribeOrder(id, cb) {
    return channel(`order:${id}`, (c) =>
      c.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, (p) => cb(mapOrderPatch(p.new as Row))));
  },

  async tracking(orderId) {
    const t = await rpc<Row>('order_tracking', { p_order_id: orderId });
    if (!t) throw new BackendError('Order not found');
    return { status: t.status as OrderStatus, dest: t.dest, kitchen: t.kitchen, rider: t.rider };
  },

  subscribeRiderLocation(riderId, cb) {
    return channel(`rider:${riderId}:location`, (c) =>
      c.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rider_profiles', filter: `user_id=eq.${riderId}` }, (p) => {
        const r = p.new as Row;
        if (r.current_lat != null) cb({ lat: r.current_lat, lng: r.current_lng, heading: r.current_heading });
      }));
  },

  async rate(orderId, r) {
    const { data: s } = await supabase.auth.getSession();
    const { error } = await supabase.from('ratings').insert({
      order_id: orderId, customer_id: s.session!.user.id, food_stars: r.foodStars,
      rider_thumb: r.riderThumb, tags: r.tags, comment: r.comment.trim() || null,
    });
    if (error && error.code !== '23505') fail(error);
  },

  async vendorQueue() {
    const since = new Date(Date.now() - 12 * 3600_000).toISOString();
    const { data, error } = await supabase.from('orders').select(ORDER_COLS)
      .or(`status.in.(${[...KITCHEN_STATUSES, 'en_route', 'arrived', 'delivery_failed'].join(',')}),and(status.eq.delivered,delivered_at.gt.${since})`)
      .order('paid_at', { ascending: true });
    if (error) fail(error);
    return data!.map(mapOrder);
  },

  subscribeVendorQueue(cb) {
    return channel('vendor:queue', (c) => c.on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, cb));
  },

  async accept(orderId) {
    const { error } = await supabase.from('orders').update({ status: 'accepted' }).eq('id', orderId).eq('status', 'paid');
    if (error) fail(error);
  },

  async reject(orderId, reason) {
    const { error } = await supabase.from('orders').update({ status: 'rejected', reject_reason: reason }).eq('id', orderId).eq('status', 'paid');
    if (error) fail(error);
  },

  async markReady(orderId) {
    const r = await rpc<Row>('mark_ready', { p_order_id: orderId });
    return { pickupId: r.pickup_id, expiresAt: r.expires_at };
  },

  async pickupCode(orderId) {
    const { data } = await supabase.from('order_pickup_codes').select('pickup_id, expires_at').eq('order_id', orderId).maybeSingle();
    return data ? { pickupId: data.pickup_id, expiresAt: data.expires_at } : null;
  },

  async setKitchenOpen(open) {
    const { error } = await supabase.from('vendor').update({ is_open: open }).eq('id', 1);
    if (error) fail(error);
  },

  async setItemAvailable(itemId, available) {
    const { error } = await supabase.from('menu_items').update({ is_available: available }).eq('id', itemId);
    if (error) fail(error);
  },

  async overview(range) {
    const o = await rpc<Row>('vendor_overview', { p_range: range });
    return {
      orders: Number(o.orders), ordersPrev: Number(o.orders_prev), sales: String(o.sales), salesPrev: String(o.sales_prev),
      rejected: Number(o.rejected), avgCookMin: o.avg_cook_min == null ? null : Number(o.avg_cook_min),
      buckets: o.buckets ?? [], top: (o.top ?? []).map((t: Row) => ({ name: t.name, n: Number(t.n) })),
    };
  },

  async forceComplete(orderId, reason) { await rpc('vendor_force_complete', { p_order_id: orderId, p_reason: reason }); },

  async riderToday() {
    const r = await rpc<Row>('rider_today');
    return { deliveredToday: Number(r?.delivered_today ?? 0), waitingAtKitchen: Number(r?.waiting_at_kitchen ?? 0), activeOrderId: r?.active_order_id ?? null };
  },

  async claim(pickupId) {
    const r = await rpc<Row>('claim_order', { p_pickup_id: pickupId });
    return r.ok ? { ok: true, orderId: r.order_id } : { ok: false, error: r.error, message: r.message, triesLeft: r.tries_left };
  },

  async markArrived(orderId) {
    const { error } = await supabase.from('orders').update({ status: 'arrived' }).eq('id', orderId).eq('status', 'en_route');
    if (error) fail(error);
  },

  async markFailed(orderId, reason) {
    const { error } = await supabase.from('orders').update({ status: 'delivery_failed', failure_reason: reason }).eq('id', orderId);
    if (error) fail(error);
  },

  async verifyDelivery(orderId, code) {
    const r = await rpc<Row>('verify_delivery', { p_order_id: orderId, p_code: code });
    return r.ok ? { ok: true } : { ok: false, error: r.error, message: r.message, triesLeft: r.tries_left };
  },

  async pingLocation(orderId, lat, lng, heading, speed) {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return;
    await supabase.from('rider_locations').insert({
      rider_id: s.session.user.id, order_id: orderId, location: `SRID=4326;POINT(${lng} ${lat})`, heading, speed,
    });
  },

  async setOnShift(on) {
    const { data: s } = await supabase.auth.getSession();
    await supabase.from('rider_profiles').update({ on_shift: on }).eq('user_id', s.session!.user.id);
  },
};

export { ACTIVE_STATUSES };
