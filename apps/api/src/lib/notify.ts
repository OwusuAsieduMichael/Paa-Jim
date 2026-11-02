import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../env.js';

// Push payloads never carry order contents, addresses or codes (Handbook §7.1).
// They carry an order id and a short generic line; the app fetches the rest.
export interface PushMessage {
  title: string;
  body: string;
  orderId?: string;
  /** 'orders' = the loud vendor alarm channel; 'status' = normal customer updates */
  channel: 'orders' | 'status';
}

const STALE_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export class Notifier {
  private app: App | null = null;

  constructor(private env: Env, private db: SupabaseClient, private log: FastifyBaseLogger) {
    if (env.FCM_SERVICE_ACCOUNT_JSON) {
      this.app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON)) });
    } else {
      log.warn('FCM_SERVICE_ACCOUNT_JSON not set — push notifications are logged, not sent');
    }
  }

  async pushToUsers(userIds: string[], msg: PushMessage): Promise<{ sent: number; pruned: number }> {
    if (userIds.length === 0) return { sent: 0, pruned: 0 };
    const { data: rows } = await this.db.from('device_tokens').select('token').in('user_id', userIds);
    const tokens = (rows ?? []).map((r) => r.token as string);
    if (tokens.length === 0) return { sent: 0, pruned: 0 };
    if (!this.app) {
      this.log.info({ userIds, msg }, 'push (dry run)');
      return { sent: 0, pruned: 0 };
    }

    const res = await getMessaging(this.app).sendEachForMulticast({
      tokens,
      notification: { title: msg.title, body: msg.body },
      data: { orderId: msg.orderId ?? '', channel: msg.channel },
      android: {
        priority: 'high',
        notification: {
          channelId: msg.channel,
          sound: msg.channel === 'orders' ? 'order_alarm' : 'default',
          // The vendor alarm must wake a locked, screen-off tablet.
          ...(msg.channel === 'orders' ? { visibility: 'public' as const, defaultVibrateTimings: true } : {}),
        },
      },
      apns: { payload: { aps: { sound: msg.channel === 'orders' ? 'order_alarm.wav' : 'default' } } },
    });

    const stale: string[] = [];
    res.responses.forEach((r, i) => {
      if (!r.success && r.error && STALE_CODES.has(r.error.code)) stale.push(tokens[i]!);
    });
    if (stale.length) await this.db.from('device_tokens').delete().in('token', stale);
    return { sent: res.successCount, pruned: stale.length };
  }

  async pushToRole(role: 'vendor_staff' | 'rider' | 'admin', msg: PushMessage) {
    const { data } = await this.db.from('profiles').select('id').eq('role', role).eq('is_active', true);
    return this.pushToUsers((data ?? []).map((r) => r.id as string), msg);
  }

  /** SMS via a Ghana-local provider (Arkesel). Supabase does not send SMS itself. */
  async sms(to: string, message: string): Promise<void> {
    const recipient = to.replace(/\D/g, '');
    if (this.env.SMS_PROVIDER === 'log' || !this.env.SMS_API_KEY) {
      this.log.info({ to: recipient.replace(/\d(?=\d{4})/g, '•'), message }, 'sms (dry run)');
      return;
    }
    const res = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
      method: 'POST',
      headers: { 'api-key': this.env.SMS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: this.env.SMS_SENDER_ID, message, recipients: [recipient] }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`SMS provider ${res.status}: ${await res.text().catch(() => '')}`);
  }
}
