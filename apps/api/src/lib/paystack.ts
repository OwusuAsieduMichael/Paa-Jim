import { createHmac, timingSafeEqual } from 'node:crypto';

// Paystack Ghana mobile money. Provider codes: mtn, vod (Telecel Cash — the
// code did NOT change with the rebrand; "tlc" will 400), atl.
export type MomoProvider = 'mtn' | 'vod' | 'atl';

export interface ChargeResult {
  status: 'pay_offline' | 'send_otp' | 'success' | 'failed' | 'pending' | string;
  reference: string;
  display_text?: string;
  gateway_response?: string;
}

export interface VerifyResult {
  status: 'success' | 'failed' | 'abandoned' | 'ongoing' | 'pending' | 'processing' | 'reversed' | string;
  reference: string;
  amount: number; // pesewas
  currency: string;
  gateway_response?: string;
}

export class PaystackError extends Error {
  constructor(message: string, public httpStatus: number, public body?: unknown) {
    super(message);
  }
}

const BASE = 'https://api.paystack.co';

export class Paystack {
  constructor(private secretKey: string, private fetchImpl: typeof fetch = fetch) {}

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.secretKey}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
    if (!res.ok || json.status === false) {
      throw new PaystackError(json.message ?? `Paystack ${res.status}`, res.status, json);
    }
    return json.data as T;
  }

  /** Amount in GHS (string from numeric(10,2)) → pesewas, without float maths. */
  static toPesewas(amount: string): number {
    const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
    if (!m) throw new Error(`Bad amount: ${amount}`);
    return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
  }

  chargeMomo(input: {
    email: string;
    amount: string;
    phone: string; // 0XXXXXXXXX
    provider: MomoProvider;
    reference: string;
    metadata?: Record<string, unknown>;
  }): Promise<ChargeResult> {
    return this.call<ChargeResult>('POST', '/charge', {
      email: input.email,
      amount: Paystack.toPesewas(input.amount),
      currency: 'GHS',
      reference: input.reference,
      mobile_money: { phone: input.phone, provider: input.provider },
      metadata: input.metadata,
    });
  }

  submitOtp(reference: string, otp: string): Promise<ChargeResult> {
    return this.call<ChargeResult>('POST', '/charge/submit_otp', { reference, otp });
  }

  verify(reference: string): Promise<VerifyResult> {
    return this.call<VerifyResult>('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
  }

  refund(reference: string, amount: string): Promise<{ status: string; id?: number }> {
    return this.call('POST', '/refund', { transaction: reference, amount: Paystack.toPesewas(amount) });
  }

  /** x-paystack-signature is HMAC-SHA512 of the raw body with the secret key. */
  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

/** +233241234567 / 233241234567 / 0241234567 → 0241234567 (Paystack's MoMo format). */
export function toLocalGhanaPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('233') && digits.length === 12) return '0' + digits.slice(3);
  if (digits.startsWith('0') && digits.length === 10) return digits;
  if (digits.length === 9) return '0' + digits;
  throw new Error('Enter a valid Ghana mobile number');
}
