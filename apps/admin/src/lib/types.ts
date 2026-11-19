export type Role = 'customer' | 'vendor_staff' | 'rider' | 'admin';

export interface Me { id: string; aal: 'aal1' | 'aal2'; full_name: string | null; phone: string | null; avatar_url: string | null }

export interface DailyMetric {
  day: string; orders_paid: number; delivered: number; rejected: number; rejection_rate_pct: number | null;
  payment_failed: number; payment_failure_pct: number | null; revenue: string;
  ready_to_claim_p50_min: number | null; paid_to_delivered_p50_min: number | null;
}

export interface Vendor {
  id: number; name: string; is_open: boolean; is_suspended: boolean; ordering_enabled: boolean;
  max_concurrent_orders: number; prep_minutes: number; max_delivery_km: string; phone: string | null;
}

export interface OrderRow {
  id: string; order_no: string; status: string; subtotal?: string; delivery_fee?: string; total: string;
  customer_name: string | null; customer_phone?: string | null; rider_name: string | null; gps_code?: string;
  created_at: string; paid_at: string | null; delivered_at?: string | null;
  reject_reason?: string | null; cancel_reason?: string | null; momo_network?: string | null;
}

export interface RefundRow {
  id: string; order_id?: string; amount: string; status: string; attempts: number; last_error: string | null;
  reason: string; created_at: string; updated_at?: string;
}

export interface Overview { metrics: DailyMetric[] | null; vendor: Vendor | null; live: OrderRow[] | null; refunds: RefundRow[] | null }

export interface OrderDetail {
  order: Record<string, unknown> & OrderRow & {
    address_label: string; landmark: string | null; distance_km: string; rider_note: string | null; rider_phone: string | null;
    momo_last4: string | null; failure_reason: string | null; accepted_at: string | null; ready_at: string | null;
    claimed_at: string | null; arrived_at: string | null; closed_at: string | null;
  };
  items: { name: string; unit_price: string; qty: number; line_total: string; note: string | null }[];
  payments: { id: string; reference: string; network: string; phone: string; amount: string; status: string; gateway_response: string | null; created_at: string; verified_at: string | null }[];
  refunds: RefundRow[];
  rating: { food_stars: number; rider_thumb: boolean | null; tags: string[]; comment: string | null } | null;
}

export interface Category { id: number; name: string; sort: number }
export interface MenuItem {
  id: string; category_id: number; name: string; description: string; price: string;
  is_available: boolean; is_active: boolean; is_popular: boolean; image_url: string | null; tint: string; sort: number;
}
export interface Band { min_km: number; max_km: number; fee: number }
export interface Menu { categories: Category[]; items: MenuItem[]; bands: { min_km: string; max_km: string; fee: string }[] }

export interface Person {
  id: string; role: Role; full_name: string | null; phone: string | null; avatar_url: string | null; is_active: boolean; created_at: string;
  rider: { vehicle: string; on_shift: boolean; location_updated_at: string | null } | null;
}

export interface AuditRow { id: number; admin_id: string; action: string; target_type: string; target_id: string | null; reason: string; payload: Record<string, unknown>; created_at: string }
