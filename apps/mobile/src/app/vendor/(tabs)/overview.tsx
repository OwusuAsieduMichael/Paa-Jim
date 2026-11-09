import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Switch, View } from 'react-native';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { Button, Card } from '@/components/ui';
import { VendorHeader } from '@/components/VendorHeader';
import { VendorAccountButton } from '@/components/VendorAccount';
import { color } from '@/theme';
import { ghs } from '@/lib/money';
import { useKitchen, useLoad, useMenu } from '@/hooks/data';
import { backend } from '@/backend';

type Range = 'today' | 'week';
const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

function trend(now: number, prev: number, unit: string) {
  if (!prev) return { text: 'First day of data', color: color.inkMuted };
  const pct = Math.round(((now - prev) / prev) * 100);
  return { text: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs last ${unit}`, color: pct >= 0 ? color.successText : color.primaryText };
}

// 18b · Vendor overview + stock
export default function VendorOverview() {
  const [range, setRange] = useState<Range>('today');
  const ov = useLoad(() => backend.overview(range), [range], { refetchOnFocus: true });
  const kitchen = useKitchen();
  const menu = useMenu();
  const day = range === 'today';
  const o = ov.data;

  const series = (() => {
    if (!o) return [];
    if (day) return Array.from({ length: 13 }, (_, i) => ({ k: 10 + i, n: o.buckets.find((b) => b.k === 10 + i)?.n ?? 0 }));
    return Array.from({ length: 7 }, (_, i) => ({ k: i + 1, n: o.buckets.find((b) => b.k === i + 1)?.n ?? 0 }));
  })();
  const max = Math.max(1, ...series.map((s) => s.n));
  const busiest = series.reduce((a, b) => (b.n > a.n ? b : a), series[0] ?? { k: 0, n: 0 });
  const topMax = Math.max(1, ...(o?.top.map((t) => t.n) ?? [1]));
  const soldOut = (menu.data?.items ?? []).filter((i) => !i.isAvailable);
  const unitWord = day ? 'week' : 'week';

  async function toggleStock(id: string, available: boolean) {
    try { await backend.setItemAvailable(id, available); void menu.reload(); }
    catch (e) { Alert.alert('Could not update', (e as Error).message); }
  }

  const kpis = o ? [
    { label: 'Orders', value: String(o.orders), ...trend(o.orders, o.ordersPrev, unitWord) },
    { label: 'Sales', value: ghs(o.sales, { short: true }), ...trend(Number(o.sales), Number(o.salesPrev), unitWord) },
    { label: 'Avg cook time', value: o.avgCookMin != null ? `${o.avgCookMin} min` : '—', text: 'Accept → ready', color: color.inkMuted },
    { label: 'Rejected', value: String(o.rejected), text: `${o.orders ? ((o.rejected / o.orders) * 100).toFixed(1) : '0'}% · keep under 5%`, color: o.orders && o.rejected / o.orders > 0.05 ? color.primaryText : color.inkMuted },
  ] : [];

  return (
    <View style={{ flex: 1, backgroundColor: color.canvas }}>
      <VendorHeader
        eyebrow={kitchen.data?.vendorName ?? 'Paa Jim’s Kitchen'}
        title="Overview"
        right={<View style={{ height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: kitchen.data?.isOpen ? color.success : color.inkMuted, justifyContent: 'center' }}><Text size={12} weight={700} tone="#FFFFFF">{kitchen.data?.isOpen ? 'Open' : 'Paused'}</Text></View>}
      >
        <View style={{ flexDirection: 'row', gap: 6, padding: 4, borderRadius: 14, backgroundColor: color.ink2 }} accessibilityRole="tablist">
          {(['today', 'week'] as Range[]).map((r) => (
            <Pressable key={r} onPress={() => setRange(r)} accessibilityRole="tab" accessibilityState={{ selected: r === range }}
              style={{ flex: 1, height: 38, borderRadius: 11, backgroundColor: r === range ? '#FFFFFF' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              <Text size={13} weight={700} tone={r === range ? color.ink : '#D6D0CC'}>{r === 'today' ? 'Today' : 'This week'}</Text>
            </Pressable>
          ))}
        </View>
      </VendorHeader>

      <ScrollView contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 32, gap: 12 }} refreshControl={<RefreshControl refreshing={ov.loading} onRefresh={ov.reload} tintColor={color.primary} />}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {kpis.map((k) => (
            <View key={k.label} style={{ width: '48.5%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, gap: 4 }}>
              <Text size={12} weight={600} tone={color.inkMuted}>{k.label}</Text>
              <Text size={22} weight={800} ls={-0.01}>{k.value}</Text>
              <Text size={11} weight={700} tone={k.color}>{k.text}</Text>
            </View>
          ))}
        </View>

        <Card style={{ borderRadius: 16, padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Text size={15} weight={800}>{day ? 'Orders by hour' : 'Orders by day'}</Text>
            {busiest.n > 0 && <Text size={11} tone={color.inkMuted}>Busiest: {day ? hourLabel(busiest.k) : DAYS[busiest.k]}</Text>}
          </View>
          <View accessibilityRole="image" accessibilityLabel={`${day ? 'Orders per hour today' : 'Orders per day this week'}${busiest.n ? `, peaking at ${day ? hourLabel(busiest.k) : DAYS[busiest.k]}` : ''}`}
            style={{ height: 96, flexDirection: 'row', alignItems: 'flex-end', gap: 5, borderBottomWidth: 1, borderBottomColor: color.border }}>
            {series.map((s) => (
              <View key={s.k} style={{ flex: 1, height: Math.max(2, Math.round((s.n / max) * 86)), borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: s.n === max && s.n > 0 ? color.primary : '#F0B7BA' }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text size={10} tone={color.inkMuted}>{day ? '10 AM' : 'Mon'}</Text>
            <Text size={10} tone={color.inkMuted}>{day ? '4 PM' : 'Thu'}</Text>
            <Text size={10} tone={color.inkMuted}>{day ? '7 PM' : 'Sun'}</Text>
          </View>
        </Card>

        <Card style={{ borderRadius: 16, padding: 14, gap: 10 }}>
          <Text size={15} weight={800}>Top sellers</Text>
          {(o?.top ?? []).map((t, i) => (
            <View key={t.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text size={12} weight={600} style={{ width: 128 }} numberOfLines={1}>{t.name}</Text>
              <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: color.keypad }}>
                <View style={{ width: `${Math.round((t.n / topMax) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: i === 3 ? color.info : i === 2 ? color.warning : color.primary }} />
              </View>
              <Text size={12} weight={800} align="right" style={{ width: 28 }}>{t.n}</Text>
            </View>
          ))}
          {o && o.top.length === 0 && <Text size={13} tone={color.inkMuted}>No sales yet {day ? 'today' : 'this week'}.</Text>}
        </Card>

        {soldOut.map((it) => (
          <View key={it.id} style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: color.warningTint, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="alert" size={18} color={color.warningText} />
            <Text size={13} tone={color.warningText} style={{ flex: 1 }}><Text size={13} weight={700} tone={color.warningText}>{it.name}</Text> is sold out</Text>
            <Pressable onPress={() => toggleStock(it.id, true)} style={{ height: 34, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFFFFF', justifyContent: 'center' }}>
              <Text size={12} weight={700} tone={color.warningText}>Back in stock</Text>
            </Pressable>
          </View>
        ))}

        <Card style={{ borderRadius: 16, padding: 14, gap: 2 }}>
          <Text size={15} weight={800} style={{ marginBottom: 6 }}>Stock today</Text>
          <Text size={12} tone={color.inkMuted} style={{ marginBottom: 6 }}>Switch off anything you’ve run out of. Prices are set by Paa Jim admin.</Text>
          {(menu.data?.items ?? []).map((it) => (
            <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, borderBottomWidth: 1, borderBottomColor: color.divider }}>
              <Text size={14} weight={600} style={{ flex: 1 }} tone={it.isAvailable ? color.ink : color.inkMuted}>{it.name}</Text>
              <Switch value={it.isAvailable} onValueChange={(v) => toggleStock(it.id, v)} trackColor={{ true: color.success, false: color.ringIdle }} thumbColor="#FFFFFF" accessibilityLabel={`${it.name} in stock`} />
            </View>
          ))}
        </Card>

        <VendorAccountButton asButton />
      </ScrollView>
    </View>
  );
}
