import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Text } from './Text';
import { useCart, cartCount, cartSubtotal } from '@/stores/cart';
import { ghs } from '@/lib/money';
import { color } from '@/theme';

/** Floating "View cart" bar above the tab bar (Home, Menu). */
export function CartBar({ bottom = 16 }: { bottom?: number }) {
  const lines = useCart((s) => s.lines);
  const n = cartCount(lines);
  if (n === 0) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View cart, ${n} items, ${ghs(cartSubtotal(lines))}`}
      onPress={() => router.push('/customer/cart')}
      style={({ pressed }) => ({
        position: 'absolute', left: 20, right: 20, bottom, height: 54, borderRadius: 16,
        backgroundColor: pressed ? '#000' : color.ink, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12,
        shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 10 }, elevation: 10,
      })}
    >
      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' }}>
        <Text size={13} weight={800} tone="#FFFFFF">{n}</Text>
      </View>
      <Text size={15} weight={700} tone="#FFFFFF" style={{ flex: 1 }}>View cart</Text>
      <Text size={15} weight={800} tone="#FFFFFF">{ghs(cartSubtotal(lines))}</Text>
    </Pressable>
  );
}
