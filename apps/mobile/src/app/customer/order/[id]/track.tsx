import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Svg, { Circle, Path, G } from 'react-native-svg';
import { Text } from '@/components/Text';
import { BackButton, Banner, Button, IconButton, Loading } from '@/components/ui';
import { MAP_PROVIDER, Pin } from '@/components/MiniMap';
import { color, shadow } from '@/theme';
import { clock } from '@/lib/format';
import { etaMinutes, km, toLatLng, type LatLng } from '@/lib/geo';
import { prettyPhone } from '@/lib/phone';
import { Avatar } from '@/components/Avatar';
import { useLoad, useOrder } from '@/hooks/data';
import { backend, type Order, type OrderStatus } from '@/backend';

const STEPS: Array<{ label: string; at: (o: Order) => string | null; reached: OrderStatus[] }> = [
  { label: 'Payment received', at: (o) => o.paidAt, reached: ['paid', 'accepted', 'ready_for_pickup', 'en_route', 'arrived', 'delivered'] },
  { label: 'Kitchen accepted', at: (o) => o.acceptedAt, reached: ['accepted', 'ready_for_pickup', 'en_route', 'arrived', 'delivered'] },
  { label: 'Food ready · rider picked up', at: (o) => o.claimedAt, reached: ['en_route', 'arrived', 'delivered'] },
  { label: 'On the way', at: (o) => o.arrivedAt, reached: ['arrived', 'delivered'] },
  { label: 'Delivered', at: (o) => o.deliveredAt, reached: ['delivered'] },
];

function headline(s: OrderStatus): { title: string; sub?: string } {
  switch (s) {
    case 'paid': return { title: 'Waiting for the kitchen', sub: 'They’ll accept in a moment. If not within 8 min, you’re refunded.' };
    case 'accepted': return { title: 'Your food is cooking' };
    case 'ready_for_pickup': return { title: 'Packed — waiting for a rider' };
    case 'en_route': return { title: 'Rider is on the way' };
    case 'arrived': return { title: 'Your rider is here', sub: 'Share your delivery code once the food is in your hands.' };
    case 'delivered': return { title: 'Delivered — enjoy!' };
    case 'rejected': return { title: 'The kitchen couldn’t take this order', sub: 'Your MoMo payment is being refunded.' };
    case 'cancelled': return { title: 'Order cancelled', sub: 'Any payment is being refunded to your wallet.' };
    case 'delivery_failed': return { title: 'Delivery problem', sub: 'Paa Jim will call you to sort it out.' };
    default: return { title: 'Processing payment' };
  }
}

function RiderMarker() {
  return (
    <Svg width={44} height={44} viewBox="0 0 44 44">
      <Circle cx={22} cy={22} r={19} fill={color.primary} stroke="#FFFFFF" strokeWidth={4} />
      <G transform="translate(10 10)" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Circle cx={5} cy={17} r={3.5} /><Circle cx={19} cy={17} r={3.5} /><Path d="M5 17l4-7h5l4 7M9 10 7.5 6H5" />
      </G>
    </Svg>
  );
}

