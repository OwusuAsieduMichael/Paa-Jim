import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from './env.js';
import { Paystack } from './lib/paystack.js';
import { Notifier, type PushMessage } from './lib/notify.js';
import { applyPaymentResult } from './domain/payments.js';

// Handbook §2.8. Repeatable jobs use stable scheduler ids so a redeploy
// replaces rather than duplicates. If pg_cron takes over the prune jobs,
// remove them here — running both double-fires.

export type JobName =
  | 'reconcile-payments'
  | 'auto-cancel-review'
  | 'process-webhook'
  | 'dispatch-refund'
  | 'send-push'
  | 'escalate-vendor-alert'
  | 'prune-locations'
  | 'prune-device-tokens'
  | 'abandon-payments';

export interface JobData {
  'process-webhook': { reference: string; eventId: string };
  'dispatch-refund': { refundId?: string };
  'send-push': { userIds?: string[]; role?: 'vendor_staff' | 'rider' | 'admin'; msg: PushMessage };
  'escalate-vendor-alert': { orderId: string };
  [k: string]: unknown;
}

export interface Jobs {
  enqueue<N extends JobName>(name: N, data: JobData[N] | Record<string, never>, opts?: { delayMs?: number; jobId?: string }): Promise<void>;
  close(): Promise<void>;
}

interface Deps {
  env: Env;
  db: SupabaseClient;
  paystack: Paystack;
  notifier: Notifier;
  log: FastifyBaseLogger;
}

const SCHEDULES: Array<{ name: JobName; every?: number; pattern?: string }> = [
  { name: 'reconcile-payments', every: 2 * 60_000 },
  { name: 'auto-cancel-review', every: 60_000 },
  { name: 'abandon-payments', every: 5 * 60_000 },
  { name: 'dispatch-refund', every: 60_000 },          // sweep for any pending refund
  { name: 'prune-locations', pattern: '0 3 * * *' },     // 03:00 daily (Accra = UTC)
  { name: 'prune-device-tokens', pattern: '0 4 * * 0' }, // Sunday 04:00
];

