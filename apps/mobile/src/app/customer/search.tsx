import { useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { BackButton, PhotoTile } from '@/components/ui';
import { color, font } from '@/theme';
import { ghs } from '@/lib/money';
import { useLoad, useMenu } from '@/hooks/data';
import { useCart } from '@/stores/cart';

const TAGS = ['Jollof', 'Fried rice', 'Chicken', 'Beef', 'Fish', 'Assorted', 'Water', 'Cans', 'Glass bottles'];
const RECENT_KEY = 'paajim-recent-search';
const SYN: Record<string, string> = { cans: 'can', 'glass bottles': 'glass', fish: 'fish' };

// 07 · Search
export default function Search() {
  const insets = useSafeAreaInsets();
  const menu = useMenu();
  const add = useCart((s) => s.add);
  const [q, setQ] = useState('');
  const recent = useLoad<string[]>(async () => JSON.parse((await AsyncStorage.getItem(RECENT_KEY)) ?? '[]'));

  const term = (SYN[q.trim().toLowerCase()] ?? q).trim().toLowerCase();
  const results = useMemo(() => {
    if (!term) return [];
    return (menu.data?.items ?? []).filter((i) => `${i.name} ${i.description}`.toLowerCase().includes(term));
  }, [menu.data, term]);

  const remember = async (s: string) => {
    const next = [s, ...(recent.data ?? []).filter((x) => x.toLowerCase() !== s.toLowerCase())].slice(0, 5);
    recent.setData(next);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', paddingTop: insets.top + 12, paddingHorizontal: 20 }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <BackButton />
        <View style={{ flex: 1, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: color.primary, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }}>
          <Icon name="search" size={18} color={color.primary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder="Search the menu"
            placeholderTextColor="#9A928E"
            returnKeyType="search"
            onSubmitEditing={() => q.trim() && remember(q.trim())}
            accessibilityLabel="Search the menu"
            style={{ flex: 1, fontFamily: font[600], fontSize: 15, color: color.ink }}
          />
        </View>
      </View>

      {!term ? (
        <>
          {!!recent.data?.length && (
            <>
              <Text size={15} weight={800} style={{ marginTop: 22, marginBottom: 10 }}>Recent</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {recent.data.map((r) => (
                  <Pressable key={r} onPress={() => setQ(r)} style={{ height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: color.canvas, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon name="clock" size={14} color={color.inkMuted} />
                    <Text size={13} weight={600}>{r}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          <Text size={15} weight={800} style={{ marginTop: 20, marginBottom: 10 }}>Try</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TAGS.map((t) => (
              <Pressable key={t} onPress={() => { setQ(t); void remember(t); }} style={{ height: 32, paddingHorizontal: 12, borderRadius: 10, backgroundColor: color.primaryTint, justifyContent: 'center' }}>
                <Text size={13} weight={700} tone={color.primaryText}>{t}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <>
          <View style={{ marginTop: 22, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <Text size={15} weight={800}>Results for “{q.trim()}”</Text>
            <Text size={13} tone={color.inkMuted}>{results.length} {results.length === 1 ? 'dish' : 'dishes'}</Text>
          </View>
          <FlatList
            data={results}
            keyExtractor={(i) => i.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 10, paddingBottom: insets.bottom + 24 }}
            ListEmptyComponent={<Text size={14} tone={color.inkMuted} style={{ paddingTop: 12 }}>Nothing matches. Try “jollof” or “water”.</Text>}
            renderItem={({ item: it }) => (
              <Pressable onPress={() => { void remember(q.trim()); router.push(`/customer/item/${it.id}`); }} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 10, borderRadius: 16, borderWidth: 1, borderColor: color.border }}>
                <PhotoTile tint={it.isAvailable ? it.tint : '#EFEAE6'} label={it.isAvailable ? '[Photo]' : 'Sold out'} style={{ width: 68, height: 68, borderRadius: 14 }} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text size={15} weight={700}>{it.name}</Text>
                  <Text size={12} tone={color.inkMuted} numberOfLines={1}>{it.description}</Text>
                  <Text size={14} weight={800} tone={it.isAvailable ? color.primary : color.inkMuted}>{it.isAvailable ? ghs(it.price) : 'Sold out today'}</Text>
                </View>
                <Pressable disabled={!it.isAvailable} onPress={() => add(it)} accessibilityLabel={`Add ${it.name}`} style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: it.isAvailable ? color.primary : color.disabled, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="plus" size={18} color="#FFFFFF" strokeWidth={2.5} />
                </Pressable>
              </Pressable>
            )}
          />
        </>
      )}
    </View>
  );
}
