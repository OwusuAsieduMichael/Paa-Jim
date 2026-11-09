// Domain types shared by the Supabase and demo backends. Money is always the
// server's string (numeric(10,2)); convert with lib/money at the edge.

export type Role = 'customer' | 'vendor_staff' | 'rider' | 'admin';

export type OrderStatus =
  | 'pending_payment' | 'payment_failed' | 'paid' | 'accepted' | 'rejected'
  | 'ready_for_pickup' | 'en_route' | 'arrived' | 'delivered' | 'delivery_failed' | 'cancelled';

export const ACTIVE_STATUSES: OrderStatus[] = ['pending_payment', 'paid', 'accepted', 'ready_for_pickup', 'en_route', 'arrived'];
export const KITCHEN_STATUSES: OrderStatus[] = ['paid', 'accepted', 'ready_for_pickup'];

export type Network = 'mtn' | 'vod' | 'atl';

export interface User {
  id: string;
  role: Role;
  phone: string | null;
  fullName: string | null;
  /** Profile photo (public URL), if they added one. */
  avatarUrl?: string | null;
}

/** A saved mobile-money number (never a PIN). */
export interface Wallet { id: string; network: Network; phone: string; label: string | null; isDefault: boolean }

export interface KitchenStatus {
  accepting: boolean;
  reason: string | null;
  isOpen: boolean;
  closes: string | null;
  etaMin: number;
  etaMax: number;
  vendorName: string;
  vendorLat: number;
  vendorLng: number;
  vendorPhone: string | null;
}

export interface Category { id: number; name: string; sort: number }

export interface MenuItem {
  id: string;
  categoryId: number;
  name: string;
  description: string;
  price: string;
  isAvailable: boolean;
  isPopular: boolean;
  imageUrl: string | null;
  tint: string;
  sort: number;
}

export interface Address {
  id: string;
  label: 'Home' | 'Work' | 'Other';
  gpsCode: string;
  landmark: string | null;
  lat: number;
  lng: number;
  isDefault: boolean;
}

export type AuthIntent = { mode: 'signup'; fullName: string } | { mode: 'login' };

export interface DeliveryQuote { distanceKm: number; deliverable: boolean; fee: string | null; band: string | null }

export interface CartLine { menuItemId: string; qty: number; note?: string }

export interface OrderItem { name: string; qty: number; unitPrice: string; lineTotal: string; note?: string | null }

export interface Order {
  id: string;
  orderNo: string;
  status: OrderStatus;
  subtotal: string;
  deliveryFee: string;
  total: string;
  items: OrderItem[];
  addressLabel: string;
  gpsCode: string;
  landmark: string | null;
  distanceKm: number;
  destLat: number;
  destLng: number;
  riderNote: string | null;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAvatarUrl?: string | null;
  riderId: string | null;
  riderName: string | null;
  riderPhone: string | null;
  riderAvatarUrl?: string | null;
  momoNetwork: Network | null;
  momoLast4: string | null;
  rejectReason: string | null;
  cancelReason: string | null;
  failureReason: string | null;
  verifyAttempts: number;
  createdAt: string;
  paidAt: string | null;
  acceptedAt: string | null;
  readyAt: string | null;
  claimedAt: string | null;
  arrivedAt: string | null;
  deliveredAt: string | null;
  rated?: boolean;
}

export interface PaymentStart { reference: string; needsOtp: boolean; message: string | null }

export interface Tracking {
  status: OrderStatus;
  dest: { lat: number; lng: number };
  kitchen: { lat: number; lng: number };
  rider: { id: string; lat: number; lng: number; heading: number | null; at: string; vehicle: string } | null;
}

export interface RiderToday { deliveredToday: number; waitingAtKitchen: number; activeOrderId: string | null }

export type ClaimResult = { ok: true; orderId: string } | { ok: false; error: 'invalid' | 'locked'; message: string; triesLeft?: number };
export type VerifyResult = { ok: true } | { ok: false; error: 'wrong' | 'locked'; message: string; triesLeft?: number };

export interface Overview {
  orders: number;
  ordersPrev: number;
  sales: string;
  salesPrev: string;
  rejected: number;
  avgCookMin: number | null;
  buckets: Array<{ k: number; n: number }>;
  top: Array<{ name: string; n: number }>;
}