export function makeHandlers(d: Deps) {
  const { env, db, paystack, notifier, log } = d;
  const warned = new Set<string>(); // vendor 5-minute warnings already sent (per process)

  async function onPaid(orderId: string, jobs: Jobs) {
    await jobs.enqueue('send-push', { role: 'vendor_staff', msg: { title: 'New order', body: 'Tap to accept', orderId, channel: 'orders' } });
    await jobs.enqueue('escalate-vendor-alert', { orderId }, { delayMs: env.VENDOR_ALERT_ESCALATE_MINUTES * 60_000, jobId: `escalate:${orderId}` });
  }

  return {
    async 'process-webhook'(data: JobData['process-webhook'], jobs: Jobs) {
      const outcome = await applyPaymentResult(db, paystack, data.reference);
      await db.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('id', data.eventId);
      if (outcome.kind === 'paid') await onPaid(outcome.orderId, jobs);
      if (outcome.kind === 'late_success_refunded') await jobs.enqueue('dispatch-refund', {});
      return outcome;
    },

    async 'reconcile-payments'(_: unknown, jobs: Jobs) {
      const cutoff = new Date(Date.now() - env.RECONCILE_AFTER_SECONDS * 1000).toISOString();
      const { data } = await db.from('payments').select('reference').eq('status', 'pending').lt('created_at', cutoff).limit(50);
      let applied = 0;
      for (const p of data ?? []) {
        try {
          const outcome = await applyPaymentResult(db, paystack, p.reference);
          if (outcome.kind === 'paid') { applied++; await onPaid(outcome.orderId, jobs); }
          if (outcome.kind === 'late_success_refunded') await jobs.enqueue('dispatch-refund', {});
        } catch (e) {
          log.warn({ err: e, reference: p.reference }, 'reconcile: verify failed');
        }
      }
      return { checked: data?.length ?? 0, applied };
    },

    async 'abandon-payments'() {
      const cutoff = new Date(Date.now() - env.ABANDON_PAYMENT_MINUTES * 60_000).toISOString();
      const { data: stale } = await db.from('orders').select('id').eq('status', 'pending_payment').lt('created_at', cutoff).limit(100);
      for (const o of stale ?? []) {
        const { count: inFlight } = await db.from('payments').select('id', { count: 'exact', head: true }).eq('order_id', o.id).eq('status', 'pending');
        if (inFlight) continue; // reconciliation will settle it first
        const { count: failedCount } = await db.from('payments').select('id', { count: 'exact', head: true }).eq('order_id', o.id).in('status', ['failed', 'abandoned']);
        await db.from('orders')
          .update(failedCount ? { status: 'payment_failed' } : { status: 'cancelled', cancel_reason: 'Payment not completed' })
          .eq('id', o.id).eq('status', 'pending_payment');
      }
      return { closed: stale?.length ?? 0 };
    },

    async 'auto-cancel-review'(_: unknown, jobs: Jobs) {
      const now = Date.now();
      const { data } = await db.from('orders').select('id, order_no, customer_id, paid_at').eq('status', 'paid');
      let cancelled = 0;
      for (const o of data ?? []) {
        const ageMin = (now - new Date(o.paid_at).getTime()) / 60_000;
        if (ageMin >= env.AUTO_CANCEL_MINUTES) {
          const { data: moved } = await db.from('orders')
            .update({ status: 'cancelled', cancel_reason: `Kitchen did not accept within ${env.AUTO_CANCEL_MINUTES} minutes` })
            .eq('id', o.id).eq('status', 'paid').select('id');
          if (moved?.length) {
            cancelled++;
            // The DB trigger has queued the refund; dispatch it now.
            await jobs.enqueue('dispatch-refund', {});
            await jobs.enqueue('send-push', { userIds: [o.customer_id], msg: { title: 'Order cancelled — refund on the way', body: `${o.order_no}: the kitchen couldn't take your order. Your MoMo will be refunded.`, orderId: o.id, channel: 'status' } });
          }
        } else if (ageMin >= env.VENDOR_WARN_MINUTES && !warned.has(o.id)) {
          warned.add(o.id);
          await jobs.enqueue('send-push', { role: 'vendor_staff', msg: { title: `${o.order_no} cancels in ${Math.ceil(env.AUTO_CANCEL_MINUTES - ageMin)} min`, body: 'Accept or reject now', orderId: o.id, channel: 'orders' } });
        }
      }
      return { cancelled };
    },

    async 'dispatch-refund'(data: JobData['dispatch-refund']) {
      let q = db.from('refunds').select('id, amount, attempts, payment:payments(reference)').in('status', ['pending', 'failed']).lt('attempts', 5).order('created_at').limit(20);
      if (data?.refundId) q = q.eq('id', data.refundId);
      const { data: rows } = await q;
      let done = 0;
      for (const r of rows ?? []) {
        const { data: claimed } = await db.from('refunds')
          .update({ status: 'processing', attempts: r.attempts + 1 })
          .eq('id', r.id).in('status', ['pending', 'failed']).select('id');
        if (!claimed?.length) continue; // another worker has it
        const reference = (r.payment as unknown as { reference: string } | null)?.reference;
        try {
          if (!reference) throw new Error('no payment reference');
          const res = await paystack.refund(reference, String(r.amount));
          await db.from('refunds').update({ status: 'success', gateway_ref: res.id ? String(res.id) : null, last_error: null }).eq('id', r.id);
          done++;
        } catch (e) {
          await db.from('refunds').update({ status: 'failed', last_error: (e as Error).message.slice(0, 500) }).eq('id', r.id);
          log.error({ err: e, refundId: r.id }, 'refund failed');
        }
      }
      return { done };
    },

    async 'send-push'(data: JobData['send-push']) {
      if (data.role) return notifier.pushToRole(data.role, data.msg);
      return notifier.pushToUsers(data.userIds ?? [], data.msg);
    },

    async 'escalate-vendor-alert'(data: JobData['escalate-vendor-alert']) {
      const { data: o } = await db.from('orders').select('order_no, status').eq('id', data.orderId).single();
      if (o?.status !== 'paid') return { skipped: true };
      const to = env.KITCHEN_ALERT_PHONE ?? (await db.from('vendor').select('phone').eq('id', 1).single()).data?.phone;
      if (to) await notifier.sms(to, `Paa Jim: order ${o.order_no} is waiting. Open the vendor app and accept or reject now.`);
      return { sms: Boolean(to) };
    },

    async 'prune-locations'() {
      const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const { count } = await db.from('rider_locations').delete({ count: 'exact' }).lt('recorded_at', cutoff);
      return { deleted: count };
    },

    async 'prune-device-tokens'() {
      const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
      const { count } = await db.from('device_tokens').delete({ count: 'exact' }).lt('last_seen', cutoff);
      return { deleted: count };
    },
  } satisfies Record<JobName, (data: never, jobs: Jobs) => Promise<unknown>>;
}

