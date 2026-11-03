import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { BackButton, Chip, IconButton, Loading, PhotoTile } from '@/components/ui';
import { CartBar } from '@/components/CartBar';
import { color, shadow } from '@/theme';
import { ghs } from '@/lib/money';
import { useKitchen, useMenu } from '@/hooks/data';
import { useCart } from '@/stores/cart';
import type { MenuItem } from '@/backend';

// 08 · Menu
export default function Menu() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const menu = useMenu();
  const kitchen = useKitchen();
  const add = useCart((s) => s.add);
  const [tab, setTab] = useState('Popular');
  useEffect(() => { if (params.tab) setTab(params.tab); }, [params.tab]);

  const tabs = ['Popular', ...(menu.data?.categories.map((c) => c.name) ?? [])];
  const items = useMemo(() => {
    const all = menu.data?.items ?? [];
    if (tab === 'Popular') return [...all.filter((i) => i.isPopular), ...all.filter((i) => !i.isAvailable && !i.isPopular)];
    const cat = menu.data?.categories.find((c) => c.name === tab);
    return all.filter((i) => i.categoryId === cat?.id);
  }, [menu.data, tab]);

  const row = ({ item: it }: { item: MenuItem }) => {
    const live = it.isAvailable;
    return (
      <Pressable
        onPress={() => router.push(`/customer/item/${it.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${it.name}. ${it.description}. ${live ? ghs(it.price) : 'Sold out today'}`}
        style={{ flexDirection: 'row', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: color.divider }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text size={15} weight={700}>{it.name}</Text>
          <Text size={12} lh={1.45} tone={color.inkMuted}>{it.description}</Text>
          <Text size={15} weight={800} tone={live ? color.primary : color.inkMuted}>{live ? ghs(it.price) : 'Sold out today'}</Text>
        </View>
        <PhotoTile tint={live ? it.tint : '#EFEAE6'} label={live ? '[Photo]' : 'Sold out'} style={{ width: 96, height: 88, borderRadius: 16 }}>
          <Pressable
            disabled={!live}
            onPress={() => add(it)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Add ${it.name}`}
            style={{ position: 'absolute', right: -4, bottom: -6, width: 32, height: 32, borderRadius: 10, backgroundColor: live ? color.primary : color.disabled, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="plus" size={16} color="#FFFFFF" strokeWidth={2.5} />
          </Pressable>
        </PhotoTile>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar style="light" />
      <View style={{ height: 190 + insets.top * 0.3, backgroundColor: color.primary, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Text size={12} weight={600} tone="rgba(255,255,255,0.55)">[Cover photo: Paa Jim’s kitchen]</Text>
        </View>
        <View style={{ position: 'absolute', top: insets.top + 8, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' }}>
          <BackButton bg="#FFFFFF" onPress={() => router.navigate('/customer')} />
          <IconButton icon="search" label="Search" bg="#FFFFFF" onPress={() => router.push('/customer/search')} />
        </View>
      </View>
      <View style={[{ marginTop: -30, marginHorizontal: 16, backgroundColor: '#FFFFFF', borderRadius: 20, paddingVertical: 16, paddingHorizontal: 18, gap: 8 }, shadow.card]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text size={22} weight={800} accessibilityRole="header">{kitchen.data?.vendorName ?? 'Paa Jim’s Kitchen'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="star" size={16} color={color.star} fill={color.star} />
            <Text size={13} weight={700}>4.8</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <Text size={12} weight={600} tone={color.inkMuted}>Jollof · Fried rice · Drinks</Text>
          <Text size={12} weight={600} tone={kitchen.data?.accepting === false ? color.primaryText : color.inkMuted}>
            {kitchen.data?.accepting === false ? kitchen.data.reason : `${kitchen.data?.etaMin ?? 25}–${kitchen.data?.etaMax ?? 35} min`}
          </Text>
        </View>
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6, gap: 8 }}>
          {tabs.map((t) => <Chip key={t} label={t} on={t === tab} onPress={() => setTab(t)} height={40} />)}
        </ScrollView>
      </View>

      {menu.loading && !menu.data ? <Loading /> : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={row}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 96 }}
          refreshing={menu.loading}
          onRefresh={menu.reload}
        />
      )}
      <CartBar />
    </View>
  );
}
