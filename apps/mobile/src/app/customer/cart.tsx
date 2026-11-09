import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { BackButton, Banner, Button, Empty, PhotoTile } from '@/components/ui';
import { photoFor } from '@/lib/menuImages';
import { color } from '@/theme';
import { ghs, times, toPesewas } from '@/lib/money';
import { useKitchen, useMenu } from '@/hooks/data';
import { useCart, cartSubtotal } from '@/stores/cart';

// 10 · Cart
export default function Cart() {
  const insets = useSafeAreaInsets();
  const { lines, setQty, clear, add } = useCart();
  const kitchen = useKitchen();
  const menu = useMenu();
  const recs = (menu.data?.items ?? []).filter((i) => i.categoryId === 3 && i.isAvailable && !lines.some((l) => l.menuItemId === i.id)).slice(0, 3);
  const k = kitchen.data;

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <BackButton />
        <Text size={22} weight={800} style={{ flex: 1 }} accessibilityRole="header">Your order</Text>
        {lines.length > 0 && (
          <Pressable onPress={clear} hitSlop={10} style={{ height: 36, justifyContent: 'center' }}>
            <Text size={13} weight={700} tone={color.primary}>Clear</Text>
          </Pressable>
        )}
      </View>

      {lines.length === 0 ? (
        <Empty title="Your cart is empty" body="Add some smoky jollof or fried rice to get started." action="Browse the menu" onAction={() => router.replace('/customer/menu')} />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
            {k && (
              <Banner tone={k.accepting ? 'success' : 'error'} icon={k.accepting ? 'clock' : 'alert'} style={{ marginTop: 16, marginHorizontal: 20, paddingVertical: 12 }}>
                <Text size={13} weight={600} tone={k.accepting ? color.successText : color.primaryText}>
                  {k.accepting ? `Kitchen is open — ready in about ${k.etaMin} min` : k.reason ?? 'The kitchen is closed right now'}
                </Text>
              </Banner>
            )}
            <View style={{ paddingTop: 10, paddingHorizontal: 20 }}>
              {lines.map((l) => (
                <View key={l.key} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: color.divider }}>
                  <PhotoTile tint={l.tint} photo={photoFor(l)} style={{ width: 72, height: 72, borderRadius: 16 }} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text size={15} weight={700}>{l.name}</Text>
                    {l.note ? <Text size={12} tone={color.inkMuted}>{l.note}</Text> : null}
                    <Text size={15} weight={800} tone={color.primary}>{ghs(times(toPesewas(l.unitPrice), l.qty))}</Text>
                  </View>
                  <View style={{ alignItems: 'center', gap: 2, backgroundColor: color.canvas, borderRadius: 12, padding: 4 }}>
                    <Pressable accessibilityLabel={`Increase ${l.name}`} onPress={() => setQty(l.key, l.qty + 1)} style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' }}>
                      <Text size={16} weight={700} tone="#FFFFFF">+</Text>
                    </Pressable>
                    <Text size={14} weight={800}>{l.qty}</Text>
                    <Pressable accessibilityLabel={`Decrease ${l.name}`} onPress={() => setQty(l.key, l.qty - 1)} style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                      <Text size={16} weight={700}>−</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>

            {recs.length > 0 && (
              <>
                <Text size={16} weight={800} style={{ marginTop: 18, marginBottom: 10, marginHorizontal: 20 }}>Add a cold drink</Text>
                <View style={{ paddingHorizontal: 20, flexDirection: 'row', gap: 10 }}>
                  {recs.map((r) => (
                    <View key={r.id} style={{ flex: 1, borderRadius: 16, borderWidth: 1, borderColor: color.border, overflow: 'hidden' }}>
                      <View style={{ height: 66, backgroundColor: r.tint }}>
                        <Pressable accessibilityLabel={`Add ${r.name}`} onPress={() => add(r)} style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 9, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="plus" size={16} color="#FFFFFF" strokeWidth={2.5} />
                        </Pressable>
                      </View>
                      <View style={{ paddingVertical: 8, paddingHorizontal: 10, gap: 2 }}>
                        <Text size={13} weight={700} numberOfLines={1}>{r.name.replace('Bottled ', '')}</Text>
                        <Text size={12} weight={700} tone={color.primary}>{ghs(r.price, { short: true })}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
          </ScrollView>

          <View style={{ paddingTop: 16, paddingHorizontal: 20, paddingBottom: insets.bottom + 20, borderTopWidth: 1, borderTopColor: color.border, gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text size={14} tone={color.inkMuted}>Subtotal</Text>
              <Text size={14} weight={700}>{ghs(cartSubtotal(lines))}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text size={13} tone={color.inkMuted}>Delivery fee</Text>
              <Text size={13} tone={color.inkMuted}>Calculated at checkout</Text>
            </View>
            <Button title="Go to checkout" disabled={k?.accepting === false} onPress={() => router.push('/customer/checkout')} />
          </View>
        </>
      )}
    </View>
  );
}
