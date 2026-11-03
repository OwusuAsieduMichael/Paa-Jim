import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { BackButton, Banner, Button, Chip, Field } from '@/components/ui';
import { MiniMap } from '@/components/MiniMap';
import { color } from '@/theme';
import { useSession } from '@/stores/session';
import { backend, type Address } from '@/backend';

const ACCRA = { lat: 5.629, lng: -0.187 };

// 05 · Profile setup — also "Saved addresses" / "Change" from checkout (mode=address)
export default function ProfileSetup() {
  const insets = useSafeAreaInsets();
  const { mode } = useLocalSearchParams<{ mode?: 'address' }>();
  const addressOnly = mode === 'address';
  const { user, setUser } = useSession();

  const [name, setName] = useState(user?.fullName ?? '');
  const [gps, setGps] = useState('');
  const [landmark, setLandmark] = useState('');
  const [label, setLabel] = useState<Address['label']>('Home');
  const [pos, setPos] = useState(ACCRA);
  const [existingId, setExistingId] = useState<string | undefined>();
  const [focus, setFocus] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    backend.addresses().then((list) => {
      const a = list.find((x) => x.isDefault) ?? list[0];
      if (!a) return;
      setExistingId(a.id); setGps(a.gpsCode); setLandmark(a.landmark ?? ''); setLabel(a.label); setPos({ lat: a.lat, lng: a.lng });
    }).catch(() => {});
  }, []);

  async function locate() {
    setLocating(true);
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { setError('Location permission is off — tap the map to place your pin instead.'); return; }
      const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPos({ lat: l.coords.latitude, lng: l.coords.longitude });
    } catch {
      setError('Could not get your location. Tap the map to place your pin.');
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    if (!addressOnly && name.trim().length < 2) return setError('Enter your name so the rider knows who to ask for.');
    if (!/^[A-Za-z]{2}-?\d{3,4}-?\d{3,4}$/.test(gps.trim())) return setError('Enter your Ghana Post GPS address, e.g. AK-485-9302');
    setBusy(true);
    setError(null);
    try {
      if (!addressOnly) {
        await backend.updateName(name.trim());
        if (user) setUser({ ...user, fullName: name.trim() });
      }
      await backend.saveAddress({ id: existingId, label, gpsCode: gps, landmark: landmark.trim() || null, lat: pos.lat, lng: pos.lng, isDefault: true });
      if (addressOnly && router.canGoBack()) router.back();
      else router.replace('/customer');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#FFFFFF' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))} />
          {!addressOnly && (
            <>
              <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: '#F2E6E6', overflow: 'hidden' }}>
                <View style={{ width: '100%', height: 6, backgroundColor: color.primary }} />
              </View>
              <Text size={12} weight={700} tone={color.inkMuted}>Step 3 of 3</Text>
            </>
          )}
        </View>
        <Text size={28} weight={800} ls={-0.02} style={{ marginTop: 26, marginBottom: 6 }} accessibilityRole="header">
          {addressOnly ? 'Delivery address' : 'Almost there'}
        </Text>
        <Text size={15} tone={color.inkMuted} lh={1.5}>
          {addressOnly ? 'Where should the rider bring your food?' : 'Tell us who you are and where to bring your food.'}
        </Text>

        <View style={{ paddingTop: 24, gap: 16 }}>
          {!addressOnly && (
            <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Ama Mensah"
              focused={focus === 'name'} onFocus={() => setFocus('name')} onBlur={() => setFocus(null)} />
          )}
          <Field label="Ghana Post GPS address" value={gps} onChangeText={(t) => setGps(t.toUpperCase())} autoCapitalize="characters" placeholder="AK-485-9302"
            focused={focus === 'gps'} onFocus={() => setFocus('gps')} onBlur={() => setFocus(null)} />
          <View style={{ height: 150 }}>
            <MiniMap lat={pos.lat} lng={pos.lng} style={{ flex: 1 }} onPress={setPos} />
            <Pressable onPress={locate} accessibilityRole="button" style={{ position: 'absolute', right: 10, bottom: 10, height: 36, borderRadius: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="locate" size={16} color={color.primary} />
              <Text size={12} weight={700} tone={color.primary}>{locating ? 'Locating…' : 'Use my location'}</Text>
            </Pressable>
          </View>
          <Field label="Landmark / directions for the rider" value={landmark} onChangeText={setLandmark} placeholder="Blue gate opposite the church"
            style={{ fontFamily: 'PlusJakartaSans_400Regular' }} focused={focus === 'lm'} onFocus={() => setFocus('lm')} onBlur={() => setFocus(null)} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['Home', 'Work', 'Other'] as const).map((l) => <Chip key={l} label={l} on={label === l} onPress={() => setLabel(l)} />)}
          </View>
          {error && <Banner tone="error" icon="alert">{error}</Banner>}
        </View>

        <Button title={addressOnly ? 'Save address' : 'Save & start ordering'} onPress={save} loading={busy} style={{ marginTop: 'auto' }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
