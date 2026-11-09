import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { IconButton, PhotoTile, Pill, SectionHeader } from '@/components/ui';
import { CartBar } from '@/components/CartBar';
import { PHOTOS, photoFor } from '@/lib/menuImages';
import { color, gutter } from '@/theme';
import { ghs } from '@/lib/money';
import { useKitchen, useMenu } from '@/hooks/data';
import { useSession } from '@/stores/session';
import { Avatar } from '@/components/Avatar';
import { CustomerMenu } from '@/components/CustomerMenu';
import { CoverCarousel } from '@/components/CoverCarousel';
import { useCart } from '@/stores/cart';
import type { MenuItem } from '@/backend';

// Category shortcuts, with the real photos
const SHORTCUTS = [
  { name: 'Jollof', photo: PHOTOS.jollofChicken, bg: '#F9DCCB', tab: 'Jollof' },
  { name: 'Fried rice', photo: PHOTOS.friedRiceChicken, bg: '#F6E5C2', tab: 'Fried rice' },
  { name: 'Rice & stew', photo: PHOTOS.riceFishStew, bg: '#F3D3C2', tab: 'Rice & stew' },
  { name: 'Drinks', photo: PHOTOS.coke, bg: '#F3D0DA', tab: 'Drinks' },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning 👋' : h < 17 ? 'Good afternoon 👋' : 'Good evening 👋';
}
const firstName = (n?: string | null) => (n ?? '').trim().split(/\s+/)[0] || 'Welcome';

// 06 · Home
export default function Home() {
  const insets = useSafeAreaInsets();
  const kitchen = useKitchen();
  const menu = useMenu();
  const user = useSession((s) => s.user);
  const [menuOpen, setMenuOpen] = useState(false);
  const addToCart = useCart((s) => s.add);

  const popular = (menu.data?.items ?? []).filter((i) => i.isPopular && i.categoryId !== 3 && i.isAvailable);
    const refreshing = kitchen.loading || menu.loading;
  const refresh = useCallback(() => { void kitchen.reload(); void menu.reload(); }, [kitchen, menu]);

  const quickAdd = (it: MenuItem) => addToCart(it, 1);
  const k = kitchen.data;

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={color.primary} />}>
        <View style={{ paddingHorizontal: gutter, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => router.push('/profile-setup')} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityRole="button" accessibilityLabel="Your profile">
            <Avatar url={user?.avatarUrl} name={user?.fullName} size={44} ring={color.primary} />
            <View style={{ flex: 1 }}>
              <Text size={12} weight={500} tone={color.inkMuted}>{greeting()}</Text>
              <Text size={16} weight={800} numberOfLines={1}>{firstName(user?.fullName)}</Text>
            </View>
          </Pressable>
          <IconButton icon="bell" label="Notifications" onPress={() => router.push('/customer/orders')} />
          <IconButton icon="menu" label="Menu" onPress={() => setMenuOpen(true)} />
        </View>
        <CustomerMenu visible={menuOpen} onClose={() => setMenuOpen(false)} />

        <Pressable onPress={() => router.push('/customer/search')} accessibilityRole="search" style={{ marginTop: 16, marginHorizontal: gutter, height: 50, borderRadius: 14, backgroundColor: color.canvas, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
          <Icon name="search" size={18} color={color.inkMuted} />
          <Text size={14} tone={color.inkMuted}>Search jollof, fried rice, drinks…</Text>
        </Pressable>

        <View style={{ marginTop: 14, marginHorizontal: gutter, flexDirection: 'row', gap: 8 }}>
          {k && (k.accepting
            ? <Pill bg={color.successTint} fg={color.successText} dot={color.success}>{`Kitchen open · till ${k.closes ?? '7 PM'}`}</Pill>
            : <Pill bg={color.primaryTint} fg={color.primaryText} dot={color.primary}>{k.reason ?? 'Kitchen closed'}</Pill>)}
          {k?.accepting && <Pill>{`${k.etaMin}–${k.etaMax} min`}</Pill>}
        </View>

        {/* Full-width banners, swiping every 4 s */}
        <View style={{ marginTop: 16 }}>
          <CoverCarousel onPress={() => router.push('/customer/menu')} />
        </View>

        <SectionHeader title="Categories" action="See all" onAction={() => router.push('/customer/menu')} style={{ marginTop: 20, marginBottom: 10, marginHorizontal: gutter }} />
        <View style={{ paddingHorizontal: gutter, flexDirection: 'row', gap: 8 }}>
          {SHORTCUTS.map((c) => (
            <Pressable key={c.name} onPress={() => router.push({ pathname: '/customer/menu', params: { tab: c.tab } })} style={{ flex: 1, alignItems: 'center', gap: 8 }} accessibilityRole="button" accessibilityLabel={c.name}>
              <PhotoTile tint={c.bg} photo={c.photo} style={{ width: 64, height: 64, borderRadius: 20 }} />
              <Text size={12} weight={600}>{c.name}</Text>
            </Pressable>
          ))}
        </View>

        <SectionHeader title="Popular right now" action="See all" onAction={() => router.push('/customer/menu')} style={{ marginTop: 20, marginBottom: 10, marginHorizontal: gutter }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: gutter, gap: 12 }}>
          {popular.map((it) => (
            <Pressable key={it.id} onPress={() => router.push(`/customer/item/${it.id}`)} style={{ width: 150, borderRadius: 18, borderWidth: 1, borderColor: color.border, overflow: 'hidden', backgroundColor: '#FFFFFF' }} accessibilityRole="button" accessibilityLabel={`${it.name}, ${ghs(it.price, { short: true })}`}>
              <PhotoTile tint={it.tint} photo={photoFor(it)} style={{ height: 96 }} />
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