/** Production: BullMQ on Redis. */
export async function startBullJobs(d: Deps): Promise<Jobs> {
  const connection = new Redis(d.env.REDIS_URL!, { maxRetriesPerRequest: null });
  const queue = new Queue('paajim', { connection });
  const handlers = makeHandlers(d);

  const jobs: Jobs = {
    async enqueue(name, data, opts) {
      const retry = name === 'dispatch-refund' ? { attempts: 5, backoff: { type: 'exponential', delay: 30_000 } } : { attempts: 3, backoff: { type: 'exponential', delay: 5_000 } };
      await queue.add(name, data, { ...retry, delay: opts?.delayMs, jobId: opts?.jobId, removeOnComplete: 1000, removeOnFail: 5000 });
    },
    async close() {
      await worker.close();
      await queue.close();
      connection.disconnect();
    },
  };

  const worker = new Worker(
    'paajim',
    async (job: Job) => {
      const h = handlers[job.name as JobName] as (data: unknown, jobs: Jobs) => Promise<unknown>;
      if (!h) throw new Error(`unknown job ${job.name}`);
      return h(job.data, jobs);
    },
    { connection: connection.duplicate({ maxRetriesPerRequest: null }), concurrency: 4 },
  );
  worker.on('failed', (job, err) => d.log.error({ job: job?.name, err }, 'job failed'));

  for (const s of SCHEDULES) {
    await queue.upsertJobScheduler(s.name, s.every ? { every: s.every } : { pattern: s.pattern! }, { name: s.name, data: {} });
  }
  d.log.info('BullMQ workers and schedules started');
  return jobs;
}

/** Local dev without Redis: same handlers on timers, in process. Not for production. */
export function startInProcessJobs(d: Deps): Jobs {
  const handlers = makeHandlers(d);
  const timers: NodeJS.Timeout[] = [];
  const run = (name: JobName, data: unknown) => {
    const h = handlers[name] as (data: unknown, jobs: Jobs) => Promise<unknown>;
    h(data, jobs).catch((err) => d.log.error({ job: name, err }, 'job failed'));
  };
  const jobs: Jobs = {
    async enqueue(name, data, opts) {
      if (opts?.delayMs) timers.push(setTimeout(() => run(name, data), opts.delayMs));
      else queueMicrotask(() => run(name, data));
    },
    async close() {
      timers.forEach(clearTimeout);
      timers.forEach(clearInterval);
    },
  };
  for (const s of SCHEDULES) if (s.every) timers.push(setInterval(() => run(s.name, {}), s.every));
  d.log.warn('REDIS_URL not set — running jobs in-process (dev only; cron prunes disabled)');
  return jobs;
}
