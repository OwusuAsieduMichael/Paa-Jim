import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { BackButton, Banner, Button, Loading } from '@/components/ui';
import { ReasonSheet } from '@/components/ReasonSheet';
import { color } from '@/theme';
import { ghs } from '@/lib/money';
import { clock, minutesSince, spaced6 } from '@/lib/format';
import { firstNameInitial } from '@/lib/phone';
import { SUPPORT_PHONE } from '@/lib/config';
import { useLoad, useNow, useOrder } from '@/hooks/data';
import { backend } from '@/backend';

const BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  paid: { label: 'NEW', bg: color.primary, fg: '#FFFFFF' },
  accepted: { label: 'COOKING', bg: color.warning, fg: color.ink },
  ready_for_pickup: { label: 'READY', bg: color.success, fg: '#FFFFFF' },
  en_route: { label: 'WITH RIDER', bg: color.ink2, fg: '#FFFFFF' },
  arrived: { label: 'AT THE DOOR', bg: color.ink2, fg: '#FFFFFF' },
  delivery_failed: { label: 'PROBLEM', bg: color.primary, fg: '#FFFFFF' },
  delivered: { label: 'DELIVERED', bg: color.success, fg: '#FFFFFF' },
  rejected: { label: 'REJECTED', bg: color.inkMuted, fg: '#FFFFFF' },
  cancelled: { label: 'CANCELLED', bg: color.inkMuted, fg: '#FFFFFF' },
};

