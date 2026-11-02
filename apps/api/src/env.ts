import { z } from 'zod';

// Handbook §2.10 — Railway secrets, never public.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  PAYSTACK_SECRET_KEY: z.string().startsWith('sk_'),
  // Comma-separated. Paystack's published webhook source IPs.
  PAYSTACK_WEBHOOK_IPS: z.string().default('52.31.139.75,52.49.173.169,52.214.14.220'),
  // Used as the customer email Paystack requires; MoMo customers have none.
  PAYSTACK_EMAIL_DOMAIN: z.string().default('customers.paajim.app'),

  REDIS_URL: z.string().optional(),
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),

  SMS_PROVIDER: z.enum(['arkesel', 'log']).default('log'),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().max(11).default('PaaJim'),
  KITCHEN_ALERT_PHONE: z.string().optional(),
  // Supabase "Send SMS" auth hook secret (v1,whsec_...)
  SEND_SMS_HOOK_SECRET: z.string().optional(),

  SENTRY_DSN: z.string().optional(),

  AUTO_CANCEL_MINUTES: z.coerce.number().default(8),
  VENDOR_WARN_MINUTES: z.coerce.number().default(5),
  VENDOR_ALERT_ESCALATE_MINUTES: z.coerce.number().default(5),
  RECONCILE_AFTER_SECONDS: z.coerce.number().default(90),
  ABANDON_PAYMENT_MINUTES: z.coerce.number().default(30),
  // Behind Railway's proxy the client IP is in X-Forwarded-For.
  TRUST_PROXY: z.coerce.boolean().default(true),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.PAYSTACK_SECRET_KEY.startsWith('sk_test_')) {
    throw new Error('Refusing to start: test Paystack key in production');
  }
  return parsed.data;
}
