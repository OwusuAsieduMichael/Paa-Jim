import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildApp } from '../src/server.js';
import { loadEnv } from '../src/env.js';
import { Paystack, toLocalGhanaPhone } from '../src/lib/paystack.js';
import type { Jobs } from '../src/jobs.js';
import { fakeDb } from './fake-db.js';
import { Notifier } from '../src/lib/notify.js';

const SECRET = 'sk_test_unit_secret_key_0123456789';
const env = loadEnv({
  NODE_ENV: 'test',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-for-tests-only-xxxxxxxx',
  PAYSTACK_SECRET_KEY: SECRET,
} as NodeJS.ProcessEnv);

const AMA = '11111111-1111-1111-1111-111111111111';
const KOFI = '55555555-5555-5555-5555-555555555555';
const ORDER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function seed() {
  return {
    profiles: [
      { id: AMA, role: 'customer', phone: '233240000001', is_active: true },
      { id: KOFI, role: 'customer', phone: '233240000009', is_active: true },
    ],
    orders: [{ id: ORDER, order_no: 'PJ-1042', customer_id: AMA, status: 'pending_payment', total: '150.00' }],
    payments: [] as Record<string, unknown>[],
    webhook_events: [] as Record<string, unknown>[],
    vendor: [{ id: 1 }],
  };
}

class FakePaystack extends Paystack {
  charges: unknown[] = [];
  constructor() { super(SECRET, (() => { throw new Error('no network in tests'); }) as unknown as typeof fetch); }
  override async chargeMomo(input: Parameters<Paystack['chargeMomo']>[0]) { this.charges.push(input); return { status: 'pay_offline', reference: input.reference }; }
}

function recordingJobs() {
  const calls: Array<{ name: string; data: unknown }> = [];
  const jobs: Jobs = { enqueue: async (name, data) => { calls.push({ name, data }); }, close: async () => {} };
  return { jobs, calls };
}

async function setup() {
  const db = fakeDb(seed(), { 'token-ama': AMA, 'token-kofi': KOFI });
  const paystack = new FakePaystack();
  const { jobs, calls } = recordingJobs();
  const { app } = await buildApp({ env, db: db as unknown as SupabaseClient, paystack, jobs, logger: false });
  return { app, db, paystack, calls };
}

const sign = (body: string) => createHmac('sha512', SECRET).update(body).digest('hex');

describe('money helpers', () => {
  it('converts GHS strings to pesewas without float error', () => {
    expect(Paystack.toPesewas('150.00')).toBe(15000);
    expect(Paystack.toPesewas('0.1')).toBe(10);
    expect(Paystack.toPesewas('19.99')).toBe(1999);
    expect(Paystack.toPesewas('55')).toBe(5500);
    expect(() => Paystack.toPesewas('1.234')).toThrow();
  });
  it('normalises Ghana numbers to Paystack MoMo format', () => {
    expect(toLocalGhanaPhone('+233 24 123 4567')).toBe('0241234567');
    expect(toLocalGhanaPhone('0241234567')).toBe('0241234567');
    expect(toLocalGhanaPhone('241234567')).toBe('0241234567');
    expect(() => toLocalGhanaPhone('12345')).toThrow();
  });
});

describe('POST /webhooks/paystack', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { t = await setup(); });
  const body = JSON.stringify({ event: 'charge.success', data: { id: 99, reference: 'PJ-1042-abcd' } });

  it('rejects a missing or wrong signature', async () => {
    const r1 = await t.app.inject({ method: 'POST', url: '/webhooks/paystack', payload: body, headers: { 'content-type': 'application/json' } });
    expect(r1.statusCode).toBe(401);
    const r2 = await t.app.inject({ method: 'POST', url: '/webhooks/paystack', payload: body, headers: { 'content-type': 'application/json', 'x-paystack-signature': sign(body + ' ') } });
    expect(r2.statusCode).toBe(401);
    expect(t.calls).toHaveLength(0);
  });

  it('accepts a valid signature, records the event and enqueues the work', async () => {
    const r = await t.app.inject({ method: 'POST', url: '/webhooks/paystack', payload: body, headers: { 'content-type': 'application/json', 'x-paystack-signature': sign(body) } });
    expect(r.statusCode).toBe(200);
    expect(t.db.tables.webhook_events).toHaveLength(1);
    expect(t.calls).toEqual([{ name: 'process-webhook', data: { reference: 'PJ-1042-abcd', eventId: 'charge.success:99' } }]);
  });

  it('treats a duplicate delivery as a no-op', async () => {
    const h = { 'content-type': 'application/json', 'x-paystack-signature': sign(body) };
    await t.app.inject({ method: 'POST', url: '/webhooks/paystack', payload: body, headers: h });
    const again = await t.app.inject({ method: 'POST', url: '/webhooks/paystack', payload: body, headers: h });
    expect(again.statusCode).toBe(200);
    expect(t.db.tables.webhook_events).toHaveLength(1);
    expect(t.calls).toHaveLength(1);
  });
});

