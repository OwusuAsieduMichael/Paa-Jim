import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, View } from 'react-native';
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
import { AvatarPicker } from '@/components/Avatar';
import { prettyPhone } from '@/lib/phone';

const DEFAULT_PIN = { lat: 6.8426, lng: -1.3977 }; // Effiduase town centre

// 05 · Profile setup — also "Saved addresses" / "Change" from checkout (mode=address)
export default function ProfileSetup() {
  const insets = useSafeAreaInsets();
  const { mode } = useLocalSearchParams<{ mode?: 'address' }>();
  const addressOnly = mode === 'address';
  const { user, setUser } = useSession();
  // Sign-up collects the name, so this screen is mostly "Edit profile" now.
  const editing = Boolean(user?.fullName);

  const [name, setName] = useState(user?.fullName ?? '');
  const [gps, setGps] = useState('');
  const [landmark, setLandmark] = useState('');
  const [label, setLabel] = useState<Address['label']>('Home');
  const [pos, setPos] = useState(DEFAULT_PIN);
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
    if (locating) return;
    setLocating(true);
    setError(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        if (!perm.canAskAgain) {
          // iOS/Android won't show the prompt again once refused: only Settings can turn it on.
          Alert.alert('Location is off for Paa Jim', 'Turn on location in Settings, or tap the map to place your pin.', [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => void Linking.openSettings() },
          ]);
        }
        setError('Location permission is off — tap the map to place your pin instead.');
        return;
      }
      if (!(await Location.hasServicesEnabledAsync())) {
        setError('Your phone’s location (GPS) is switched off. Turn it on, or tap the map to place your pin.');
        return;
      }
      // Instant answer if the phone already knows roughly where it is…
      const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }).catch(() => null);
      if (last) setPos({ lat: last.coords.latitude, lng: last.coords.longitude });
      // …then a fresh fix, but never wait forever (indoors a GPS fix can take minutes).
      const fresh = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
      ]);
      if (fresh) setPos({ lat: fresh.coords.latitude, lng: fresh.coords.longitude });
      else if (!last) setError('Couldn’t find you quickly — move near a window, or tap the map to place your pin.');
    } catch {
      setError('Could not get your location. Tap the map to place your pin.');
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    if (!addressOnly && name.trim().length < 2) return setError('Enter your name so the rider knows who to ask for.');
    if (!/^[A-Za-z]{2}-?\d{3,4}-?\d{3,4}$/.test(gps.trim())) return setError('Enter your Ghana Post GPS address, e.g. AS-485-9302');
    setBusy(true);
    setError(null);
    try {
      if (!addressOnly) {
        await backend.updateName(name.trim());
        if (user) setUser({ ...user, fullName: name.trim() });
      }
      await backend.saveAddress({ id: existingId, label, gpsCode: gps, landmark: landmark.trim() || null, lat: pos.lat, lng: pos.lng, isDefault: true });
      if ((addressOnly || editing) && router.canGoBack()) router.back();
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
        </View>
        <Text size={28} weight={800} ls={-0.02} style={{ marginTop: 26, marginBottom: 6 }} accessibilityRole="header">
          {addressOnly ? 'Delivery address' : editing ? 'Edit profile' : 'Almost there'}
        </Text>
        <Text size={15} tone={color.inkMuted} lh={1.5}>
          {addressOnly ? 'Where should the rider bring your food?' : editing ? 'Your photo, name, phone number and delivery address.' : 'Tell us who you are and where to bring your food.'}
        </Text>

        <View style={{ paddingTop: 24, gap: 16 }}>
          {!addressOnly && editing && (
            <View style={{ alignItems: 'center', gap: 6, paddingBottom: 4 }}>
              <AvatarPicker size={96} ring={color.primary} />
              <Text size={12} tone={color.inkMuted}>{user?.avatarUrl ? 'Tap to change your photo' : 'Add a photo so your rider knows who to look for'}</Text>
            </View>
          )}
          {!addressOnly && (
            <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Michael Asiedu"
              focused={focus === 'name'} onFocus={() => setFocus('name')} onBlur={() => setFocus(null)} />
          )}
          {!addressOnly && editing && (
            <View style={{ gap: 8 }}>
              <Text size={13} weight={700}>Phone number</Text>
              <Pressable onPress={() => router.push('/customer/change-phone')} accessibilityRole="button" accessibilityLabel={`Phone number ${prettyPhone(user?.phone)}. Change`}
                style={{ height: 54, borderRadius: 14, backgroundColor: color.canvas, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name="phone" size={18} color={color.inkMuted} />
                <Text size={16} weight={600} style={{ flex: 1 }}>{prettyPhone(user?.phone)}</Text>
                <Text size={13} weight={700} tone={color.primary}>Change</Text>
              </Pressable>
              <Text size={12} tone={color.inkMuted}>You log in with this number. Changing it needs a code sent to the new number.</Text>
            </View>
          )}
          {!addressOnly && editing && (
            <Text size={17} weight={800} style={{ marginTop: 8 }}>Delivery address</Text>
          )}
          <Field label="Ghana Post GPS address" value={gps} onChangeText={(t) => setGps(t.toUpperCase())} autoCapitalize="characters" placeholder="AS-485-9302"
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

        <Button title={addressOnly ? 'Save address' : editing ? 'Save changes' : 'Save & start ordering'} onPress={save} loading={busy} style={{ marginTop: 'auto' }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