export interface RatingInput { foodStars: number; riderThumb: boolean | null; tags: string[]; comment: string }

export type Unsubscribe = () => void;

export class BackendError extends Error {
  constructor(message: string, public code?: string, public network = false) {
    super(message);
  }
}

export interface Backend {
  readonly demo: boolean;
  // auth
  currentUser(): Promise<User | null>;
  /**
   * Text a 6-digit code. 'signup' creates the account (customer) and stores the name;
   * 'login' never creates one and throws BackendError code 'no_account' for unknown numbers.
   */
  sendOtp(e164: string, intent: AuthIntent): Promise<void>;
  verifyOtp(e164: string, code: string): Promise<User>;
  /** Signed-in user: text a code to the new number. Nothing changes until it's confirmed. */
  requestPhoneChange(newE164: string): Promise<void>;
  confirmPhoneChange(newE164: string, code: string): Promise<User>;
  signOut(): Promise<void>;
  updateName(fullName: string): Promise<void>;
  /** Upload a photo (local file URI, already resized) as the profile picture, or remove it with null. */
  setAvatar(localUri: string | null): Promise<User>;
  onAuthChange(cb: (u: User | null) => void): Unsubscribe;
  registerPushToken(token: string, platform: 'android' | 'ios'): Promise<void>;
  /** Stop pushes to this device for the signed-in user (call before signing out). */
  unregisterPushToken(token: string): Promise<void>;
  // catalogue
  kitchenStatus(): Promise<KitchenStatus>;
  menu(): Promise<{ categories: Category[]; items: MenuItem[] }>;
  subscribeMenu(cb: () => void): Unsubscribe;
  // addresses
  addresses(): Promise<Address[]>;
  saveAddress(a: Omit<Address, 'id'> & { id?: string }): Promise<Address>;
  wallets(): Promise<Wallet[]>;
  saveWallet(w: { id?: string; network: Network; phone: string; label?: string | null; isDefault?: boolean }): Promise<Wallet>;
  deleteWallet(id: string): Promise<void>;
  quoteDelivery(addressId: string): Promise<DeliveryQuote>;
  // customer orders
  createOrder(input: { orderId: string; addressId: string; lines: CartLine[]; riderNote?: string }): Promise<Order>;
  initiatePayment(orderId: string, network: Network, phone: string): Promise<PaymentStart>;
  submitOtp(reference: string, otp: string): Promise<void>;
  paymentStatus(orderId: string): Promise<{ orderStatus: OrderStatus; paymentStatus: string | null; message: string | null }>;
  order(id: string): Promise<Order>;
  myOrders(): Promise<Order[]>;
  deliveryCode(orderId: string): Promise<string | null>;
  subscribeOrder(id: string, cb: (o: Partial<Order> & { id: string }) => void): Unsubscribe;
  tracking(orderId: string): Promise<Tracking>;
  subscribeRiderLocation(riderId: string, cb: (p: { lat: number; lng: number; heading: number | null }) => void): Unsubscribe;
  rate(orderId: string, r: RatingInput): Promise<void>;
  // vendor
  vendorQueue(): Promise<Order[]>;
  subscribeVendorQueue(cb: () => void): Unsubscribe;
  accept(orderId: string): Promise<void>;
  reject(orderId: string, reason: string): Promise<void>;
  markReady(orderId: string): Promise<{ pickupId: string; expiresAt: string }>;
  pickupCode(orderId: string): Promise<{ pickupId: string; expiresAt: string } | null>;
  setKitchenOpen(open: boolean): Promise<void>;
  setItemAvailable(itemId: string, available: boolean): Promise<void>;
  overview(range: 'today' | 'week'): Promise<Overview>;
  forceComplete(orderId: string, reason: string): Promise<void>;
  // rider
  riderToday(): Promise<RiderToday>;
  claim(pickupId: string): Promise<ClaimResult>;
  markArrived(orderId: string): Promise<void>;
  markFailed(orderId: string, reason: string): Promise<void>;
  verifyDelivery(orderId: string, code: string): Promise<VerifyResult>;
  pingLocation(orderId: string, lat: number, lng: number, heading: number | null, speed: number | null): Promise<void>;
  setOnShift(on: boolean): Promise<void>;
}