describe('POST /payments/initiate', () => {
  let t: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { t = await setup(); });
  const payload = { orderId: ORDER, network: 'mtn', phone: '024 123 4567', amount: '0.01' };

  it('requires a session', async () => {
    const r = await t.app.inject({ method: 'POST', url: '/payments/initiate', payload });
    expect(r.statusCode).toBe(401);
  });

  it("refuses to charge someone else's order (RLS is bypassed here)", async () => {
    const r = await t.app.inject({ method: 'POST', url: '/payments/initiate', payload, headers: { authorization: 'Bearer token-kofi' } });
    expect(r.statusCode).toBe(404);
    expect(t.paystack.charges).toHaveLength(0);
    expect(t.db.tables.payments).toHaveLength(0);
  });

  it('charges the DB total — never the amount in the request — and writes the payment row first', async () => {
    const r = await t.app.inject({ method: 'POST', url: '/payments/initiate', payload, headers: { authorization: 'Bearer token-ama' } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ status: 'pay_offline', needsOtp: false });
    expect(t.paystack.charges[0]).toMatchObject({ amount: '150.00', phone: '0241234567', provider: 'mtn' });
    expect(t.db.tables.payments[0]).toMatchObject({ order_id: ORDER, amount: '150.00', status: 'pending', network: 'mtn' });
  });

  it('validates the network code (vod is Telecel; tlc is not a Paystack code)', async () => {
    const r = await t.app.inject({ method: 'POST', url: '/payments/initiate', payload: { ...payload, network: 'tlc' }, headers: { authorization: 'Bearer token-ama' } });
    expect(r.statusCode).toBe(400);
  });
});

describe('admin routes', () => {
  it('reject non-admins', async () => {
    const t = await setup();
    const r = await t.app.inject({ method: 'POST', url: '/admin/vendor/suspend', payload: { suspended: true, reason: 'testing the guard' }, headers: { authorization: 'Bearer token-ama' } });
    expect(r.statusCode).toBe(403);
  });
});

describe('POST /hooks/send-sms (Supabase Send SMS hook)', () => {
  const HOOK_SECRET = 'v1,whsec_' + Buffer.from('unit-test-hook-secret-32-bytes!!').toString('base64');
  const hookEnv = { ...env, SEND_SMS_HOOK_SECRET: HOOK_SECRET };

  async function hookApp() {
    const db = fakeDb(seed(), {});
    const { app } = await buildApp({ env: hookEnv, db: db as unknown as SupabaseClient, paystack: new FakePaystack(), jobs: recordingJobs().jobs, logger: false });
    return app;
  }
  function signed(body: string, secret = HOOK_SECRET) {
    const id = 'msg_test_1';
    const ts = String(Math.floor(Date.now() / 1000));
    const key = Buffer.from(secret.replace(/^v1,/, '').replace(/^whsec_/, ''), 'base64');
    const sig = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
    return { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` };
  }

  it('rejects an unsigned or wrongly signed request', async () => {
    const app = await hookApp();
    const body = JSON.stringify({ user: { phone: '233241234567' }, sms: { otp: '123456' } });
    expect((await app.inject({ method: 'POST', url: '/hooks/send-sms', payload: body, headers: { 'content-type': 'application/json' } })).statusCode).toBe(401);
    const wrong = 'v1,whsec_' + Buffer.from('a-different-secret-entirely-xxxx').toString('base64');
    expect((await app.inject({ method: 'POST', url: '/hooks/send-sms', payload: body, headers: signed(body, wrong) })).statusCode).toBe(401);
  });

  it('texts the code to the user, with the design wording', async () => {
    const spy = vi.spyOn(Notifier.prototype, 'sms').mockResolvedValue();
    const app = await hookApp();
    const body = JSON.stringify({ user: { phone: '233241234567' }, sms: { otp: '482913' } });
    const r = await app.inject({ method: 'POST', url: '/hooks/send-sms', payload: body, headers: signed(body) });
    expect(r.statusCode).toBe(200);
    expect(spy).toHaveBeenCalledWith('233241234567', "Your Paa Jim code is 482913. It expires in 5 minutes. Don't share it.");
    spy.mockRestore();
  });

  it('sends a phone-change code to the NEW number', async () => {
    const spy = vi.spyOn(Notifier.prototype, 'sms').mockResolvedValue();
    const app = await hookApp();
    const body = JSON.stringify({ user: { phone: '233241234567', new_phone: '233559876543' }, sms: { otp: '111222' } });
    await app.inject({ method: 'POST', url: '/hooks/send-sms', payload: body, headers: signed(body) });
    expect(spy).toHaveBeenCalledWith('233559876543', expect.any(String));
    spy.mockRestore();
  });

  it('refuses non-Ghana numbers', async () => {
    const app = await hookApp();
    const body = JSON.stringify({ user: { phone: '14155550100' }, sms: { otp: '123456' } });
    expect((await app.inject({ method: 'POST', url: '/hooks/send-sms', payload: body, headers: signed(body) })).statusCode).toBe(400);
  });
});
