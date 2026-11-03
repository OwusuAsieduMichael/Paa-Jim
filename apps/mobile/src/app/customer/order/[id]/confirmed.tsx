import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { Button, Divider, Loading } from '@/components/ui';
import { color } from '@/theme';
import { ghs } from '@/lib/money';
import { clock, NETWORK_LABEL } from '@/lib/format';
import { useLoad, useOrder } from '@/hooks/data';
import { backend } from '@/backend';

// 13 · Order placed
export default function Confirmed() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data: o } = useOrder(id);
  const code = useLoad(() => backend.deliveryCode(id!), [id]);
  const kitchen = useLoad(() => backend.kitchenStatus());
  if (!o) return <Loading />;

  const etaMin = (kitchen.data?.etaMax ?? 30) + Math.round(o.distanceKm * 2);
  const eta = new Date(new Date(o.paidAt ?? o.createdAt).getTime() + etaMin * 60_000);

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', paddingTop: insets.top + 72, paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }}>
      <Svg width={420} height={420} style={{ position: 'absolute', top: insets.top - 60 }} fill="none" stroke={color.primaryTint} strokeWidth={2}>
        <Circle cx={210} cy={210} r={200} /><Circle cx={210} cy={210} r={150} />
      </Svg>
      <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: color.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', shadowColor: color.primary, shadowOpacity: 0.35, shadowRadius: 13, shadowOffset: { width: 0, height: 12 }, elevation: 10 }}>
          <Icon name="check" size={40} color="#FFFFFF" strokeWidth={3} />
        </View>
      </View>
      <Text size={26} weight={800} style={{ marginTop: 28, marginBottom: 8 }} accessibilityRole="header">Payment received!</Text>
      <Text size={15} lh={1.5} tone={color.inkMuted} align="center">
        Paa Jim’s kitchen has your order. You’ll get a notification as soon as they accept it.
      </Text>

      <View style={{ marginTop: 28, alignSelf: 'stretch', borderRadius: 20, borderWidth: 1, borderColor: color.border, padding: 18, gap: 14, backgroundColor: '#FFFFFF' }}>
        <Row k="Order" v={`#${o.orderNo}`} bold />
        <Row k="Paid with" v={o.momoNetwork ? `${NETWORK_LABEL[o.momoNetwork]} ··· ${o.momoLast4 ?? ''}` : 'Mobile money'} />
        <Row k="Amount" v={ghs(o.total)} />
        <Divider />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: color.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="clock" size={20} color={color.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text size={12} tone={color.inkMuted}>Estimated arrival</Text>
            <Text size={20} weight={800}>{clock(eta)} <Text size={13} weight={600} tone={color.inkMuted}>· ~{etaMin} min</Text></Text>
          </View>
        </View>
      </View>

      <View style={{ marginTop: 14, alignSelf: 'stretch', padding: 14, borderRadius: 16, backgroundColor: color.ink, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text size={12} tone="rgba(255,255,255,0.8)">Your delivery code</Text>
          <Text size={12} tone="rgba(255,255,255,0.8)">Give it to the rider only when your food is in your hands</Text>
        </View>
        <Text size={26} weight={800} tone="#FFFFFF" ls={0.18} accessibilityLabel={`Delivery code ${code.data?.split('').join(' ')}`}>{code.data?.split('').join(' ') ?? '• • • •'}</Text>
      </View>

      <View style={{ marginTop: 'auto', alignSelf: 'stretch', flexDirection: 'row', gap: 12 }}>
        <Button title="Back home" variant="soft" size={15} onPress={() => router.replace('/customer')} style={{ flex: 1 }} />
        <Button title="Track order" size={15} onPress={() => router.replace(`/customer/order/${o.id}/track`)} style={{ flex: 1.4 }} />
      </View>
    </View>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text size={14} tone={color.inkMuted}>{k}</Text>
      <Text size={14} weight={bold ? 800 : 700}>{v}</Text>
    </View>
  );
}
