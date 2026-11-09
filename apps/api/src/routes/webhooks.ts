import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Ctx } from '../context.js';

type RawReq = FastifyRequest & { rawBody?: Buffer };

export async function webhookRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, paystack, env, jobs, notifier } = ctx;
  const allowedIps = new Set(env.PAYSTACK_WEBHOOK_IPS.split(',').map((s) => s.trim()).filter(Boolean));

  // No user here. Authenticity = HMAC signature + source IP.
  app.post('/webhooks/paystack', { config: { rateLimit: false } }, async (req: RawReq, reply) => {
    if (env.NODE_ENV === 'production' && !allowedIps.has(req.ip)) {
      req.log.warn({ ip: req.ip }, 'paystack webhook from unexpected IP');
      return reply.code(403).send();
    }
    if (!req.rawBody || !paystack.verifySignature(req.rawBody, req.headers['x-paystack-signature'] as string | undefined)) {
      return reply.code(401).send();
    }

    const body = req.body as { event?: string; data?: { id?: number; reference?: string } };
    const reference = body.data?.reference;
    if (!body.event || !reference) return reply.code(200).send(); // nothing we act on

    // Unique per event: a conflict means we've already taken it.
    const eventId = `${body.event}:${body.data?.id ?? reference}`;
    const { error } = await db.from('webhook_events').insert({ id: eventId, event: body.event, payload: body });
    if (error) {
      if (error.code === '23505') return reply.code(200).send(); // duplicate delivery → no-op
      req.log.error({ error }, 'webhook insert failed');
      return reply.code(500).send(); // let Paystack retry
    }

    if (body.event.startsWith('charge.')) {
      await jobs.enqueue('process-webhook', { reference, eventId }, { jobId: `wh:${eventId}` });
    } else if (body.event.startsWith('refund.')) {
      await jobs.enqueue('dispatch-refund', {});
    }
    // 200 immediately; the worker re-verifies against Paystack.
    return reply.code(200).send();
  });

  // Supabase Auth "Send SMS" hook → our Ghana SMS provider.
  // Configure in Supabase: Auth → Hooks → Send SMS → HTTPS → <API_URL>/hooks/send-sms
  app.post('/hooks/send-sms', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req: RawReq, reply) => {
    if (!env.SEND_SMS_HOOK_SECRET) return reply.code(503).send({ error: 'hook not configured' });
    if (!verifyStandardWebhook(req, env.SEND_SMS_HOOK_SECRET)) return reply.code(401).send();
    const body = req.body as { user?: { phone?: string; new_phone?: string }; sms?: { otp?: string; phone?: string }; new_phone?: string };
    // A phone change must text the NEW number. Supabase's hook schema doesn't document
    // where that is; `new_phone` is the only name its docs use, so prefer it if present.
    const phone = body.new_phone || body.user?.new_phone || body.sms?.phone || body.user?.phone;
    const otp = body.sms?.otp;
    if (!phone || !otp) return reply.code(400).send({ error: 'missing phone or otp' });
    if (!phone.replace(/\D/g, '').startsWith('233')) return reply.code(400).send({ error: 'Ghana (+233) numbers only' });
    await notifier.sms(phone, `Your Paa Jim code is ${otp}. It expires in 5 minutes. Don't share it.`);
    return reply.code(200).send({});
  });
}

// Standard Webhooks (https://www.standardwebhooks.com), as used by Supabase Auth hooks.
function verifyStandardWebhook(req: RawReq, secret: string): boolean {
  const id = req.headers['webhook-id'] as string | undefined;
  const ts = req.headers['webhook-timestamp'] as string | undefined;
  const sigHeader = req.headers['webhook-signature'] as string | undefined;
  if (!id || !ts || !sigHeader || !req.rawBody) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^v1,/, '').replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${ts}.${req.rawBody.toString('utf8')}`).digest('base64');
  return sigHeader.split(' ').some((part) => {
    const sig = part.split(',')[1];
    if (!sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}
