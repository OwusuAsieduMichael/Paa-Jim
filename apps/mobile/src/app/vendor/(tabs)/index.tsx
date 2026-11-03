import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { Banner, Button, Empty, Loading } from '@/components/ui';
import { VendorHeader, StatTile } from '@/components/VendorHeader';
import { ReasonSheet } from '@/components/ReasonSheet';
import { color } from '@/theme';
import { ghs } from '@/lib/money';
import { itemsShort, minutesSince, mmss, spaced6 } from '@/lib/format';
import { useKitchen, useLoad, useNow } from '@/hooks/data';
import { startInAppAlarm } from '@/features/notifications';
import { backend, type Order } from '@/backend';

const AUTO_CANCEL_MS = 8 * 60_000;
const REJECT_REASONS = ['Out of stock', 'Kitchen too busy', 'Closing soon', 'Can’t deliver there'];

// 18 · Vendor queue
export default function VendorQueue() {
  const now = useNow(1000);
  const kitchen = useKitchen();
  const q = useLoad(() => backend.vendorQueue());
  const [open, setOpen] = useState<boolean | null>(null);
  const [rejecting, setRejecting] = useState<Order | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { reload } = q;

  useEffect(() => backend.subscribeVendorQueue(() => void reload()), [reload]);
  useEffect(() => { if (kitchen.data) setOpen(kitchen.data.isOpen); }, [kitchen.data]);

  const orders = q.data ?? [];
  const fresh = orders.filter((o) => o.status === 'paid');
  const cooking = orders.filter((o) => o.status === 'accepted');
  const ready = orders.filter((o) => o.status === 'ready_for_pickup');
  const out = orders.filter((o) => ['en_route', 'arrived', 'delivery_failed'].includes(o.status));
  const kitchenList = [...ready, ...cooking, ...out];

  // Keep buzzing while anything is waiting to be accepted.
  const alarmFor = fresh.map((o) => o.id).join(',');
  const stopAlarm = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (alarmFor) stopAlarm.current = startInAppAlarm();
    return () => { stopAlarm.current?.(); stopAlarm.current = null; };
  }, [alarmFor]);

  // Pickup IDs for "Ready" rows (only vendor staff can read them).
  const readyIds = ready.map((o) => o.id).join(',');
  const pickups = useLoad(async () => {
    const entries = await Promise.all(ready.map(async (o) => [o.id, await backend.pickupCode(o.id)] as const));
    return Object.fromEntries(entries);
  }, [readyIds]);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    try { await backend.setKitchenOpen(next); void kitchen.reload(); }
    catch (e) { setOpen(!next); Alert.alert('Could not update', (e as Error).message); }
  }

  async function accept(o: Order) {
    setBusyId(o.id);
    setError(null);
    try {
      await backend.accept(o.id);
      router.push(`/vendor/order/${o.id}`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusyId(null); void reload(); }
  }

  const row = (o: Order) => {
    const st = o.status;
    const meta = st === 'ready_for_pickup'
      ? { label: `Ready · ${pickups.data?.[o.id] ? spaced6(pickups.data[o.id]!.pickupId) : '…'}`, fg: color.successText, dot: color.success }
      : st === 'accepted'
        ? { label: `Cooking · ${minutesSince(o.acceptedAt, now)} min`, fg: color.warningInk, dot: color.warning }
        : st === 'delivery_failed'
          ? { label: 'Needs you', fg: color.primaryText, dot: color.primary }
          : { label: st === 'arrived' ? 'At the door' : 'With rider', fg: color.inkMuted, dot: color.ringIdle };
    return (
      <Pressable key={o.id} onPress={() => router.push(`/vendor/order/${o.id}`)} accessibilityRole="button" accessibilityLabel={`${o.orderNo}, ${meta.label}`}
        style={{ backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: meta.dot }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text size={15} weight={700}>#{o.orderNo}</Text>
          <Text size={12} tone={color.inkMuted} numberOfLines={1}>{itemsShort(o)}</Text>
        </View>
        <Text size={12} weight={700} tone={meta.fg}>{meta.label}</Text>
      </Pressable>
    );
  };

  const counts = useMemo(() => ({ fresh: fresh.length, cooking: cooking.length, ready: ready.length }), [fresh.length, cooking.length, ready.length]);
  if (q.loading && !q.data) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <VendorHeader
        eyebrow="Vendor"
        title={kitchen.data?.vendorName ?? 'Paa Jim’s Kitchen'}
        right={
          <Pressable onPress={toggleOpen} accessibilityRole="switch" accessibilityState={{ checked: Boolean(open) }} accessibilityLabel="Kitchen open"
            style={{ height: 40, paddingLeft: 12, paddingRight: 6, borderRadius: 20, backgroundColor: open ? color.success : color.inkMuted, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text size={13} weight={700} tone="#FFFFFF">{open ? 'Open' : 'Paused'}</Text>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFFFFF' }} />
          </Pressable>
        }
      >
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatTile value={counts.fresh} label="New" accent={counts.fresh ? '#FF8A8F' : undefined} />
          <StatTile value={counts.cooking} label="Cooking" />
          <StatTile value={counts.ready} label="Awaiting rider" />
        </View>
      </VendorHeader>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }} refreshControl={<RefreshControl refreshing={q.loading} onRefresh={reload} tintColor={color.primary} />}>
        {error && <Banner tone="error" icon="alert">{error}</Banner>}
        {kitchen.data && !kitchen.data.accepting && open && <Banner tone="warning" icon="info">{`Customers can’t order right now: ${kitchen.data.reason}`}</Banner>}

        {fresh.length > 0 && <Text size={13} weight={800} ls={0.06} tone={color.primaryText}>{fresh.length > 1 ? `NEW ORDERS (${fresh.length})` : 'NEW ORDER'}</Text>}
        {fresh.map((o) => {
          const left = AUTO_CANCEL_MS - (now - new Date(o.paidAt ?? o.createdAt).getTime());
          return (
            <View key={o.id} style={{ backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 2, borderColor: color.primary, padding: 16, gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text size={17} weight={800}>#{o.orderNo}</Text>
                <View style={{ height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: color.primaryTint, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Icon name="clock" size={14} color={color.primaryText} />
                  <Text size={12} weight={700} tone={color.primaryText}>{left > 0 ? `Auto-cancel in ${mmss(left)}` : 'Cancelling…'}</Text>
                </View>
              </View>
              <View style={{ gap: 4 }}>
                {o.items.map((i, n) => (
                  <Text key={n} size={14}><Text size={14} weight={800}>{i.qty}×</Text> {i.name}{i.note ? <Text size={12} tone={color.inkMuted}>  · {i.note}</Text> : null}</Text>
                ))}
                {o.riderNote && <Text size={12} tone={color.inkMuted}>Note: {o.riderNote}</Text>}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text size={13} tone={color.inkMuted}>Paid · MoMo</Text>
                <Text size={13} tone={color.inkMuted}>{o.distanceKm} km · {ghs(o.total)}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Reject" variant="outline" height={50} size={15} onPress={() => setRejecting(o)} style={{ flex: 1 }} />
                <Button title="Accept order" height={50} size={15} loading={busyId === o.id} onPress={() => accept(o)} style={{ flex: 2 }} />
              </View>
            </View>
          );
        })}

        <Text size={13} weight={800} ls={0.06} tone={color.inkMuted} style={{ marginTop: fresh.length ? 6 : 0 }}>IN THE KITCHEN</Text>
        {kitchenList.length ? kitchenList.map(row) : (
          fresh.length === 0 ? <Empty title="No orders right now" body={open ? 'New orders ring this tablet — even with the screen off.' : 'The kitchen is paused. Tap Open when you’re ready.'} /> : null
        )}
      </ScrollView>

      <ReasonSheet
        visible={Boolean(rejecting)}
        title={`Reject #${rejecting?.orderNo ?? ''}?`}
        presets={REJECT_REASONS}
        confirm="Reject & refund"
        onCancel={() => setRejecting(null)}
        onSubmit={async (reason) => {
          try { await backend.reject(rejecting!.id, reason); setRejecting(null); void reload(); }
          catch (e) { Alert.alert('Could not reject', (e as Error).message); }
        }}
      />
    </View>
  );
}
