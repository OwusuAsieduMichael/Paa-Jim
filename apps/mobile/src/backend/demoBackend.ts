import * as Crypto from 'expo-crypto';
import { add, dec, times, toPesewas } from '@/lib/money';
import {
  BackendError, KITCHEN_STATUSES,
  type Address, type Backend, type Category, type ClaimResult, type MenuItem, type Order,
  type OrderStatus, type User, type VerifyResult, type Wallet,
} from './types';

// In-memory backend for trying the app without Supabase. Same contract as the
// real one, including server-side totals, pickup IDs and delivery codes.
// Demo numbers: …0002 = vendor, …0003 = rider, anything else = customer.

const KITCHEN = { lat: 6.8426, lng: -1.3977 }; // Effiduase, Ashanti — same as supabase/catalogue.sql
const now = () => new Date().toISOString();
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');

const categories: Category[] = [
  { id: 1, name: 'Jollof', sort: 1 }, { id: 2, name: 'Fried rice', sort: 2 }, { id: 3, name: 'Drinks', sort: 4 }, { id: 4, name: 'Rice & stew', sort: 3 },
];
const mk = (id: string, categoryId: number, name: string, description: string, price: string, tint: string, sort: number, isPopular = false, isAvailable = true): MenuItem =>
  ({ id, categoryId, name, description, price, tint, sort, isPopular, isAvailable, imageUrl: null });
const items: MenuItem[] = [
  mk('j1', 1, 'Jollof & Chicken', 'Smoky party jollof, grilled chicken, coleslaw and shito', '40.00', '#F9DCCB', 1, true),
  mk('j2', 1, 'Jollof & Beef', 'Stewed beef, coleslaw and shito', '35.00', '#F3D3C2', 2),
  mk('j3', 1, 'Jollof & Fried Fish', 'Fried fish, coleslaw and shito', '45.00', '#F7D5B8', 3),
  mk('j4', 1, 'Assorted Jollof', 'Chicken, beef, sausage and boiled egg', '55.00', '#F5C9B3', 4, true),
  mk('f1', 2, 'Fried Rice & Chicken', 'Veggie fried rice, grilled chicken, shito', '45.00', '#F6E5C2', 1),
  mk('f2', 2, 'Fried Rice & Beef', 'Stewed beef, coleslaw and shito', '40.00', '#F3E1C0', 2),
  mk('f3', 2, 'Fried Rice & Fried Fish', 'Fried fish, coleslaw and shito', '50.00', '#EFE2C8', 3),
  mk('f4', 2, 'Assorted Fried Rice', 'Chicken, beef, sausage and boiled egg', '60.00', '#F1DDB0', 4, true),
  mk('r1', 4, 'Plain Rice & Fish Stew', 'Grilled tilapia, rich tomato stew, veggie rice', '45.00', '#F3D3C2', 1),
  mk('r2', 4, 'Plain Rice, Stew & Plantain', 'Fried plantain, boiled egg, stew and fresh salad', '40.00', '#F6E0C8', 2),
  mk('d1', 3, 'Bottled Water 500ml', 'Awake, chilled', '7.00', '#DCEBF5', 1, true),
  mk('d2', 3, 'Bottled Water 1.5L', 'Awake, chilled', '10.00', '#CFE3F0', 2),
  mk('d3', 3, 'Coca-Cola · can', 'Ice-cold, 330ml', '17.00', '#F3D0DA', 3, true),
  mk('d4', 3, 'Fanta · can', 'Orange, ice-cold, 330ml', '17.00', '#F9E0C4', 4),
  mk('d5', 3, 'Sprite · can', 'Lemon-lime, ice-cold, 330ml', '17.00', '#E3EAD5', 5),
  mk('d6', 3, 'Pepsi · can', 'Ice-cold, 330ml', '20.00', '#D6E0F3', 6),
  mk('d7', 3, 'Malta Guinness · can', 'Non-alcoholic malt, chilled, 330ml', '20.00', '#F5EBC4', 7),
];

// Demo accounts by phone. Sign-up adds to this, so log-in only works for numbers that exist.
const USERS: Record<string, User> = {
  '233240000001': { id: 'u-customer', role: 'customer', phone: '233240000001', fullName: 'Ama Mensah' },
  '233240000002': { id: 'u-vendor', role: 'vendor_staff', phone: '233240000002', fullName: 'Kitchen Tablet' },
  '233240000003': { id: 'u-rider', role: 'rider', phone: '233240000003', fullName: 'Kwame Asante' },
  '233240000004': { id: 'u-admin', role: 'admin', phone: '233240000004', fullName: 'Admin One' },
};

