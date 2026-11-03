import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { IconButton, PhotoTile, Pill, SectionHeader } from '@/components/ui';
import { CartBar } from '@/components/CartBar';
import { color, gutter } from '@/theme';
import { ghs } from '@/lib/money';
import { useKitchen, useLoad, useMenu } from '@/hooks/data';
import { useCart } from '@/stores/cart';
import { backend, type MenuItem } from '@/backend';

// Category shortcuts (design: Jollof, Fried rice, Water, Cans, Glass)
const SHORTCUTS = [
  { name: 'Jollof', label: 'JOLLOF', bg: '#F9DCCB', tab: 'Jollof' },
  { name: 'Fried rice', label: 'FRIED', bg: '#F6E5C2', tab: 'Fried rice' },
  { name: 'Water', label: 'WATER', bg: '#DCEBF5', tab: 'Drinks' },
  { name: 'Cans', label: 'CANS', bg: '#F3D0DA', tab: 'Drinks' },
  { name: 'Glass', label: 'GLASS', bg: '#E3EAD5', tab: 'Drinks' },
];

// 06 · Home
export default function Home() {
  const insets = useSafeAreaInsets();
  const kitchen = useKitchen();
  const menu = useMenu();
  const address = useLoad(() => backend.addresses(), [], { refetchOnFocus: true });
  const addToCart = useCart((s) => s.add);
  const home = address.data?.find((a) => a.isDefault) ?? address.data?.[0];

  const popular = (menu.data?.items ?? []).filter((i) => i.isPopular && i.categoryId !== 3 && i.isAvailable);
  const special = menu.data?.items.find((i) => i.name === 'Assorted Jollof');
  const refreshing = kitchen.loading || menu.loading;
  const refresh = useCallback(() => { void kitchen.reload(); void menu.reload(); }, [kitchen, menu]);

  const quickAdd = (it: MenuItem) => addToCart(it, 1);
  const k = kitchen.data;

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={color.primary} />}>
        <View style={{ paddingHorizontal: gutter, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => router.push('/profile-setup?mode=address')} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityRole="button" accessibilityLabel="Change delivery address">
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: color.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="pin" size={20} color={color.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text size={12} weight={500} tone={color.inkMuted}>Deliver to · {home?.label ?? 'Add address'}</Text>
              <Text size={15} weight={700}>{home?.gpsCode ?? 'Set your location'} ▾</Text>
            </View>
          </Pressable>
          <IconButton icon="bell" label="Notifications" onPress={() => router.push('/customer/orders')} />
        </View>

        <Pressable onPress={() => router.push('/customer/search')} accessibilityRole="search" style={{ marginTop: 16, marginHorizontal: gutter, height: 50, borderRadius: 14, backgroundColor: color.canvas, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
          <Icon name="search" size={18} color={color.inkMuted} />
          <Text size={14} tone={color.inkMuted}>Search jollof, fried rice, drinks…</Text>
        </Pressable>

        <View style={{ marginTop: 14, marginHorizontal: gutter, flexDirection: 'row', gap: 8 }}>
          {k && (k.accepting
            ? <Pill bg={color.successTint} fg={color.successText} dot={color.success}>{`Kitchen open · till ${k.closes ?? '10 PM'}`}</Pill>
            : <Pill bg={color.primaryTint} fg={color.primaryText} dot={color.primary}>{k.reason ?? 'Kitchen closed'}</Pill>)}
          {k?.accepting && <Pill>{`${k.etaMin}–${k.etaMax} min`}</Pill>}
        </View>

        <View style={{ marginTop: 16, marginHorizontal: gutter, height: 150, borderRadius: 22, backgroundColor: color.primary, overflow: 'hidden' }}>
          <View style={{ padding: 20, width: 190, gap: 6, flex: 1 }}>
            <Text size={11} weight={700} tone="rgba(255,255,255,0.85)" ls={0.08}>TODAY’S SPECIAL</Text>
            <Text size={20} weight={800} tone="#FFFFFF" lh={1.2}>Assorted jollof + a cold can drink</Text>
            <Pressable
              onPress={() => special && router.push(`/customer/item/${special.id}`)}
              style={{ marginTop: 'auto', alignSelf: 'flex-start', height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: '#FFFFFF', justifyContent: 'center' }}
              accessibilityRole="button"
            >
              <Text size={13} weight={700} tone={color.primary}>Order now</Text>
            </Pressable>
          </View>
          <PhotoTile tint={color.heroPhoto} label={'[Photo:\njollof plate]'} style={{ position: 'absolute', right: -24, top: 12, width: 170, height: 170, borderRadius: 85, borderWidth: 6, borderColor: 'rgba(255,255,255,0.25)' }} />
        </View>

        <SectionHeader title="Categories" action="See all" onAction={() => router.push('/customer/menu')} style={{ marginTop: 20, marginBottom: 10, marginHorizontal: gutter }} />
        <View style={{ paddingHorizontal: gutter, flexDirection: 'row', gap: 8 }}>
          {SHORTCUTS.map((c) => (
            <Pressable key={c.name} onPress={() => router.push({ pathname: '/customer/menu', params: { tab: c.tab } })} style={{ flex: 1, alignItems: 'center', gap: 8 }} accessibilityRole="button" accessibilityLabel={c.name}>
              <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Text size={10} weight={700} tone={color.photoText}>{c.label}</Text>
              </View>
              <Text size={12} weight={600}>{c.name}</Text>
            </Pressable>
          ))}
        </View>

        <SectionHeader title="Popular right now" action="See all" onAction={() => router.push('/customer/menu')} style={{ marginTop: 20, marginBottom: 10, marginHorizontal: gutter }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: 12 }}>
          {popular.map((it) => (
            <Pressable key={it.id} onPress={() => router.push(`/customer/item/${it.id}`)} style={{ width: 150, borderRadius: 18, borderWidth: 1, borderColor: color.border, overflow: 'hidden', backgroundColor: '#FFFFFF' }} accessibilityRole="button" accessibilityLabel={`${it.name}, ${ghs(it.price, { short: true })}`}>
              <PhotoTile tint={it.tint} style={{ height: 96 }} />
              <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 4 }}>
                <Text size={14} weight={700} numberOfLines={1}>{it.name}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text size={14} weight={800} tone={color.primary}>{ghs(it.price, { short: true })}</Text>
                  <Pressable onPress={() => quickAdd(it)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Add ${it.name}`} style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="plus" size={16} color="#FFFFFF" strokeWidth={2.5} />
                  </Pressable>
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </ScrollView>
      <CartBar />
    </View>
  );
}
