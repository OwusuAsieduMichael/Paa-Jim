import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { BackButton, Banner, Button, Card, Divider, Empty, Loading } from '@/components/ui';
import { CheckoutSteps } from '@/components/Steps';
import { color, font } from '@/theme';
import { add, ghs, times, toPesewas } from '@/lib/money';
import { useLoad } from '@/hooks/data';
import { useCart, cartCount, cartSubtotal } from '@/stores/cart';
import { backend, type Order } from '@/backend';

// 11 · Checkout — Handbook §2.4:
//   client uuid = idempotency key → create_order() computes prices & fee →
//   show the SERVER total; if it differs from what the cart showed, re-render.
export default function Checkout() {
  const insets = useSafeAreaInsets();
  const { lines, pendingOrderId, setPendingOrderId } = useCart();
  const addresses = useLoad(() => backend.addresses(), [], { refetchOnFocus: true });
  const address = addresses.data?.find((a) => a.isDefault) ?? addresses.data?.[0];
  const quote = useLoad(() => (address ? backend.quoteDelivery(address.id) : Promise.resolve(null)), [address?.id]);
  const [note, setNote] = useState('');
  const [placed, setPlaced] = useState<Order | null>(null);
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estSubtotal = cartSubtotal(lines);
  const estFee = quote.data?.fee ? toPesewas(quote.data.fee) : null;
  const estTotal = estFee != null ? add(estSubtotal, estFee) : null;

  async function placeOrder() {
    if (!address) return router.push('/profile-setup?mode=address');
    setBusy(true);
    setError(null);
    try {
      const orderId = pendingOrderId ?? Crypto.randomUUID();
      setPendingOrderId(orderId);
      const order = await backend.createOrder({ orderId, addressId: address.id, lines: lines.map((l) => ({ menuItemId: l.menuItemId, qty: l.qty, note: l.note })), riderNote: note.trim() || undefined });
      if (estTotal == null || toPesewas(order.total) !== estTotal) {
        // Prices or fee changed since the cart was built. Show the server's numbers first.
        setPlaced(order);
        setChanged(true);
        return;
      }
      router.push(`/customer/payment/${order.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (addresses.loading && !addresses.data) return <Loading />;
  // Not a redirect: this screen stays mounted under Payment, and the cart is
  // cleared on success — a redirect here would replace the confirmation.
  if (lines.length === 0 && !placed) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', paddingTop: insets.top + 12, paddingHorizontal: 20 }}>
        <BackButton />
        <Empty title="Your cart is empty" action="Browse the menu" onAction={() => router.replace('/customer/menu')} />
      </View>
    );
  }

  const summary = placed
    ? placed.items.map((i) => ({ key: i.name, label: `${i.qty}× ${i.name}`, amount: i.lineTotal }))
    : lines.map((l) => ({ key: l.key, label: `${l.qty}× ${l.name}`, amount: ghs(times(toPesewas(l.unitPrice), l.qty), { bare: true }) }));
  const subtotal = placed ? ghs(placed.subtotal) : ghs(estSubtotal);
  const fee = placed ? ghs(placed.deliveryFee) : quote.data?.fee ? ghs(quote.data.fee) : '—';
  const total = placed ? ghs(placed.total) : estTotal != null ? ghs(estTotal) : '—';
  const count = placed ? placed.items.reduce((s, i) => s + i.qty, 0) : cartCount(lines);
  const undeliverable = quote.data && !quote.data.deliverable;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.canvas }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 16, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <BackButton />
          <Text size={22} weight={800} accessibilityRole="header">Checkout</Text>
        </View>
        <CheckoutSteps at={1} />
      </View>

      <ScrollView contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 16, gap: 12, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text size={15} weight={800}>Deliver to</Text>
            <Pressable onPress={() => { setPlaced(null); router.push('/profile-setup?mode=address'); }} hitSlop={10}>
              <Text size={13} weight={700} tone={color.primary}>{address ? 'Change' : 'Add'}</Text>
            </Pressable>
          </View>
          {address ? (
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: color.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="pin" size={18} color={color.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text size={14} weight={700}>{address.label} · {address.gpsCode}</Text>
                <Text size={13} tone={color.inkMuted}>
                  {[address.landmark, quote.data ? `${quote.data.distanceKm} km away` : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
          ) : (
            <Text size={13} tone={color.inkMuted}>Add where we should deliver.</Text>
          )}
          <Text size={12} weight={700} tone={color.inkMuted} nativeID="noteLabel">Note for the rider</Text>
          <TextInput
            accessibilityLabelledBy="noteLabel"
            value={note}
            onChangeText={(t) => { setNote(t); setPlaced(null); setChanged(false); }}
            placeholder="e.g. Call when you reach the junction"
            placeholderTextColor="#9A928E"
            maxLength={200}
            style={{ height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: color.border, paddingHorizontal: 14, fontFamily: font[400], fontSize: 14, color: color.ink, marginTop: -6 }}
          />
        </Card>

        <Card style={{ gap: 10 }}>
          <Text size={15} weight={800}>Order summary ({count} {count === 1 ? 'item' : 'items'})</Text>
          {summary.map((s) => (
            <View key={s.key} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
              <Text size={14} style={{ flex: 1 }}>{s.label}</Text>
              <Text size={14} weight={600}>{s.amount}</Text>
            </View>
          ))}
          <Divider />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text size={14} tone={color.inkMuted}>Subtotal</Text><Text size={14} tone={color.inkMuted}>{subtotal}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text size={14} tone={color.inkMuted}>Delivery{quote.data?.band ? ` (${quote.data.band} band)` : ''}</Text><Text size={14} tone={color.inkMuted}>{fee}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text size={17} weight={800}>Total</Text><Text size={17} weight={800} tone={color.primary}>{total}</Text>
          </View>
        </Card>

        {changed && placed && <Banner tone="warning" icon="info">Prices were updated by the kitchen. Please check the new total before paying.</Banner>}
        {undeliverable && <Banner tone="error" icon="alert">{`That address is ${quote.data!.distanceKm} km away — outside our delivery area.`}</Banner>}
        {error && <Banner tone="error" icon="alert">{error}</Banner>}

        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 4 }}>
          <Icon name="info" size={16} color={color.inkMuted} />
          <Text size={12} lh={1.5} tone={color.inkMuted} style={{ flex: 1 }}>
            Prices are confirmed by the kitchen when you place the order. If the kitchen can’t accept within 8 minutes, you’re refunded automatically.
          </Text>
        </View>
      </ScrollView>

      <View style={{ backgroundColor: '#FFFFFF', paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 20, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View>
          <Text size={12} tone={color.inkMuted}>Total</Text>
          <Text size={20} weight={800}>{total}</Text>
        </View>
        <Button
          title={placed && changed ? 'Pay new total' : 'Continue to pay'}
          loading={busy}
          disabled={!address || Boolean(undeliverable)}
          onPress={() => (placed && changed ? router.push(`/customer/payment/${placed.id}`) : placeOrder())}
          style={{ flex: 1 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