const pendingSignups = new Map<string, User>();
let user: User | null = null;
let kitchenOpen = true;
let addressBook: Address[] = [];
let walletBook: Wallet[] = [];
const orders = new Map<string, Order>();
const deliveryCodes = new Map<string, string>();
const pickupCodes = new Map<string, { pickupId: string; expiresAt: string }>();
const ratings = new Set<string>();
const rider = { lat: KITCHEN.lat, lng: KITCHEN.lng, heading: 0 as number | null };
let claimFails: number[] = [];
let seq = 1044;

type Fn = () => void;
const listeners = { orders: new Set<Fn>(), auth: new Set<(u: User | null) => void>(), menu: new Set<Fn>(), rider: new Set<Fn>() };
const emit = (k: 'orders' | 'menu' | 'rider') => listeners[k].forEach((f) => f());

function baseOrder(o: Partial<Order> & Pick<Order, 'id' | 'orderNo' | 'status' | 'items'>): Order {
  const subtotal = add(...o.items.map((i) => toPesewas(i.lineTotal)));
  const fee = toPesewas(o.deliveryFee ?? '5.00');
  return {
    subtotal: dec(subtotal), deliveryFee: dec(fee), total: dec(add(subtotal, fee)),
    addressLabel: 'Home', gpsCode: 'AS-485-9302', landmark: 'Blue gate opposite the church', distanceKm: 2.8,
    destLat: 6.8678, destLng: -1.3977, riderNote: null, customerId: 'u-customer', customerName: 'Ama Mensah', customerPhone: '233240000001',
    riderId: null, riderName: null, riderPhone: null, momoNetwork: 'mtn', momoLast4: '0001',
    rejectReason: null, cancelReason: null, failureReason: null, verifyAttempts: 0,
    createdAt: ago(30), paidAt: ago(29), acceptedAt: null, readyAt: null, claimedAt: null, arrivedAt: null, deliveredAt: null,
    ...o,
  } as Order;
}
const line = (itemId: string, qty: number, note?: string) => {
  const it = items.find((i) => i.id === itemId)!;
  return { name: it.name, qty, unitPrice: it.price, lineTotal: dec(times(toPesewas(it.price), qty)), note: note ?? null };
};

function seed() {
  const put = (o: Order, code?: string) => { orders.set(o.id, o); deliveryCodes.set(o.id, code ?? digits(4)); };
  put(baseOrder({ id: 'o-1031', orderNo: 'PJ-1031', status: 'delivered', items: [line('f2', 2)], createdAt: ago(60 * 50), paidAt: ago(60 * 50), deliveredAt: ago(60 * 49), riderName: 'Kwame Asante' }));
  ratings.add('o-1031');
  put(baseOrder({ id: 'o-1019', orderNo: 'PJ-1019', status: 'rejected', rejectReason: 'Kitchen was full', items: [line('j4', 1), line('d2', 1)], deliveryFee: '10.00', createdAt: ago(60 * 24 * 5), paidAt: ago(60 * 24 * 5) }));
  put(baseOrder({ id: 'o-1043', orderNo: 'PJ-1043', status: 'paid', items: [line('j1', 2), line('d1', 2)], riderNote: 'less pepper please', customerName: 'Yaw Boateng', distanceKm: 1.9, paidAt: ago(1.8), createdAt: ago(2) }));
  put(baseOrder({ id: 'o-1042', orderNo: 'PJ-1042', status: 'ready_for_pickup', items: [line('j1', 1, 'Extra shito'), line('f4', 1), line('d3', 1)], customerName: 'Efua Owusu', acceptedAt: ago(16), readyAt: ago(1), paidAt: ago(17), createdAt: ago(18) }));
  pickupCodes.set('o-1042', { pickupId: '284615', expiresAt: new Date(Date.now() + 59 * 60_000).toISOString() });
  put(baseOrder({ id: 'o-1041', orderNo: 'PJ-1041', status: 'accepted', items: [line('j4', 2), line('d4', 2)], customerName: 'Kojo Mensah', acceptedAt: ago(9), paidAt: ago(10), createdAt: ago(11) }));
  put(baseOrder({ id: 'o-1040', orderNo: 'PJ-1040', status: 'accepted', items: [line('f2', 1), line('d2', 1)], customerName: 'Abena K.', acceptedAt: ago(4), paidAt: ago(5), createdAt: ago(6) }));
}
seed();

