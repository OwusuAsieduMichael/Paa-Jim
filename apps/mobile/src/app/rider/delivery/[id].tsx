import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { Banner, Button, CodeBoxes, IconButton, Loading } from '@/components/ui';
import { ReasonSheet } from '@/components/ReasonSheet';
import { Pin } from '@/components/MiniMap';
import { color, shadow } from '@/theme';
import { itemCount } from '@/lib/format';
import { km, toLatLng, type LatLng } from '@/lib/geo';
import { initials, firstNameInitial } from '@/lib/phone';
import { useOrder } from '@/hooks/data';
import { startDeliveryTracking, stopDeliveryTracking } from '@/features/riderTracking';
import { backend, BackendError } from '@/backend';
import { demoPeekCode } from '@/backend/demoBackend';

const QUEUE_KEY = 'paajim-verify-queue';
const CHIP = {
  en_route: { label: 'EN ROUTE', bg: color.primaryTint, fg: color.primaryText },
  arrived: { label: 'ARRIVED', bg: color.starTint, fg: '#7A5600' },
  delivered: { label: 'DELIVERED', bg: color.successTint, fg: color.successText },
  delivery_failed: { label: 'PROBLEM', bg: color.primaryTint, fg: color.primaryText },
} as const;

// 21 · Rider delivery
export default function RiderDelivery() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data: o, reload, setData } = useOrder(id);
  const [me, setMe] = useState<LatLng | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'warning'; text: string } | null>(null);
  const [locked, setLocked] = useState(false);
  const [queued, setQueued] = useState(false);
  const [reporting, setReporting] = useState(false);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  // Own position for the map (UI only; pings are sent by riderTracking).
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    Location.getForegroundPermissionsAsync().then(async (p) => {
      if (!p.granted) return;
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 15 }, (l) => setMe({ lat: l.coords.latitude, lng: l.coords.longitude }));
    }).catch(() => {});
    return () => sub?.remove();
  }, []);

  // Pings only while en_route (Handbook §2.6).
  useEffect(() => {
    if (!o) return;
    if (o.status === 'en_route') void startDeliveryTracking(o.id);
    else void stopDeliveryTracking();
  }, [o?.status, o?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Offline queue: a verify that failed for network reasons is retried with backoff.
  useEffect(() => {
    let stop = false;
    let delay = 3000;
    async function drain() {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      const q = raw ? (JSON.parse(raw) as { orderId: string; code: string }) : null;
      if (!q || q.orderId !== id) { setQueued(false); return; }
      setQueued(true);
      try {
        const r = await backend.verifyDelivery(q.orderId, q.code);
        await AsyncStorage.removeItem(QUEUE_KEY);
        setQueued(false);
        if (r.ok) await reload();
        else setMsg({ tone: 'error', text: r.message });
      } catch (e) {
        if (e instanceof BackendError && e.network && !stop) { delay = Math.min(delay * 2, 30_000); setTimeout(drain, delay); }
        else { await AsyncStorage.removeItem(QUEUE_KEY); setQueued(false); }
      }
    }
    void drain();
    return () => { stop = true; };
  }, [id, reload]);

  const dest = o ? { lat: o.destLat, lng: o.destLng } : null;
  const region = useMemo(() => {
    if (!dest) return undefined;
    const from = me ?? dest;
    const d = Math.max(Math.abs(from.lat - dest.lat), Math.abs(from.lng - dest.lng)) * 2.4 + 0.008;
    return { latitude: (from.lat + dest.lat) / 2 - d * 0.2, longitude: (from.lng + dest.lng) / 2, latitudeDelta: d, longitudeDelta: d };
  }, [Boolean(me), dest?.lat, dest?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!o || !dest) return <Loading />;
  const leftKm = me ? km(me, dest) : o.distanceKm;
  const chip = CHIP[o.status as keyof typeof CHIP] ?? CHIP.en_route;
  const demoHint = backend.demo ? demoPeekCode(o.id) : null;

  function navigate() {
    const url = Platform.select({
      android: `google.navigation:q=${dest!.lat},${dest!.lng}&mode=l`,
      ios: `comgooglemaps://?daddr=${dest!.lat},${dest!.lng}&directionsmode=driving`,
    })!;
    Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${dest!.lat},${dest!.lng}&travelmode=two-wheeler`));
  }

  async function arrived() {
    setBusy(true);
    setMsg(null);
    try { await backend.markArrived(o!.id); setData((x) => (x ? { ...x, status: 'arrived' } : x)); await stopDeliveryTracking(); }
    catch (e) { setMsg({ tone: 'error', text: (e as Error).message }); }
    finally { setBusy(false); }
  }

  async function verify() {
    if (code.length !== 4) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await backend.verifyDelivery(o!.id, code);
      if (r.ok) { await reload(); return; }
      setCode('');
      if (r.error === 'locked') { setLocked(true); setMsg({ tone: 'error', text: r.message }); }
      else setMsg({ tone: 'error', text: `${r.message}${r.triesLeft != null ? ` ${r.triesLeft} ${r.triesLeft === 1 ? 'try' : 'tries'} left.` : ''}` });
    } catch (e) {
      if (e instanceof BackendError && e.network) {
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify({ orderId: o!.id, code }));
        setQueued(true);
        setMsg({ tone: 'warning', text: 'No network — the code is saved and will be sent automatically.' });
      } else setMsg({ tone: 'error', text: (e as Error).message });
    } finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.map }}>
      <StatusBar style="light" />
      {region && (
        <MapView provider={PROVIDER_GOOGLE} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '60%' }} initialRegion={region} showsUserLocation showsMyLocationButton={false} toolbarEnabled={false}
          accessibilityLabel="Navigation map to the customer">
          <Marker coordinate={toLatLng(dest)} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false} title={o.gpsCode}><Pin /></Marker>
          {me && <Polyline coordinates={[toLatLng(me), toLatLng(dest)]} strokeColor={color.primary} strokeWidth={6} lineDashPattern={[1]} />}
        </MapView>
      )}

      <Pressable onPress={navigate} accessibilityRole="button" accessibilityLabel="Open turn-by-turn navigation in Google Maps"
        style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, backgroundColor: color.ink, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Icon name="turnRight" size={28} color="#FFFFFF" strokeWidth={2.5} />
        <View style={{ flex: 1 }}>
          <Text size={18} weight={800} tone="#FFFFFF">Head to {o.gpsCode}</Text>
          <Text size={12} tone="rgba(255,255,255,0.8)">{leftKm.toFixed(1)} km left · tap for turn-by-turn</Text>
        </View>
        <Icon name="navigate" size={22} color="#FFFFFF" fill="#FFFFFF" />
      </Pressable>

      <View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '70%' }, shadow.sheet]}>
        <ScrollView contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 14 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: color.lineIdle }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text size={13} weight={800} tone={color.inkMuted}>#{o.orderNo} · {itemCount(o)} items</Text>
            <View style={{ height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: chip.bg, justifyContent: 'center' }}>
              <Text size={12} weight={800} tone={chip.fg}>{chip.label}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
              <Text size={14} weight={800} tone={color.primary}>{initials(o.customerName)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text size={16} weight={700}>{firstNameInitial(o.customerName) || 'Customer'}</Text>
              <Text size={12} tone={color.inkMuted}>{[o.gpsCode, o.landmark].filter(Boolean).join(' · ')}</Text>
              {o.riderNote && <Text size={12} weight={600} tone={color.warningInk}>“{o.riderNote}”</Text>}
            </View>
            {o.customerPhone && <IconButton icon="phone" label="Call customer" onPress={() => Linking.openURL(`tel:+${o.customerPhone!.replace(/\D/g, '')}`)} />}
          </View>

          {queued && <Banner tone="warning" icon="refresh">Waiting for network to send the delivery code…</Banner>}
          {msg && <Banner tone={msg.tone} icon="alert">{msg.text}</Banner>}

          {o.status === 'en_route' && <Button title="I’ve arrived" height={58} size={17} weight={800} loading={busy} onPress={arrived} />}

          {o.status === 'arrived' && !locked && (
            <View style={{ gap: 10 }}>
              <Text size={14} weight={700}>Ask the customer for their 4-digit delivery code</Text>
              <Pressable onPress={() => input.current?.focus()} accessibilityLabel="Delivery code">
                <CodeBoxes value={code} length={4} size={24} />
              </Pressable>
              <TextInput ref={input} value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" autoFocus maxLength={4}
                style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }} accessibilityElementsHidden importantForAccessibility="no" />
              {demoHint && <Text size={12} tone={color.inkMuted}>Demo: the customer’s code is {demoHint}</Text>}
              <Button title="Confirm delivery" height={58} size={17} weight={800} loading={busy} disabled={code.length !== 4 || queued} onPress={verify} />
              <Button title="Customer not here? Report a problem" variant="ghost" height={40} size={13} onPress={() => setReporting(true)} />
            </View>
          )}

          {(locked || o.status === 'delivery_failed') && (
            <View style={{ gap: 10 }}>
              <Text size={14} lh={1.5} tone={color.inkMuted}>The kitchen can complete this delivery for you once they’ve confirmed with the customer.</Text>
              <Button title="Contact vendor" icon="phone" variant="dark" onPress={async () => { const k = await backend.kitchenStatus(); if (k.vendorPhone) void Linking.openURL(`tel:+${k.vendorPhone.replace(/\D/g, '')}`); }} />
            </View>
          )}

          {o.status === 'delivered' && (
            <View style={{ alignItems: 'center', gap: 8, paddingVertical: 6 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: color.success, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={28} color="#FFFFFF" strokeWidth={3} />
              </View>
              <Text size={18} weight={800}>Delivered — nice work!</Text>
              <Button title="Back to kitchen" variant="dark" height={54} size={15} onPress={() => router.replace('/rider')} style={{ alignSelf: 'stretch', marginTop: 6 }} />
            </View>
          )}
        </ScrollView>
      </View>

      <ReasonSheet
        visible={reporting}
        title="What happened?"
        presets={['Customer not answering', 'Wrong address', 'Customer refused order', 'Can’t reach the location']}
        confirm="Report problem"
        onCancel={() => setReporting(false)}
        onSubmit={async (reason) => {
          try { await backend.markFailed(o.id, reason); setReporting(false); await stopDeliveryTracking(); await reload(); }
          catch (e) { setMsg({ tone: 'error', text: (e as Error).message }); setReporting(false); }
        }}
      />
    </View>
  );
}
