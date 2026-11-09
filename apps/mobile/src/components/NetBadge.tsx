import { View } from 'react-native';
import { Text } from './Text';
import { netInfo } from '@/lib/momo';
import type { Network } from '@/backend';

/** Network badge (MTN yellow, Telecel black, AirtelTigo blue). */
export function NetBadge({ network, size = 40 }: { network: Network; size?: number }) {
  const n = netInfo(network);
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: n.badge, alignItems: 'center', justifyContent: 'center' }}>
      <Text size={Math.round(size * 0.3)} weight={800} tone={n.fg}>{n.mark}</Text>
    </View>
  );
}
