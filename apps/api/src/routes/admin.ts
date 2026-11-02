import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../context.js';
import { assertAdmin, audit, HttpError } from '../auth.js';
import { applyPaymentResult } from '../domain/payments.js';

// Admin controls money and people. Every route: admin role + MFA (aal2),
// zod-validated body, and an admin_actions row with a 10+ char reason.

const reason = z.string().trim().min(10, 'Give a reason of at least 10 characters').max(500);
const ghPhone = z.string().transform((s, c) => {
  const d = s.replace(/\D/g, '');
  const e164 = d.startsWith('233') && d.length === 12 ? d : d.startsWith('0') && d.length === 10 ? '233' + d.slice(1) : d.length === 9 ? '233' + d : null;
  if (!e164) { c.addIssue({ code: 'custom', message: 'Enter a valid Ghana mobile number' }); return z.NEVER; }
  return e164;
});
const uuid = z.string().uuid();
const money = z.union([z.string(), z.number()]).transform((v, c) => {
  const s = String(v).trim();
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s) || Number(s) <= 0) { c.addIssue({ code: 'custom', message: 'Enter an amount like 55 or 55.50' }); return z.NEVER; }
  return s;
});

export async function adminRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, paystack, jobs } = ctx;

  // ---------------------------------------------------------------- reads
  app.get('/admin/overview', async (req) => {
    await assertAdmin(req, db);
    const [{ data: metrics }, { data: vendor }, { data: live }, { data: refunds }] = await Promise.all([
      db.from('daily_metrics').select('*').limit(14),
      db.from('vendor').select('*').eq('id', 1).single(),
      db.from('orders').select('id, order_no, status, total, created_at, paid_at, customer_name, rider_name')
        .in('status', ['paid', 'accepted', 'ready_for_pickup', 'en_route', 'arrived', 'delivery_failed']).order('created_at'),
      db.from('refunds').select('id, order_id, amount, status, attempts, last_error, reason, created_at').neq('status', 'success').order('created_at', { ascending: false }).limit(50),
    ]);
    return { metrics, vendor, live, refunds };
  });

  app.get<{ Querystring: { status?: string; q?: string; limit?: string } }>('/admin/orders', async (req) => {
    await assertAdmin(req, db);
    let q = db.from('orders').select('id, order_no, status, subtotal, delivery_fee, total, customer_name, customer_phone, rider_name, gps_code, created_at, paid_at, delivered_at, reject_reason, cancel_reason, momo_network')
      .order('created_at', { ascending: false }).limit(Math.min(Number(req.query.limit ?? 100), 500));
    if (req.query.status) q = q.eq('status', req.query.status);
    if (req.query.q) q = q.ilike('order_no', `%${req.query.q}%`);
    const { data, error } = await q;
    if (error) throw new HttpError(500, error.message);
    return data;
  });

  app.get('/admin/team', async (req) => {
    await assertAdmin(req, db);
    const { data } = await db.from('profiles').select('id, role, full_name, phone, is_active, created_at, rider:rider_profiles(vehicle, on_shift, location_updated_at)').neq('role', 'customer').order('role');
    return data;
  });

  app.get('/admin/actions', async (req) => {
    await assertAdmin(req, db);
    const { data } = await db.from('admin_actions').select('*').order('created_at', { ascending: false }).limit(200);
    return data;
  });

  // ---------------------------------------------------------------- people
  async function provision(role: 'rider' | 'vendor_staff', body: { phone: string; full_name: string; vehicle?: string }) {
    const { data, error } = await db.auth.admin.createUser({ phone: body.phone, phone_confirm: true });
    if (error || !data.user) throw new HttpError(409, error?.message ?? 'Could not create user');
    const id = data.user.id;
    const { error: pErr } = await db.from('profiles').update({ role, full_name: body.full_name }).eq('id', id);
    if (pErr) throw new HttpError(500, pErr.message);
    if (role === 'rider') await db.from('rider_profiles').insert({ user_id: id, vehicle: body.vehicle ?? 'Motorbike' });
    return id;
  }

  app.post('/admin/riders', async (req) => {
    const admin = await assertAdmin(req, db);
    const b = z.object({ phone: ghPhone, full_name: z.string().trim().min(2).max(80), vehicle: z.string().max(40).optional(), reason }).parse(req.body);
    const id = await provision('rider', b);
    await audit(db, admin, 'rider.create', { type: 'profile', id }, b.reason, { phone: b.phone });
    return { id };
  });

  app.patch<{ Params: { userId: string } }>('/admin/riders/:userId', async (req) => {
    const admin = await assertAdmin(req, db);
    const id = uuid.parse(req.params.userId);
    const b = z.object({ is_active: z.boolean().optional(), full_name: z.string().trim().min(2).max(80).optional(), vehicle: z.string().max(40).optional(), reason }).parse(req.body);
    const { data: p } = await db.from('profiles').select('role').eq('id', id).single();
    if (p?.role !== 'rider') throw new HttpError(404, 'Rider not found');
    const patch: Record<string, unknown> = {};
    if (b.is_active !== undefined) patch.is_active = b.is_active;
    if (b.full_name) patch.full_name = b.full_name;
    if (Object.keys(patch).length) await db.from('profiles').update(patch).eq('id', id);
    if (b.vehicle) await db.from('rider_profiles').update({ vehicle: b.vehicle }).eq('user_id', id);
    if (b.is_active === false) {
      await db.from('rider_profiles').update({ on_shift: false }).eq('user_id', id);
      await db.auth.admin.signOut(id).catch(() => undefined);
    }
    await audit(db, admin, 'rider.update', { type: 'profile', id }, b.reason, { ...patch, vehicle: b.vehicle });
    return { ok: true };
  });

  app.post('/admin/vendor-staff', async (req) => {
    const admin = await assertAdmin(req, db);
    const b = z.object({ phone: ghPhone, full_name: z.string().trim().min(2).max(80), reason }).parse(req.body);
    const id = await provision('vendor_staff', b);
    await audit(db, admin, 'vendor_staff.create', { type: 'profile', id }, b.reason, { phone: b.phone });
    return { id };
  });

  app.patch<{ Params: { userId: string } }>('/admin/vendor-staff/:userId', async (req) => {
    const admin = await assertAdmin(req, db);
    const id = uuid.parse(req.params.userId);
    const b = z.object({ is_active: z.boolean().optional(), full_name: z.string().trim().min(2).max(80).optional(), reason }).parse(req.body);
    const { data: p } = await db.from('profiles').select('role').eq('id', id).single();
    if (p?.role !== 'vendor_staff') throw new HttpError(404, 'Staff member not found');
    const patch: Record<string, unknown> = {};
    if (b.is_active !== undefined) patch.is_active = b.is_active;
    if (b.full_name) patch.full_name = b.full_name;
    await db.from('profiles').update(patch).eq('id', id);
    if (b.is_active === false) await db.auth.admin.signOut(id).catch(() => undefined);
    await audit(db, admin, 'vendor_staff.update', { type: 'profile', id }, b.reason, patch);
    return { ok: true };
  });

  // ---------------------------------------------------------------- money
  app.post<{ Params: { orderId: string } }>('/admin/payments/:orderId/reverify', async (req) => {
    const admin = await assertAdmin(req, db);
    const orderId = uuid.parse(req.params.orderId);
    const { reason: r } = z.object({ reason }).parse(req.body);
    const { data: pays } = await db.from('payments').select('reference').eq('order_id', orderId).eq('status', 'pending');
    const outcomes = [];
    for (const p of pays ?? []) outcomes.push(await applyPaymentResult(db, paystack, p.reference));
    await audit(db, admin, 'payment.reverify', { type: 'order', id: orderId }, r, { outcomes });
    return { outcomes };
  });

  app.post('/admin/refunds', async (req) => {
    const admin = await assertAdmin(req, db);
    const b = z.object({ orderId: uuid, amount: money.optional(), reason }).parse(req.body);
    const { data: pay } = await db.from('payments').select('id, amount').eq('order_id', b.orderId).eq('status', 'success').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!pay) throw new HttpError(404, 'No successful payment on this order');
    const amount = b.amount ?? String(pay.amount);
    if (Number(amount) > Number(pay.amount)) throw new HttpError(400, 'Refund cannot exceed the amount paid');
    const { data, error } = await db.from('refunds').insert({ order_id: b.orderId, payment_id: pay.id, amount, reason: b.reason }).select('id').single();
    if (error) throw new HttpError(409, error.code === '23505' ? 'This payment already has a refund' : error.message);
    await audit(db, admin, 'refund.create', { type: 'refund', id: data.id }, b.reason, { orderId: b.orderId, amount });
    await jobs.enqueue('dispatch-refund', { refundId: data.id });
    return { id: data.id };
  });

  app.post<{ Params: { refundId: string } }>('/admin/refunds/:refundId/retry', async (req) => {
    const admin = await assertAdmin(req, db);
    const id = uuid.parse(req.params.refundId);
    const { reason: r } = z.object({ reason }).parse(req.body);
    const { data, error } = await db.from('refunds').update({ status: 'pending', attempts: 0 }).eq('id', id).eq('status', 'failed').select('id');
    if (error || !data?.length) throw new HttpError(409, 'Only a failed refund can be retried');
    await audit(db, admin, 'refund.retry', { type: 'refund', id }, r);
    await jobs.enqueue('dispatch-refund', { refundId: id });
    return { ok: true };
  });

  // ---------------------------------------------------------------- orders
  app.post<{ Params: { orderId: string } }>('/admin/orders/:orderId/force-cancel', async (req) => {
    const admin = await assertAdmin(req, db);
    const id = uuid.parse(req.params.orderId);
    const { reason: r } = z.object({ reason }).parse(req.body);
    const { data, error } = await db.from('orders').update({ status: 'cancelled', cancel_reason: r }).eq('id', id).select('id, customer_id, order_no');
    if (error) throw new HttpError(409, error.message.replace(/^illegal transition/, 'This order cannot be cancelled from'));
    if (!data?.length) throw new HttpError(404, 'Order not found');
    await audit(db, admin, 'order.force_cancel', { type: 'order', id }, r);
    await jobs.enqueue('dispatch-refund', {}); // trigger queued one if it was paid
    await jobs.enqueue('send-push', { userIds: [data[0]!.customer_id], msg: { title: 'Order cancelled', body: `${data[0]!.order_no} was cancelled. Any payment will be refunded.`, orderId: id, channel: 'status' } });
    return { ok: true };
  });

  // Escape hatch: rider can't verify, vendor isn't reachable, customer confirms by phone.
  app.post<{ Params: { orderId: string } }>('/admin/orders/:orderId/force-complete', async (req) => {
    const admin = await assertAdmin(req, db);
    const id = uuid.parse(req.params.orderId);
    const { reason: r } = z.object({ reason }).parse(req.body);
    const { data, error } = await db.from('orders').update({ status: 'delivered' }).eq('id', id).in('status', ['en_route', 'arrived', 'delivery_failed']).select('id');
    if (error) throw new HttpError(409, error.message);
    if (!data?.length) throw new HttpError(409, 'Only an out-for-delivery order can be force-completed');
    await audit(db, admin, 'order.force_complete', { type: 'order', id }, r);
    return { ok: true };
  });

  // ---------------------------------------------------------------- kill switches
  app.post('/admin/vendor/suspend', async (req) => {
    const admin = await assertAdmin(req, db);
    const b = z.object({ suspended: z.boolean(), reason }).parse(req.body);
    await db.from('vendor').update({ is_suspended: b.suspended }).eq('id', 1);
    await audit(db, admin, b.suspended ? 'vendor.suspend' : 'vendor.unsuspend', { type: 'vendor', id: '1' }, b.reason);
    return { ok: true };
  });

  app.patch('/admin/vendor/capacity', async (req) => {
    const admin = await assertAdmin(req, db);
    const b = z.object({
      max_concurrent_orders: z.number().int().min(1).max(100).optional(),
      prep_minutes: z.number().int().min(5).max(120).optional(),
      max_delivery_km: z.number().min(0.5).max(50).optional(),
      ordering_enabled: z.boolean().optional(),
      reason,
    }).parse(req.body);
    const { reason: r, ...patch } = b;
    if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to change');
    await db.from('vendor').update(patch).eq('id', 1);
    await audit(db, admin, 'vendor.capacity', { type: 'vendor', id: '1' }, r, patch);
    return { ok: true };
  });

  // ---------------------------------------------------------------- menu & pricing
  const itemFields = z.object({
    category_id: z.number().int().positive(),
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(200).default(''),
    price: money,
    is_popular: z.boolean().default(false),
    image_url: z.string().url().nullable().optional(),
    tint: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    sort: z.number().int().min(0).max(999).default(0),
  });

  app.post('/admin/menu-items', async (req) => {
    const admin = await assertAdmin(req, db);
    const b = itemFields.extend({ reason }).parse(req.body);
    const { reason: r, ...row } = b;
    const { data, error } = await db.from('menu_items').insert(row).select('id').single();
    if (error) throw new HttpError(400, error.message);
    await audit(db, admin, 'menu_item.create', { type: 'menu_item', id: data.id }, r, row);
    return { id: data.id };
  });

  app.patch<{ Params: { itemId: string } }>('/admin/menu-items/:itemId', async (req) => {
    const admin = await assertAdmin(req, db);
    const id = uuid.parse(req.params.itemId);
    const b = itemFields.partial().extend({ is_available: z.boolean().optional(), is_active: z.boolean().optional(), reason }).parse(req.body);
    const { reason: r, ...patch } = b;
    const { data: before } = await db.from('menu_items').select('price, name').eq('id', id).single();
    if (!before) throw new HttpError(404, 'Item not found');
    const { error } = await db.from('menu_items').update(patch).eq('id', id);
    if (error) throw new HttpError(400, error.message);
    await audit(db, admin, 'menu_item.update', { type: 'menu_item', id }, r, { before, after: patch });
    return { ok: true };
  });

  app.delete<{ Params: { itemId: string } }>('/admin/menu-items/:itemId', async (req) => {
    const admin = await assertAdmin(req, db);
    const id = uuid.parse(req.params.itemId);
    const { reason: r } = z.object({ reason }).parse(req.body);
    // Soft delete: past orders reference this row.
    const { error } = await db.from('menu_items').update({ is_active: false }).eq('id', id);
    if (error) throw new HttpError(400, error.message);
    await audit(db, admin, 'menu_item.delete', { type: 'menu_item', id }, r);
    return { ok: true };
  });

  app.post('/admin/menu-categories', async (req) => {
    const admin = await assertAdmin(req, db);
    const b = z.object({ name: z.string().trim().min(2).max(40), sort: z.number().int().default(0), reason }).parse(req.body);
    const { data, error } = await db.from('menu_categories').insert({ name: b.name, sort: b.sort }).select('id').single();
    if (error) throw new HttpError(400, error.message);
    await audit(db, admin, 'menu_category.create', { type: 'menu_category', id: String(data.id) }, b.reason, { name: b.name });
    return { id: data.id };
  });

  app.put('/admin/delivery-fee-bands', async (req) => {
    const admin = await assertAdmin(req, db);
    const b = z.object({
      bands: z.array(z.object({ min_km: z.number().min(0), max_km: z.number().positive(), fee: z.number().min(0) })).min(1).max(20),
      reason,
    }).parse(req.body);
    const bands = [...b.bands].sort((x, y) => x.min_km - y.min_km);
    if (bands[0]!.min_km !== 0) throw new HttpError(400, 'The first band must start at 0 km');
    for (let i = 0; i < bands.length; i++) {
      if (bands[i]!.max_km <= bands[i]!.min_km) throw new HttpError(400, `Band ${i + 1}: max must be above min`);
      if (i > 0 && bands[i]!.min_km !== bands[i - 1]!.max_km) throw new HttpError(400, 'Bands must be contiguous (no gaps or overlaps)');
    }
    const { data: before } = await db.from('delivery_fee_bands').select('min_km, max_km, fee').order('min_km');
    await db.from('delivery_fee_bands').delete().gte('id', 0);
    const { error } = await db.from('delivery_fee_bands').insert(bands);
    if (error) throw new HttpError(500, error.message);
    await audit(db, admin, 'delivery_fee_bands.replace', { type: 'delivery_fee_bands' }, b.reason, { before, after: bands });
    return { ok: true };
  });
}