// 19 · Vendor order detail
export default function VendorOrder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const now = useNow(15_000);
  const { data: o, reload } = useOrder(id);
  const pickup = useLoad(() => backend.pickupCode(id!), [id, o?.status]);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [forcing, setForcing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (o) setChecked((c) => (Object.keys(c).length ? c : Object.fromEntries(o.items.map((_, i) => [i, false])))); }, [o]);

  if (!o) return <Loading />;
  const badge = BADGE[o.status] ?? { label: o.status.toUpperCase(), bg: color.inkMuted, fg: '#FFFFFF' };
  const cookingMin = minutesSince(o.acceptedAt, now);
  const allChecked = o.items.every((_, i) => checked[i]);
  const expiresIn = pickup.data ? Math.max(0, Math.round((new Date(pickup.data.expiresAt).getTime() - now) / 60_000)) : 0;

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); await reload(); void pickup.reload(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <StatusBar style="light" />
      <View style={{ backgroundColor: color.ink, paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <BackButton bg={color.ink2} fg="#FFFFFF" />
        <View style={{ flex: 1 }}>
          <Text size={20} weight={800} tone="#FFFFFF">#{o.orderNo}</Text>
          <Text size={12} tone="rgba(255,255,255,0.8)">
            {o.acceptedAt ? `Accepted ${clock(o.acceptedAt)}` : `Paid ${clock(o.paidAt)}`} · {firstNameInitial(o.customerName) || 'Customer'}
          </Text>
        </View>
        <View style={{ height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: badge.bg, justifyContent: 'center' }}>
          <Text size={12} weight={800} tone={badge.fg}>{badge.label}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 4 }}>
          <Text size={13} weight={800} ls={0.06} tone={color.inkMuted} style={{ marginBottom: 6 }}>ITEMS TO PREPARE</Text>
          {o.items.map((it, i) => (
            <Pressable key={i} onPress={() => setChecked((c) => ({ ...c, [i]: !c[i] }))} accessibilityRole="checkbox" accessibilityState={{ checked: Boolean(checked[i]) }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
              <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: checked[i] ? color.primary : color.ringIdle, backgroundColor: checked[i] ? color.primary : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                {checked[i] && <Icon name="check" size={16} color="#FFFFFF" strokeWidth={3} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text size={16} weight={600} tone={checked[i] ? color.inkMuted : color.ink}><Text size={16} weight={800}>{it.qty}×</Text> {it.name}</Text>
                {it.note ? <Text size={12} weight={500} tone={color.inkMuted}>{it.note}</Text> : null}
              </View>
            </Pressable>
          ))}
          {o.riderNote && <Text size={13} tone={color.inkMuted} style={{ marginTop: 6 }}>Customer note: {o.riderNote}</Text>}
        </View>

        {o.status === 'accepted' && (
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text size={14} tone={color.inkMuted}>Cooking for</Text>
              <Text size={14} weight={800}>{cookingMin} min</Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: '#F2E6E6', overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(100, (cookingMin / 20) * 100)}%`, height: 8, backgroundColor: color.warning }} />
            </View>
            <Text size={13} lh={1.5} tone={color.inkMuted}>When the food is packed, tap <Text size={13} weight={700}>Mark ready</Text>. You’ll get a 6-digit Pickup ID to read out to a rider.</Text>
          </View>
        )}

        {o.status === 'ready_for_pickup' && pickup.data && (
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 2, borderColor: color.success, paddingVertical: 18, paddingHorizontal: 16, alignItems: 'center', gap: 8 }}>
            <Text size={12} weight={800} ls={0.08} tone={color.successText}>PICKUP ID</Text>
            <Text size={44} weight={800} ls={0.12} accessibilityLabel={`Pickup ID ${pickup.data.pickupId.split('').join(' ')}`}>{spaced6(pickup.data.pickupId)}</Text>
            <Text size={13} lh={1.5} tone={color.inkMuted} align="center">
              Say this out loud to the rider collecting the bag.{'\n'}Expires in {expiresIn} min · only you can see it.
            </Text>
          </View>
        )}

        {(o.status === 'en_route' || o.status === 'arrived') && (
          <Banner tone="success" icon="bike">{`${o.riderName ?? 'Rider'} has it — ${o.status === 'arrived' ? 'at the customer’s door' : 'on the way'}.`}</Banner>
        )}
        {o.status === 'delivery_failed' && <Banner tone="error" icon="alert">{`Rider reported a problem: ${o.failureReason ?? 'no reason given'}. Call the customer, then force-complete if they got the food.`}</Banner>}
        {o.verifyAttempts >= 5 && o.status !== 'delivered' && <Banner tone="error" icon="lock">Delivery code locked after 5 wrong tries. Confirm with the customer, then force-complete.</Banner>}

        <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text size={13} tone={color.inkMuted} style={{ flex: 1 }}>Deliver to {o.gpsCode} · {o.distanceKm} km</Text>
          <Text size={13} weight={800}>{ghs(o.total)} · Paid</Text>
        </View>
        {error && <Banner tone="error" icon="alert">{error}</Banner>}
      </ScrollView>

      <View style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: insets.bottom + 16, gap: 10 }}>
        {o.status === 'paid' && <Button title="Accept order" height={60} size={17} weight={800} loading={busy} onPress={() => act(() => backend.accept(o.id))} />}
        {o.status === 'accepted' && (
          <Button title={allChecked ? 'Mark ready for pickup' : 'Mark ready for pickup'} height={60} size={17} weight={800} loading={busy}
            onPress={() => (allChecked ? act(() => backend.markReady(o.id)) : Alert.alert('Everything packed?', 'Not every item is ticked.', [{ text: 'Check again', style: 'cancel' }, { text: 'Mark ready', onPress: () => void act(() => backend.markReady(o.id)) }]))} />
        )}
        {o.status === 'ready_for_pickup' && <Button title="Waiting for a rider to claim…" variant="outline" height={52} size={15} disabled />}
        {['en_route', 'arrived', 'delivery_failed'].includes(o.status) && (
          <Button title="Force-complete delivery" variant="dark" height={52} size={15} onPress={() => setForcing(true)} />
        )}
        <Button title="Problem with this order? Call admin" variant="ghost" height={44} size={13} onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)} />
      </View>

      <ReasonSheet
        visible={forcing}
        title="Force-complete this delivery?"
        presets={['Customer confirmed by phone', 'Code locked, food handed over', 'Rider app offline, food delivered']}
        confirm="Mark delivered"
        minLength={10}
        onCancel={() => setForcing(false)}
        onSubmit={async (reason) => { await act(() => backend.forceComplete(o.id, reason)); setForcing(false); }}
      />
    </View>
  );
}