function setStatus(id: string, status: OrderStatus, patch: Partial<Order> = {}) {
  const o = orders.get(id);
  if (!o) return;
  const ts: Partial<Record<OrderStatus, keyof Order>> = { paid: 'paidAt', accepted: 'acceptedAt', ready_for_pickup: 'readyAt', en_route: 'claimedAt', arrived: 'arrivedAt', delivered: 'deliveredAt' };
  const k = ts[status];
  orders.set(id, { ...o, ...patch, status, ...(k ? { [k]: now() } : {}) });
  if (status !== 'ready_for_pickup') pickupCodes.delete(id);
  emit('orders');
}

/** Moves a customer's own demo order along so tracking can be seen end to end. */
function simulate(id: string) {
  const step = (ms: number, from: OrderStatus, fn: () => void) => setTimeout(() => { if (orders.get(id)?.status === from) fn(); }, ms);
  step(7000, 'paid', () => {
    setStatus(id, 'accepted');
    step(12000, 'accepted', () => {
      setStatus(id, 'ready_for_pickup');
      step(5000, 'ready_for_pickup', () => {
        setStatus(id, 'en_route', { riderId: 'u-rider', riderName: 'Kwame Asante', riderPhone: '233240000003' });
        const o = orders.get(id)!;
        const steps = 30;
        for (let i = 1; i <= steps; i++) {
          setTimeout(() => {
            if (orders.get(id)?.status !== 'en_route') return;
            const t = i / steps;
            rider.lat = KITCHEN.lat + (o.destLat - KITCHEN.lat) * t;
            rider.lng = KITCHEN.lng + (o.destLng - KITCHEN.lng) * t + Math.sin(t * Math.PI) * 0.004;
            rider.heading = 0;
            emit('rider');
            if (i === steps) setStatus(id, 'arrived');
          }, i * 1500);
        }
        setTimeout(() => { if (orders.get(id)?.status === 'arrived') setStatus(id, 'delivered'); }, steps * 1500 + 20000);
      });
    });
  });
}

const sorted = <T,>(xs: T[], k: (x: T) => string) => [...xs].sort((a, b) => k(a).localeCompare(k(b)));

