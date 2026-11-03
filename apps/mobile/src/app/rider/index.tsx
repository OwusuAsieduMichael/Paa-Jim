import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from '@/components/Text';
import { Banner, Button, CodeBoxes, Keypad } from '@/components/ui';
import { LocationRationale } from '@/components/LocationRationale';
import { color } from '@/theme';
import { initials } from '@/lib/phone';
import { useLoad } from '@/hooks/data';
import { useSession } from '@/stores/session';
import { hasBackgroundPermission, requestRiderLocation, startDeliveryTracking } from '@/features/riderTracking';
import { backend } from '@/backend';

const RATIONALE_SEEN = 'paajim-location-rationale';

// 20 · Rider — claim by Pickup ID
export default function RiderClaim() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useSession();
  const today = useLoad(() => backend.riderToday(), [], { refetchOnFocus: true });
  const [code, setCode] = useState('');
  const [onShift, setOnShift] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRationale, setShowRationale] = useState(false);

  useEffect(() => { void backend.setOnShift(onShift).catch(() => {}); }, [onShift]);

  async function ensureLocation(): Promise<boolean> {
    if (await hasBackgroundPermission()) return true;
    const seen = await AsyncStorage.getItem(RATIONALE_SEEN);
    if (!seen) { setShowRationale(true); return false; }
    const r = await requestRiderLocation();
    if (r === 'denied') { setError('Location is off. The customer can’t see you coming — turn it on in Settings.'); }
    return true; // foreground-only still works while the app is open
  }

  async function claim() {
    if (code.length !== 6) return;
    if (!(await ensureLocation())) return;
    setBusy(true);
    setError(null);
    try {
      const r = await backend.claim(code);
      if (!r.ok) {
        setError(r.error === 'locked' ? r.message : `${r.message}${r.triesLeft != null ? ` ${r.triesLeft} tries left.` : ''}`);
        setCode('');
        return;
      }
      await startDeliveryTracking(r.orderId);
      setCode('');
      router.push(`/rider/delivery/${r.orderId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const t = today.data;
  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
        <View style={{ backgroundColor: color.primary, paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 22, gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable onLongPress={() => Alert.alert('Sign out?', '', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => void signOut() }])}
              accessibilityLabel="Profile. Long-press to sign out"
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
              <Text size={15} weight={800} tone={color.primary}>{initials(user?.fullName)}</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text size={12} tone="rgba(255,255,255,0.85)">Rider</Text>
              <Text size={17} weight={800} tone="#FFFFFF">{user?.fullName}</Text>
            </View>
            <Pressable onPress={() => setOnShift((s) => !s)} accessibilityRole="switch" accessibilityState={{ checked: onShift }}
              style={{ height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: onShift ? '#7CE39A' : '#D6D0CC' }} />
              <Text size={12} weight={700} tone="#FFFFFF">{onShift ? 'On shift' : 'Off shift'}</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)' }}>
              <Text size={20} weight={800} tone="#FFFFFF">{t?.deliveredToday ?? '–'}</Text>
              <Text size={11} tone="rgba(255,255,255,0.9)">Deliveries today</Text>
            </View>
            <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)' }}>
              <Text size={20} weight={800} tone="#FFFFFF">{t?.waitingAtKitchen ?? '–'}</Text>
              <Text size={11} tone="rgba(255,255,255,0.9)">Waiting at kitchen</Text>
            </View>
          </View>
        </View>

        {t?.activeOrderId && (
          <Banner tone="warning" icon="bike" style={{ marginTop: 16, marginHorizontal: 24 }}>
            <View style={{ gap: 8 }}>
              <Text size={13} weight={700} tone={color.warningText}>You have a delivery in progress.</Text>
              <Button title="Continue delivery" height={44} size={14} onPress={() => router.push(`/rider/delivery/${t.activeOrderId}`)} />
            </View>
          </Banner>
        )}

        <View style={{ paddingTop: 26, paddingHorizontal: 24, gap: 10 }}>
          <Text size={24} weight={800} accessibilityRole="header">Claim an order</Text>
          <Text size={14} lh={1.5} tone={color.inkMuted}>Enter the 6-digit Pickup ID the kitchen reads out to you.</Text>
        </View>
        <View style={{ paddingTop: 22, paddingHorizontal: 24 }}>
          <CodeBoxes value={code} length={6} height={58} size={24} gap={8} />
        </View>
        <Text size={12} tone={error ? color.primaryText : color.inkMuted} style={{ marginTop: 12, marginHorizontal: 24 }}>
          {error ?? '5 wrong tries locks claiming for 10 minutes.'}
        </Text>
        <View style={{ paddingTop: 20, paddingHorizontal: 24, paddingBottom: 16 }}>
          <Button title="Claim & start delivery" icon="bike" onPress={claim} loading={busy} disabled={code.length !== 6 || !onShift} />
        </View>
        <View style={{ marginTop: 'auto' }}>
          <Keypad onKey={(d) => { setError(null); setCode((c) => (c + d).slice(0, 6)); }} onDelete={() => setCode((c) => c.slice(0, -1))} />
        </View>
      </ScrollView>

      <LocationRationale
        visible={showRationale}
        onCancel={() => setShowRationale(false)}
        onContinue={async () => {
          setShowRationale(false);
          await AsyncStorage.setItem(RATIONALE_SEEN, '1');
          await requestRiderLocation();
          void claim();
        }}
      />
    </View>
  );
}
