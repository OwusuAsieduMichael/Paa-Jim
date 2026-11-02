import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Ctx } from '../context.js';
import { assertRole, HttpError } from '../auth.js';
import { PaystackError, toLocalGhanaPhone } from '../lib/paystack.js';
import { applyPaymentResult } from '../domain/payments.js';

const initiateBody = z.object({
  orderId: z.string().uuid(),
  network: z.enum(['mtn', 'vod', 'atl']),
  phone: z.string().min(9).max(16),
});

const otpBody = z.object({
  reference: z.string().min(6).max(64),
  otp: z.string().regex(/^\d{4,8}$/),
});

export async function paymentRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, paystack, env } = ctx;

  // Per-customer limit: a MoMo prompt is a real-world interruption.
  const limit = { config: { rateLimit: { max: 6, timeWindow: '1 minute' } } };

  app.post('/payments/initiate', limit, async (req) => {
    const caller = await assertRole(req, db, 'customer');
    const body = initiateBody.parse(req.body);

    // RLS is bypassed here. The ownership check below is the whole defence.
    const { data: order } = await db
      .from('orders')
      .select('id, order_no, customer_id, status, total')
      .eq('id', body.orderId)
      .maybeSingle();
    if (!order || order.customer_id !== caller.id) throw new HttpError(404, 'Order not found');
    if (order.status !== 'pending_payment') throw new HttpError(409, 'This order is already paid or closed');

    const { count: inFlight } = await db
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', order.id)
      .eq('status', 'pending')
      .gt('created_at', new Date(Date.now() - 90_000).toISOString());
    if (inFlight) throw new HttpError(409, 'A payment prompt is already on its way — check your phone');

    let phone: string;
    try { phone = toLocalGhanaPhone(body.phone); } catch (e) { throw new HttpError(400, (e as Error).message); }

    const reference = `${order.order_no}-${randomBytes(4).toString('hex')}`;
    // Payment row BEFORE the charge call, so a crash mid-call is reconcilable.
    const { error: insErr } = await db.from('payments').insert({
      order_id: order.id,
      reference,
      network: body.network,
      phone,
      amount: order.total, // from the DB, never the request body
      status: 'pending',
    });
    if (insErr) throw new HttpError(500, 'Could not start payment');

    try {
      const charge = await paystack.chargeMomo({
        email: `${phone}@${env.PAYSTACK_EMAIL_DOMAIN}`,
        amount: String(order.total),
        phone,
        provider: body.network,
        reference,
        metadata: { order_id: order.id, order_no: order.order_no },
      });
      return {
        reference,
        status: charge.status,
        needsOtp: charge.status === 'send_otp',
        message: charge.display_text ?? null,
      };
    } catch (e) {
      const msg = e instanceof PaystackError ? e.message : 'Payment provider unavailable';
      await db.from('payments').update({ status: 'failed', gateway_response: msg }).eq('reference', reference).eq('status', 'pending');
      throw new HttpError(502, msg);
    }
  });

  // Telecel Cash sends an OTP by SMS before the approval prompt.
  app.post('/payments/otp', limit, async (req) => {
    const caller = await assertRole(req, db, 'customer');
    const body = otpBody.parse(req.body);
    const { data: p } = await db
      .from('payments')
      .select('id, status, order:orders(customer_id)')
      .eq('reference', body.reference)
      .maybeSingle();
    const owner = (p?.order as unknown as { customer_id: string } | null)?.customer_id;
    if (!p || owner !== caller.id) throw new HttpError(404, 'Payment not found');
    if (p.status !== 'pending') throw new HttpError(409, 'Payment already completed');
    try {
      const res = await paystack.submitOtp(body.reference, body.otp);
      return { status: res.status, message: res.display_text ?? null };
    } catch (e) {
      throw new HttpError(400, e instanceof PaystackError ? e.message : 'Could not submit code');
    }
  });

  // Polling fallback only. Realtime on the order row is the primary path.
  app.get<{ Params: { orderId: string } }>('/payments/:orderId/status', async (req) => {
    const caller = await assertRole(req, db, 'customer');
    const orderId = z.string().uuid().parse(req.params.orderId);
    const { data: order } = await db.from('orders').select('id, customer_id, status').eq('id', orderId).maybeSingle();
    if (!order || order.customer_id !== caller.id) throw new HttpError(404, 'Order not found');

    const { data: p } = await db
      .from('payments')
      .select('reference, status, created_at, gateway_response')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // If it's been pending a while, check Paystack now rather than waiting for the sweep.
    if (p?.status === 'pending' && Date.now() - new Date(p.created_at).getTime() > 20_000) {
      const outcome = await applyPaymentResult(db, paystack, p.reference).catch(() => null);
      if (outcome?.kind === 'paid') {
        await ctx.jobs.enqueue('send-push', { role: 'vendor_staff', msg: { title: 'New order', body: 'Tap to accept', orderId, channel: 'orders' } });
        await ctx.jobs.enqueue('escalate-vendor-alert', { orderId }, { delayMs: env.VENDOR_ALERT_ESCALATE_MINUTES * 60_000, jobId: `escalate:${orderId}` });
      }
      const { data: fresh } = await db.from('orders').select('status').eq('id', orderId).single();
      const { data: fp } = await db.from('payments').select('status, gateway_response').eq('reference', p.reference).single();
      return { orderStatus: fresh?.status, paymentStatus: fp?.status, message: fp?.gateway_response ?? null };
    }
    return { orderStatus: order.status, paymentStatus: p?.status ?? null, message: p?.gateway_response ?? null };
  });
}
