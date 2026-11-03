import { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { Empty, Loading, Pill } from '@/components/ui';
import { color } from '@/theme';
import { ghs } from '@/lib/money';
import { clock, dayStamp, itemsSummary, STATUS_LABEL, statusTone } from '@/lib/format';
import { useLoad } from '@/hooks/data';
import { useCart } from '@/stores/cart';
import { backend, ACTIVE_STATUSES, type Order } from '@/backend';

type Tab = 'All' | 'Active' | 'Past';

// 16 · My orders
export default function Orders() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('All');
  const q = useLoad(() => backend.myOrders(), [], { refetchOnFocus: true });
  const { data: menu } = useLoad(() => backend.menu());
  const add = useCart((s) => s.add);

  // Live: refresh the list when any of my active orders changes.
  const activeIds = (q.data ?? []).filter((o) => ACTIVE_STATUSES.includes(o.status)).map((o) => o.id).join(',');
  const { reload } = q;
  useEffect(() => {
    if (!activeIds) return;
    const offs = activeIds.split(',').map((id) => backend.subscribeOrder(id, () => void reload()));
    return () => offs.forEach((f) => f());
  }, [activeIds, reload]);

  const all = q.data ?? [];
  const list = all.filter((o) => (tab === 'All' ? true : tab === 'Active' ? ACTIVE_STATUSES.includes(o.status) : !ACTIVE_STATUSES.includes(o.status)));

  function reorder(o: Order) {
    for (const line of o.items) {
      const it = menu?.items.find((m) => m.name === line.name && m.isAvailable);
      if (it) add(it, line.qty);
    }
    router.push('/customer/cart');
  }

  const card = ({ item: o }: { item: Order }) => {
    const active = ACTIVE_STATUSES.includes(o.status);
    const tint = menu?.items.find((m) => m.name === o.items[0]?.name)?.tint ?? '#F9DCCB';
    if (active) {
      return (
        <Pressable onPress={() => router.push(`/customer/order/${o.id}/track`)} style={{ gap: 12, padding: 16, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: color.primary }} accessibilityRole="button" accessibilityLabel={`${STATUS_LABEL[o.status]}, order ${o.orderNo}, track live`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Pill bg={color.primaryTint} fg={color.primaryText} dot={color.primary} height={26}>{STATUS_LABEL[o.status]}</Pill>
            <Text size={13} weight={700}>#{o.orderNo}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: tint }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text size={14} weight={700}>{itemsSummary(o)}</Text>
              <Text size={12} tone={color.inkMuted}>Placed {clock(o.paidAt ?? o.createdAt)}</Text>
            </View>
            <Text size={15} weight={800}>{ghs(o.total, { short: true })}</Text>
          </View>
          <View style={{ height: 44, borderRadius: 12, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text size={14} weight={700} tone="#FFFFFF">Track live</Text>
          </View>
        </Pressable>
      );
    }
    const tone = statusTone(o.status);
    const refunded = o.status === 'rejected' || o.status === 'cancelled';
    return (
      <View style={{ gap: 12, padding: 16, borderRadius: 18, backgroundColor: '#FFFFFF' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text size={12} weight={600} tone={color.inkMuted}>{dayStamp(o.createdAt)}</Text>
          <Text size={12} weight={700} tone={tone.fg}>{STATUS_LABEL[o.status]}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: tint }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text size={14} weight={700}>{itemsSummary(o)}</Text>
            <Text size={12} tone={color.inkMuted}>#{o.orderNo} · {refunded ? o.rejectReason ?? o.cancelReason ?? 'Refunded to your wallet' : o.rated ? 'Thanks for rating' : 'Not rated yet'}</Text>
          </View>
          <Text size={15} weight={800}>{ghs(o.total, { short: true })}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={() => router.push(o.status === 'delivered' && !o.rated ? `/customer/order/${o.id}/rate` : `/customer/order/${o.id}/track`)}
            style={{ flex: 1, height: 42, borderRadius: 12, borderWidth: 1.5, borderColor: color.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text size={13} weight={700}>{refunded ? 'Refund details' : o.status === 'delivered' && !o.rated ? 'Rate order' : 'View receipt'}</Text>
          </Pressable>
          <Pressable onPress={() => reorder(o)} style={{ flex: 1, height: 42, borderRadius: 12, backgroundColor: color.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
            <Text size={13} weight={700} tone={color.primaryText}>Reorder</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <View style={{ backgroundColor: '#FFFFFF', paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 14, gap: 14 }}>
        <Text size={26} weight={800} accessibilityRole="header">My orders</Text>
        <View style={{ flexDirection: 'row', gap: 8, padding: 4, borderRadius: 14, backgroundColor: color.canvas }} accessibilityRole="tablist">
          {(['All', 'Active', 'Past'] as Tab[]).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: t === tab }}
              style={{ flex: 1, height: 40, borderRadius: 11, backgroundColor: t === tab ? color.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              <Text size={13} weight={700} tone={t === tab ? '#FFFFFF' : color.inkMuted}>{t}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {q.loading && !q.data ? <Loading /> : (
        <FlatList
          data={list}
          keyExtractor={(o) => o.id}
          renderItem={card}
          contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
          refreshing={q.loading}
          onRefresh={q.reload}
          ListEmptyComponent={<Empty title={tab === 'Active' ? 'Nothing on the way' : 'No orders yet'} body="Your jollof history will show up here." action="Order now" onAction={() => router.navigate('/customer/menu')} />}
        />
      )}
    </View>
  );
}
