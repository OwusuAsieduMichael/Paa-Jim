import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Text } from './Text';
import { Icon } from './Icon';
import { color } from '@/theme';
import { initials } from '@/lib/phone';
import { useSession } from '@/stores/session';
import { backend, BackendError } from '@/backend';

/** Round profile photo, or initials when there's no photo (or it fails to load). */
export function Avatar({ url, name, size = 44, bg = color.primaryTint, fg = color.primary, ring }: {
  url?: string | null; name?: string | null; size?: number; bg?: string; fg?: string; ring?: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [url]);
  const show = url && !broken;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: ring ? 2 : 0, borderColor: ring }}>
      {show
        ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} onError={() => setBroken(true)} accessibilityLabel={name ? `Photo of ${name}` : 'Profile photo'} />
        : <Text size={Math.round(size * 0.36)} weight={800} tone={fg}>{initials(name)}</Text>}
    </View>
  );
}

/** Square-crop, shrink to 512 px JPEG (~50 KB) so uploads are quick on mobile data. */
async function shrink(uri: string) {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: 512 });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
  return out.uri;
}

/** The signed-in user's photo with a camera badge: take a photo, pick one, or remove it. */
export function AvatarPicker({ size = 72, bg, fg, ring }: { size?: number; bg?: string; fg?: string; ring?: string }) {
  const { user, setUser } = useSession();
  const [busy, setBusy] = useState(false);

  async function apply(uri: string | null) {
    setBusy(true);
    try {
      const u = await backend.setAvatar(uri ? await shrink(uri) : null);
      setUser(u);
    } catch (e) {
      Alert.alert('Photo not saved', e instanceof BackendError ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function fromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera is off for Paa Jim', 'Allow the camera in Settings to take a profile photo, or choose one from your gallery.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ]);
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8, cameraType: ImagePicker.CameraType.front });
    if (!r.canceled && r.assets[0]) await apply(r.assets[0].uri);
  }

  async function fromLibrary() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!r.canceled && r.assets[0]) await apply(r.assets[0].uri);
  }

  function choose() {
    if (busy) return;
    Alert.alert('Profile photo', 'A clear photo of your face helps riders and customers find each other.', [
      { text: 'Take a photo', onPress: () => void fromCamera() },
      { text: 'Choose from gallery', onPress: () => void fromLibrary() },
      ...(user?.avatarUrl ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: () => void apply(null) }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  const badge = Math.max(24, Math.round(size * 0.34));
  return (
    <Pressable onPress={choose} accessibilityRole="button" accessibilityLabel={user?.avatarUrl ? 'Change profile photo' : 'Add profile photo'} hitSlop={6}>
      <Avatar url={user?.avatarUrl} name={user?.fullName} size={size} bg={bg} fg={fg} ring={ring} />
      {busy && (
        <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      )}
      <View style={{ position: 'absolute', right: -2, bottom: -2, width: badge, height: badge, borderRadius: badge / 2, backgroundColor: color.primary, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="camera" size={Math.round(badge * 0.55)} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}
