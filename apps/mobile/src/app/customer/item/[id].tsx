import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { BackButton, Button, IconButton, Loading, PhotoTile, Pill } from '@/components/ui';
import { photoFor } from '@/lib/menuImages';
import { color } from '@/theme';
import { add as addMoney, ghs, times, toPesewas } from '@/lib/money';
import { useMenu } from '@/hooks/data';
import { useCart } from '@/stores/cart';

// 09 · Item detail
export default function ItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const menu = useMenu();
  const addToCart = useCart((s) => s.add);
  const [qty, setQty] = useState(1);
  const [extras, setExtras] = useState<Record<string, boolean>>({});

  const item = menu.data?.items.find((i) => i.id === id);
  if (!item) return <Loading />;

  const isFood = item.categoryId !== 3;
  const photo = photoFor(item);
  const drinks = (menu.data?.items ?? []).filter((i) => i.categoryId === 3 && i.isAvailable).slice(0, 4);
  const extraTotal = addMoney(...drinks.filter((d) => extras[d.id]).map((d) => toPesewas(d.price)));
  const total = times(addMoney(toPesewas(item.price), extraTotal), qty);

  function addAll() {
    addToCart(item!, qty);
    drinks.filter((d) => extras[d.id]).forEach((d) => addToCart(d, qty));
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {!isFood && photo ? (
          // Drinks: the photo fills the whole top area, its own backdrop edge to edge.
          // Bottles/cans on plain white are shown whole on white, clear of the buttons.
          <View style={{ height: 380, backgroundColor: photo.fit === 'contain' ? '#FFFFFF' : item.tint, overflow: 'hidden' }}>
            <Image
              source={photo.source}
              resizeMode={photo.fit}
              accessibilityLabel={item.name}
              style={photo.fit === 'contain'
                ? { position: 'absolute', top: insets.top + 60, bottom: 20, left: 0, right: 0, width: '100%' }
                : { width: '100%', height: '100%' }}
            />
          </View>
        ) : (
          <View style={{ height: 330, backgroundColor: color.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
            <PhotoTile tint={item.tint} label={`[Photo: ${item.name}]`} photo={photo} style={{ width: 230, height: 230, borderRadius: 115, shadowColor: color.primary, shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 18 }, elevation: 10 }} />
          </View>
        )}
        {/* Sized wrapper: on Android, buttons outside their parent's box can't be tapped */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 60 }}>
          <View style={{ position: 'absolute', top: insets.top + 8, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' }}>
            <BackButton bg="#FFFFFF" />
            <IconButton icon="heart" label="Save to favourites" bg="#FFFFFF" fg={color.primary} />
          </View>
        </View>

        <View style={{ paddingTop: 22, paddingHorizontal: 20, gap: 8 }}>
          {item.isPopular && <Pill bg={color.primaryTint} fg={color.primaryText} height={26}>Bestseller</Pill>}
          {!item.isAvailable && <Pill bg={color.canvas} fg={color.inkMuted} height={26}>Sold out today</Pill>}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <Text size={24} weight={800} ls={-0.01} style={{ flex: 1 }} accessibilityRole="header">{item.name}</Text>
            <Text size={22} weight={800} tone={color.primary}>{ghs(item.price, { short: true })}</Text>
          </View>
          <Text size={14} lh={1.55} tone={color.inkMuted}>{item.description}</Text>
          {isFood && (
            <View style={{ flexDirection: 'row', gap: 16, paddingTop: 4, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name="star" size={15} color={color.star} fill={color.star} />
                <Text size={13} weight={600} tone={color.inkMuted}>4.9</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name="clock" size={15} color={color.inkMuted} />
                <Text size={13} weight={600} tone={color.inkMuted}>15 min prep</Text>
              </View>
              <Text size={13} weight={600} tone={color.inkMuted}>Medium spicy</Text>
            </View>
          )}
        </View>

        {isFood && drinks.length > 0 && (
          <>
            <Text size={16} weight={800} style={{ marginTop: 20, marginHorizontal: 20, marginBottom: 4 }}>
              Add a cold drink <Text size={12} weight={600} tone={color.inkMuted}>· optional</Text>
            </Text>
            <View style={{ paddingHorizontal: 20 }}>
              {drinks.map((d) => {
                const on = Boolean(extras[d.id]);
                return (
                  <Pressable
                    key={d.id}
                    onPress={() => setExtras((x) => ({ ...x, [d.id]: !on }))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: color.divider }}
                  >
                    <PhotoTile tint={d.tint} label="" photo={photoFor(d)} style={{ width: 40, height: 40, borderRadius: 10 }} />
                    <Text size={14} weight={600} style={{ flex: 1 }}>{d.name}</Text>
                    <Text size={14} weight={600} tone={color.inkMuted}>+{ghs(d.price, { short: true })}</Text>
                    <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? color.primary : color.ringIdle, backgroundColor: on ? color.primary : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                      {on && <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      <View style={{ paddingTop: 14, paddingHorizontal: 20, paddingBottom: insets.bottom + 20, borderTopWidth: 1, borderTopColor: color.border, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View style={{ height: 54, borderRadius: 16, backgroundColor: color.canvas, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6 }}>
          <Pressable accessibilityLabel="Decrease quantity" onPress={() => setQty((q) => Math.max(1, q - 1))} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            <Text size={20} weight={700}>−</Text>
          </Pressable>
          <Text size={16} weight={800} align="center" style={{ width: 28 }}>{qty}</Text>
          <Pressable accessibilityLabel="Increase quantity" onPress={() => setQty((q) => Math.min(20, q + 1))} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text size={20} weight={700} tone="#FFFFFF">+</Text>
          </Pressable>
        </View>
        <Button title={item.isAvailable ? `Add · ${ghs(total)}` : 'Sold out today'} disabled={!item.isAvailable} onPress={addAll} height={54} size={15} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
