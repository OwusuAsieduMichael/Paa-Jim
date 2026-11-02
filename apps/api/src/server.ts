import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { loadEnv, type Env } from './env.js';
import { createServiceClient } from './lib/supabase.js';
import { Paystack } from './lib/paystack.js';
import { Notifier } from './lib/notify.js';
import { HttpError } from './auth.js';
import { startBullJobs, startInProcessJobs, type Jobs } from './jobs.js';
import { paymentRoutes } from './routes/payments.js';
import { webhookRoutes } from './routes/webhooks.js';
import { adminRoutes } from './routes/admin.js';
import type { Ctx } from './context.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface BuildOptions {
  env?: Env;
  db?: SupabaseClient;
  paystack?: Paystack;
  jobs?: Jobs;
  logger?: boolean;
}

export async function buildApp(opts: BuildOptions = {}): Promise<{ app: FastifyInstance; ctx: Ctx }> {
  const env = opts.env ?? loadEnv();
  const app = Fastify({
    logger: opts.logger === false ? false : { level: env.NODE_ENV === 'production' ? 'info' : 'debug', redact: ['req.headers.authorization'] },
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 256 * 1024,
  });

  // Keep the raw bytes: webhook signatures are computed over them.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    (req as typeof req & { rawBody?: Buffer }).rawBody = body as Buffer;
    if ((body as Buffer).length === 0) return done(null, {});
    try { done(null, JSON.parse((body as Buffer).toString('utf8'))); }
    catch { done(new HttpError(400, 'Invalid JSON'), undefined); }
  });

  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: err.issues[0]?.message ?? 'Invalid request', issues: err.issues });
    }
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message, code: err.code });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: (err as Error).message });
    req.log.error({ err }, 'unhandled');
    return reply.code(500).send({ error: 'Something went wrong' });
  });

  const db = opts.db ?? createServiceClient(env);
  const paystack = opts.paystack ?? new Paystack(env.PAYSTACK_SECRET_KEY);
  const notifier = new Notifier(env, db, app.log);
  const deps = { env, db, paystack, notifier, log: app.log };
  const jobs = opts.jobs ?? (env.REDIS_URL ? await startBullJobs(deps) : startInProcessJobs(deps));
  const ctx: Ctx = { env, db, paystack, notifier, jobs };

  app.get('/health', { config: { rateLimit: false } }, async () => {
    const { error } = await db.from('vendor').select('id').eq('id', 1).single();
    return { ok: !error, db: error ? 'down' : 'up', time: new Date().toISOString() };
  });

  await app.register(async (s) => paymentRoutes(s, ctx));
  await app.register(async (s) => webhookRoutes(s, ctx));
  await app.register(async (s) => adminRoutes(s, ctx));

  app.addHook('onClose', async () => { await jobs.close(); });
  return { app, ctx };
}

// Customer status pushes. Vendor/rider moves happen directly against Supabase,
// so the service listens to Realtime rather than being called.
const CUSTOMER_PUSH: Record<string, { title: string; body: (no: string) => string }> = {
  accepted: { title: 'Your food is cooking', body: (no) => `${no} was accepted by the kitchen.` },
  rejected: { title: 'Order not accepted', body: (no) => `${no}: the kitchen couldn't take it. A refund is on the way.` },
  en_route: { title: 'Rider is on the way', body: (no) => `${no} has left the kitchen. Have your delivery code ready.` },
  arrived: { title: 'Your rider is here', body: () => 'Share your 4-digit delivery code when you have your food.' },
  delivered: { title: 'Enjoy your meal!', body: (no) => `${no} delivered. Tap to rate it.` },
};

function listenForStatusChanges(ctx: Ctx, app: FastifyInstance) {
  const last = new Map<string, string>();
  ctx.db
    .channel('node:orders')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
      const o = payload.new as { id: string; status: string; order_no: string; customer_id: string };
      if (last.get(o.id) === o.status) return;
      last.set(o.id, o.status);
      if (last.size > 5000) last.clear();
      const tpl = CUSTOMER_PUSH[o.status];
      if (tpl) {
        void ctx.jobs.enqueue('send-push', { userIds: [o.customer_id], msg: { title: tpl.title, body: tpl.body(o.order_no), orderId: o.id, channel: 'status' } });
      }
      if (o.status === 'rejected') void ctx.jobs.enqueue('dispatch-refund', {});
    })
    .subscribe((status) => app.log.info({ status }, 'realtime: orders listener'));
}

const isMain = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isMain) {
  const { app, ctx } = await buildApp();
  listenForStatusChanges(ctx, app);
  const close = async () => { await app.close(); process.exit(0); };
  process.on('SIGTERM', close);
  process.on('SIGINT', close);
  await app.listen({ port: ctx.env.PORT, host: ctx.env.HOST });
}
