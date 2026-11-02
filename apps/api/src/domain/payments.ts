import type { SupabaseClient } from '@supabase/supabase-js';
import { Paystack } from '../lib/paystack.js';

export type ApplyOutcome =
  | { kind: 'paid'; orderId: string }
  | { kind: 'failed'; orderId: string }
  | { kind: 'late_success_refunded'; orderId: string }
  | { kind: 'still_pending' }
  | { kind: 'already_applied' }
  | { kind: 'amount_mismatch'; orderId: string }
  | { kind: 'unknown_reference' };

/**
 * The single place a Paystack result changes our state. Called by the webhook
 * worker, the 2-minute reconciliation sweep and admin re-verify, so all three
 * paths behave identically. Always re-verifies against Paystack: the webhook
 * body is a hint, never the source of truth.
 */
export async function applyPaymentResult(
  db: SupabaseClient,
  paystack: Paystack,
  reference: string,
): Promise<ApplyOutcome> {
  const { data: payment } = await db
    .from('payments')
    .select('id, order_id, amount, status, network, phone')
    .eq('reference', reference)
    .maybeSingle();
  if (!payment) return { kind: 'unknown_reference' };
  if (payment.status === 'success' || payment.status === 'failed') return { kind: 'already_applied' };

  const v = await paystack.verify(reference);

  if (v.status === 'success') {
    // Amount from our DB, compared in pesewas — never trust the request.
    if (v.amount !== Paystack.toPesewas(String(payment.amount)) || v.currency !== 'GHS') {
      await db.from('payments').update({ gateway_response: `amount mismatch: ${v.amount} ${v.currency}` }).eq('id', payment.id);
      return { kind: 'amount_mismatch', orderId: payment.order_id };
    }

    // Compare-and-set on status so concurrent webhook + reconcile apply once.
    const { data: won } = await db
      .from('payments')
      .update({ status: 'success', verified_at: new Date().toISOString(), gateway_response: v.gateway_response ?? null })
      .eq('id', payment.id)
      .eq('status', 'pending')
      .select('id');
    if (!won?.length) return { kind: 'already_applied' };

    const { data: moved } = await db
      .from('orders')
      .update({ status: 'paid', momo_network: payment.network, momo_last4: String(payment.phone).slice(-4) })
      .eq('id', payment.order_id)
      .eq('status', 'pending_payment')
      .select('id');

    if (!moved?.length) {
      // Money arrived for an order we already gave up on (abandoned/cancelled).
      await db.from('refunds').upsert(
        { order_id: payment.order_id, payment_id: payment.id, amount: payment.amount, reason: 'Payment arrived after the order was closed' },
        { onConflict: 'payment_id', ignoreDuplicates: true },
      );
      return { kind: 'late_success_refunded', orderId: payment.order_id };
    }
    return { kind: 'paid', orderId: payment.order_id };
  }

  if (v.status === 'failed' || v.status === 'abandoned' || v.status === 'reversed') {
    const { data: won } = await db
      .from('payments')
      .update({ status: v.status === 'abandoned' ? 'abandoned' : 'failed', verified_at: new Date().toISOString(), gateway_response: v.gateway_response ?? null })
      .eq('id', payment.id)
      .eq('status', 'pending')
      .select('id');
    if (!won?.length) return { kind: 'already_applied' };
    // The order stays pending_payment so the customer can retry with another
    // wallet. The abandon sweep closes it as payment_failed after 30 min.
    return { kind: 'failed', orderId: payment.order_id };
  }

  return { kind: 'still_pending' };
}