export const demoBackend: Backend = {
  demo: true,

  async currentUser() { return user; },
  async sendOtp(e164, intent) {
    await wait(500);
    if (!/^233\d{9}$/.test(e164)) throw new BackendError('Enter a valid Ghana number');
    const existing = USERS[e164];
    if (intent.mode === 'login' && !existing) throw new BackendError('No account with this number', 'no_account');
    // Like Supabase: signing up with a number that already has an account just logs in.
    if (intent.mode === 'signup' && !existing) {
      pendingSignups.set(e164, { id: `u-${e164}`, role: 'customer', phone: e164, fullName: intent.fullName });
    }
  },
  async verifyOtp(e164, code) {
    await wait(400);
    if (!/^\d{6}$/.test(code)) throw new BackendError('Enter the 6-digit code');
    const signup = pendingSignups.get(e164);
    if (signup) { USERS[e164] = signup; pendingSignups.delete(e164); }
    const found = USERS[e164];
    if (!found) throw new BackendError('No account with this number', 'no_account');
    user = found;
    listeners.auth.forEach((f) => f(user));
    return found;
  },
  async requestPhoneChange(newE164) {
    await wait(500);
    if (!/^233\d{9}$/.test(newE164)) throw new BackendError('Enter a valid Ghana number');
    if (USERS[newE164]) throw new BackendError('That number already has a Paa Jim account', 'phone_taken');
  },
  async confirmPhoneChange(newE164, code) {
    await wait(400);
    if (!user) throw new BackendError('Please sign in again');
    if (!/^\d{6}$/.test(code)) throw new BackendError('Enter the 6-digit code');
    if (user.phone) delete USERS[user.phone];
    user = { ...user, phone: newE164 };
    USERS[newE164] = user;
    listeners.auth.forEach((f) => f(user));
    return user;
  },
  async signOut() { user = null; listeners.auth.forEach((f) => f(null)); },
  async updateName(fullName) { if (user) { user = { ...user, fullName }; if (user.phone) USERS[user.phone] = user; } },
  async wallets() { return [...walletBook].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)); },
  async saveWallet(w) {
    if (walletBook.some((x) => x.phone === w.phone && x.id !== w.id)) throw new BackendError('That number is already saved.', 'duplicate');
    if (!w.id && walletBook.length >= 5) throw new BackendError('You can save up to 5 MoMo wallets', 'limit');
    const prev = walletBook.find((x) => x.id === w.id);
    const saved: Wallet = { id: w.id ?? Crypto.randomUUID(), network: w.network, phone: w.phone, label: w.label ?? prev?.label ?? null, isDefault: w.isDefault ?? prev?.isDefault ?? walletBook.length === 0 };
    if (saved.isDefault) walletBook.forEach((x) => { x.isDefault = false; });
    walletBook = [...walletBook.filter((x) => x.id !== saved.id), saved];
    return saved;
  },
  async deleteWallet(id) {
    const gone = walletBook.find((x) => x.id === id);
    walletBook = walletBook.filter((x) => x.id !== id);
    if (gone?.isDefault && walletBook.length) walletBook[walletBook.length - 1]!.isDefault = true;
  },

  async setAvatar(localUri) {
    if (!user) throw new BackendError('Log in first', 'signed_out');
    user = { ...user, avatarUrl: localUri };
    if (user.phone) USERS[user.phone] = user;
    return user;
  },
  onAuthChange(cb) { listeners.auth.add(cb); return () => listeners.auth.delete(cb); },
  async registerPushToken() {},
  async unregisterPushToken() {},

  async kitchenStatus() {
    return {
      accepting: kitchenOpen, reason: kitchenOpen ? null : 'The kitchen is taking a short break', isOpen: kitchenOpen,
      closes: '7 PM', etaMin: 25, etaMax: 35, vendorName: 'Paa Jim’s Kitchen', vendorLat: KITCHEN.lat, vendorLng: KITCHEN.lng, vendorPhone: '233240000002',
    };
  },
  async menu() { await wait(150); return { categories, items: items.map((i) => ({ ...i })) }; },
  subscribeMenu(cb) { listeners.menu.add(cb); return () => listeners.menu.delete(cb); },

  async addresses() { return addressBook.map((a) => ({ ...a })); },
  async saveAddress(a) {
    if (!/^[A-Z]{2}-?\d{3,4}-?\d{3,4}$/i.test(a.gpsCode.trim())) throw new BackendError('Check the GPS address — it looks like AS-485-9302');
    const saved: Address = { ...a, gpsCode: a.gpsCode.toUpperCase().trim(), id: a.id ?? Crypto.randomUUID() };
    if (saved.isDefault) addressBook = addressBook.map((x) => ({ ...x, isDefault: false }));
    addressBook = [...addressBook.filter((x) => x.id !== saved.id), saved];
    return saved;
  },
  async quoteDelivery(addressId) {
    const a = addressBook.find((x) => x.id === addressId);
    if (!a) throw new BackendError('Address not found');
    const km = Math.round(Math.hypot((a.lat - KITCHEN.lat) * 111, (a.lng - KITCHEN.lng) * 111) * 100) / 100 || 2.8;
    const bands: Array<[number, number, string]> = [[0, 2, '4.00'], [2, 5, '5.00'], [5, 10, '7.00']];
    const b = bands.find(([lo, hi]) => km >= lo && km < hi);
    return { distanceKm: km, deliverable: Boolean(b), fee: b?.[2] ?? null, band: b ? `${b[0]}–${b[1]} km` : null };
  },

  async createOrder({ orderId, addressId, lines, riderNote }) {
    await wait(400);
    const existing = orders.get(orderId);
    if (existing) return existing;
    if (!kitchenOpen) throw new BackendError('The kitchen is taking a short break');
    const a = addressBook.find((x) => x.id === addressId);
    if (!a) throw new BackendError('Choose a delivery address');
    const q = await this.quoteDelivery(addressId);
    if (!q.deliverable) throw new BackendError(`That address is outside our delivery area (${q.distanceKm} km)`);
    const orderItems = lines.map((l) => {
      const it = items.find((i) => i.id === l.menuItemId);
      if (!it) throw new BackendError('An item in your cart is no longer on the menu');
      if (!it.isAvailable) throw new BackendError(`${it.name} is sold out`);
      return line(it.id, l.qty, l.note);
    });
    const o = baseOrder({
      id: orderId, orderNo: `PJ-${seq++}`, status: 'pending_payment', items: orderItems, deliveryFee: q.fee!,
      addressLabel: a.label, gpsCode: a.gpsCode, landmark: a.landmark, destLat: a.lat, destLng: a.lng, distanceKm: q.distanceKm,
      riderNote: riderNote || null, customerId: user!.id, customerName: user!.fullName, customerPhone: user!.phone, customerAvatarUrl: user!.avatarUrl ?? null,
      createdAt: now(), paidAt: null, momoNetwork: null, momoLast4: null,
    });
    orders.set(orderId, o);
    deliveryCodes.set(orderId, digits(4));
    return o;
  },

  async initiatePayment(orderId, network, phone) {
    await wait(700);
    const reference = `${orders.get(orderId)!.orderNo}-${digits(4)}`;
    const pay = () => setTimeout(() => setStatus(orderId, 'paid', { momoNetwork: network, momoLast4: phone.replace(/\D/g, '').slice(-4) }), 3500);
    (demoBackend as unknown as { _pending: Map<string, () => void> })._pending.set(reference, () => { pay(); simulate(orderId); });
    if (network !== 'vod') { pay(); simulate(orderId); }
    return { reference, needsOtp: network === 'vod', message: null };
  },
  async submitOtp(reference, otp) {
    await wait(500);
    if (!/^\d{4,8}$/.test(otp)) throw new BackendError('Enter the code from your SMS');
    (demoBackend as unknown as { _pending: Map<string, () => void> })._pending.get(reference)?.();
  },
  async paymentStatus(orderId) { return { orderStatus: orders.get(orderId)!.status, paymentStatus: null, message: null }; },

  async order(id) {
    const o = orders.get(id);
    if (!o) throw new BackendError('Order not found');
    return { ...o, rated: ratings.has(id) };
  },
  async myOrders() {
    return sorted([...orders.values()].filter((o) => o.customerId === user?.id && o.status !== 'pending_payment'), (o) => o.createdAt)
      .reverse().map((o) => ({ ...o, rated: ratings.has(o.id) }));
  },
  async deliveryCode(orderId) { return deliveryCodes.get(orderId) ?? null; },
  subscribeOrder(id, cb) {
    const f = () => { const o = orders.get(id); if (o) cb({ ...o }); };
    listeners.orders.add(f);
    return () => listeners.orders.delete(f);
  },
  async tracking(orderId) {
    const o = orders.get(orderId)!;
    const live = o.status === 'en_route' || o.status === 'arrived';
    return { status: o.status, dest: { lat: o.destLat, lng: o.destLng }, kitchen: KITCHEN, rider: live ? { id: 'u-rider', lat: rider.lat, lng: rider.lng, heading: rider.heading, at: now(), vehicle: 'Motorbike' } : null };
  },
  subscribeRiderLocation(_id, cb) {
    const f = () => cb({ lat: rider.lat, lng: rider.lng, heading: rider.heading });
    listeners.rider.add(f);
    return () => listeners.rider.delete(f);
  },
  async rate(orderId) { ratings.add(orderId); },

  async vendorQueue() {
    const since = Date.now() - 12 * 3600_000;
    return sorted([...orders.values()].filter((o) =>
      [...KITCHEN_STATUSES, 'en_route', 'arrived', 'delivery_failed'].includes(o.status) ||
      (o.status === 'delivered' && new Date(o.deliveredAt!).getTime() > since)), (o) => o.paidAt ?? o.createdAt);
  },
  subscribeVendorQueue(cb) { listeners.orders.add(cb); return () => listeners.orders.delete(cb); },
  async accept(id) { await wait(); if (orders.get(id)?.status !== 'paid') throw new BackendError('Order is no longer waiting'); setStatus(id, 'accepted'); },
  async reject(id, reason) { await wait(); setStatus(id, 'rejected', { rejectReason: reason }); },
  async markReady(id) {
    await wait();
    let pickupId = digits(6);
    while ([...pickupCodes.values()].some((p) => p.pickupId === pickupId)) pickupId = digits(6);
    const code = { pickupId, expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() };
    setStatus(id, 'ready_for_pickup');
    pickupCodes.set(id, code);
    emit('orders');
    return code;
  },
  async pickupCode(id) { return pickupCodes.get(id) ?? null; },
  async setKitchenOpen(open) { kitchenOpen = open; },
  async setItemAvailable(itemId, available) { const it = items.find((i) => i.id === itemId); if (it) it.isAvailable = available; emit('menu'); },
  async overview(range) {
    const day = range === 'today';
    return {
      orders: day ? 46 : 317, ordersPrev: day ? 41 : 299, sales: day ? '3280.00' : '22410.00', salesPrev: day ? '3010.00' : '21540.00',
      rejected: day ? 1 : 9, avgCookMin: day ? 14 : 15,
      buckets: (day ? [1, 3, 5, 4, 2, 1, 2, 3, 4, 6, 8, 9, 6] : [38, 41, 35, 44, 52, 61, 46]).map((n, i) => ({ k: day ? 10 + i : i + 1, n })),
      top: day ? [{ name: 'Jollof & Chicken', n: 14 }, { name: 'Assorted Jollof', n: 9 }, { name: 'Assorted Fried Rice', n: 8 }, { name: 'Coca-Cola · can', n: 31 }]
        : [{ name: 'Jollof & Chicken', n: 92 }, { name: 'Assorted Jollof', n: 61 }, { name: 'Assorted Fried Rice', n: 55 }, { name: 'Coca-Cola · can', n: 204 }],
    };
  },
  async forceComplete(id, reason) {
    if (reason.trim().length < 10) throw new BackendError('Give a reason of at least 10 characters');
    setStatus(id, 'delivered');
  },

  async riderToday() {
    const mine = [...orders.values()].filter((o) => o.riderId === user?.id);
    return {
      deliveredToday: mine.filter((o) => o.status === 'delivered').length + 5,
      waitingAtKitchen: [...orders.values()].filter((o) => o.status === 'ready_for_pickup').length,
      activeOrderId: mine.find((o) => o.status === 'en_route' || o.status === 'arrived')?.id ?? null,
    };
  },
  async claim(pickupId): Promise<ClaimResult> {
    await wait(400);
    claimFails = claimFails.filter((t) => t > Date.now() - 10 * 60_000);
    if (claimFails.length >= 5) return { ok: false, error: 'locked', message: 'Too many wrong tries. Claiming is locked for 10 minutes.' };
    const hit = [...pickupCodes.entries()].find(([, c]) => c.pickupId === pickupId && new Date(c.expiresAt) > new Date());
    if (!hit || orders.get(hit[0])?.status !== 'ready_for_pickup') {
      claimFails.push(Date.now());
      return { ok: false, error: 'invalid', message: 'Invalid or already claimed.', triesLeft: 5 - claimFails.length };
    }
    setStatus(hit[0], 'en_route', { riderId: user!.id, riderName: user!.fullName, riderPhone: user!.phone, riderAvatarUrl: user!.avatarUrl ?? null });
    return { ok: true, orderId: hit[0] };
  },
  async markArrived(id) { await wait(); setStatus(id, 'arrived'); },
  async markFailed(id, reason) { await wait(); setStatus(id, 'delivery_failed', { failureReason: reason }); },
  async verifyDelivery(id, code): Promise<VerifyResult> {
    await wait(400);
    const o = orders.get(id)!;
    if (o.status === 'delivered') return { ok: true };
    if (o.verifyAttempts >= 5) return { ok: false, error: 'locked', message: 'Too many wrong codes. Contact the vendor to complete this delivery.' };
    if (deliveryCodes.get(id) !== code) {
      orders.set(id, { ...o, verifyAttempts: o.verifyAttempts + 1 });
      return { ok: false, error: 'wrong', message: 'That code is not right.', triesLeft: 4 - o.verifyAttempts };
    }
    setStatus(id, 'delivered');
    return { ok: true };
  },
  async pingLocation(_id, lat, lng, heading) { rider.lat = lat; rider.lng = lng; rider.heading = heading; emit('rider'); },
  async setOnShift() {},
};
(demoBackend as unknown as { _pending: Map<string, () => void> })._pending = new Map();

/** Demo-only: the delivery code for an order, so the rider screen can hint it. */
export const demoPeekCode = (orderId: string) => deliveryCodes.get(orderId) ?? null;