// 14 · Live tracking
export default function Track() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data: o } = useOrder(id);
  const code = useLoad(() => backend.deliveryCode(id!), [id]);
  const trk = useLoad(() => backend.tracking(id!), [id, o?.status]);
  const [riderPos, setRiderPos] = useState<LatLng | null>(null);
  const map = useRef<MapView>(null);

  useEffect(() => { if (trk.data?.rider) setRiderPos({ lat: trk.data.rider.lat, lng: trk.data.rider.lng }); }, [trk.data]);

  // Live rider position — subscribed only while the rider is out, dropped on unmount.
  const riderId = o?.riderId;
  const live = o?.status === 'en_route' || o?.status === 'arrived';
  useEffect(() => {
    if (!riderId || !live) return;
    return backend.subscribeRiderLocation(riderId, (p) => setRiderPos({ lat: p.lat, lng: p.lng }));
  }, [riderId, live]);

  // Rated already? Offer it once delivered.
  useEffect(() => {
    if (o?.status === 'delivered' && !o.rated) {
      const t = setTimeout(() => router.replace(`/customer/order/${o.id}/rate`), 1500);
      return () => clearTimeout(t);
    }
  }, [o?.status, o?.rated, o?.id]);

  const kitchen = trk.data?.kitchen;
  const dest = o ? { lat: o.destLat, lng: o.destLng } : null;
  const remainingKm = riderPos && dest ? km(riderPos, dest) : o?.distanceKm ?? 0;
  const mins = o?.status === 'arrived' ? 0 : etaMinutes(remainingKm);

  const region = useMemo(() => {
    if (!kitchen || !dest) return undefined;
    const lat = (kitchen.lat + dest.lat) / 2;
    const lng = (kitchen.lng + dest.lng) / 2;
    const d = Math.max(Math.abs(kitchen.lat - dest.lat), Math.abs(kitchen.lng - dest.lng)) * 2.2 + 0.006;
    return { latitude: lat - d * 0.18, longitude: lng, latitudeDelta: d, longitudeDelta: d };
  }, [kitchen?.lat, kitchen?.lng, dest?.lat, dest?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!o) return <Loading />;
  const h = headline(o.status);
  const closed = ['rejected', 'cancelled', 'delivery_failed', 'payment_failed'].includes(o.status);

  return (
    <View style={{ flex: 1, backgroundColor: color.map }}>
      {region && (
        <MapView ref={map} provider={MAP_PROVIDER} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '58%' }} initialRegion={region} toolbarEnabled={false}
          accessibilityLabel="Map showing the rider on the way from the kitchen to your home">
          {kitchen && (
            <Marker coordinate={toLatLng(kitchen)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} title="Paa Jim’s Kitchen">
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color.ink, borderWidth: 4, borderColor: '#FFFFFF' }} />
            </Marker>
          )}
          {dest && <Marker coordinate={toLatLng(dest)} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false} title="Home"><Pin fill={color.ink} /></Marker>}
          {riderPos && live && (
            <Marker coordinate={toLatLng(riderPos)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} title="Your rider"><RiderMarker /></Marker>
          )}
          {kitchen && dest && (
            <Polyline coordinates={[toLatLng(kitchen), ...(riderPos && live ? [toLatLng(riderPos)] : []), toLatLng(dest)]} strokeColor={color.primary} strokeWidth={5} />
          )}
        </MapView>
      )}

      <View style={{ position: 'absolute', top: insets.top + 8, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <BackButton bg="#FFFFFF" style={shadow.soft} onPress={() => (router.canGoBack() ? router.back() : router.replace('/customer/orders'))} />
        <View style={[{ height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#FFFFFF', justifyContent: 'center' }, shadow.soft]}>
          <Text size={13} weight={700}>Order #{o.orderNo}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '62%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28 }, shadow.sheet]}>
        <ScrollView contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 14 }}>
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: color.lineIdle }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }} accessibilityLiveRegion="polite">
            {live && (
              <View style={{ width: 70, height: 70, borderRadius: 35, borderWidth: 5, borderColor: color.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text size={22} weight={800} lh={1}>{mins}</Text>
                <Text size={10} weight={600} tone={color.inkMuted}>min</Text>
              </View>
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <Text size={18} weight={800}>{h.title}</Text>
              <Text size={13} tone={color.inkMuted} lh={1.45}>
                {live && o.status === 'en_route' ? `Arriving about ${clock(new Date(Date.now() + mins * 60_000))} · ${remainingKm.toFixed(1)} km away` : h.sub ?? ''}
              </Text>
            </View>
          </View>

          {o.riderName && live && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: color.canvas }}>
              <Avatar url={o.riderAvatarUrl} name={o.riderName} size={52} bg="#E7DCCB" fg={color.photoText} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text size={15} weight={700} numberOfLines={1}>{o.riderName}</Text>
                {o.riderPhone && <Text size={13} weight={600} tone={color.ink}>{prettyPhone(o.riderPhone)}</Text>}
                <Text size={12} tone={color.inkMuted}>Your Paa Jim rider · {trk.data?.rider?.vehicle ?? 'Motorbike'}</Text>
              </View>
              {o.riderPhone && <IconButton icon="phone" label="Call rider" bg={color.primary} fg="#FFFFFF" onPress={() => Linking.openURL(`tel:+${o.riderPhone!.replace(/\D/g, '')}`)} />}
            </View>
          )}

          {!closed && o.status !== 'delivered' && code.data && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.primary }}>
              <Text size={13} weight={600} tone={color.inkMuted}>Delivery code — share on arrival</Text>
              <Text size={22} weight={800} ls={0.16} tone={color.primary}>{code.data}</Text>
            </View>
          )}

          {closed ? (
            <Banner tone="error" icon="info">{o.rejectReason ? `Reason: ${o.rejectReason}. ${h.sub}` : h.sub ?? ''}</Banner>
          ) : (
            <View style={{ paddingLeft: 4 }}>
              {STEPS.map((s, i) => {
                const done = s.reached.includes(o.status);
                const now = !done && (i === 0 || STEPS[i - 1]!.reached.includes(o.status));
                const t = i === 0 ? o.paidAt : i === 1 ? o.acceptedAt : i === 2 ? o.claimedAt : i === 3 ? (now ? null : o.claimedAt) : o.deliveredAt;
                return (
                  <View key={s.label} style={{ flexDirection: 'row', gap: 12, minHeight: 30 }}>
                    <View style={{ alignItems: 'center', width: 16 }}>
                      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: done || now ? color.primary : '#FFFFFF', borderWidth: 3, borderColor: now ? '#F6C5C8' : done ? color.primary : color.ringIdle }} />
                      {i < STEPS.length - 1 && <View style={{ flex: 1, width: 2, backgroundColor: done ? color.primary : color.lineIdle }} />}
                    </View>
                    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8 }}>
                      <Text size={13} weight={now ? 800 : 600} tone={done || now ? color.ink : color.inkMuted}>{s.label}</Text>
                      <Text size={13} tone={color.inkMuted}>{now ? 'Now' : done ? clock(t) : ''}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {o.status === 'delivered' && !o.rated && <Button title="Rate your meal" onPress={() => router.replace(`/customer/order/${o.id}/rate`)} />}
        </ScrollView>
      </View>
    </View>
  );
}
