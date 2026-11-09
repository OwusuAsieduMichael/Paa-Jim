import { useEffect, useRef } from 'react';
import { Alert, Animated, Easing, Linking, Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { Avatar } from './Avatar';
import { color } from '@/theme';
import { LEGAL_URL } from '@/lib/config';
import { prettyPhone } from '@/lib/phone';
import { useSession } from '@/stores/session';

/** Hamburger menu for the customer home: slides in from the right. */
export function CustomerMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user, signOut } = useSession();
  const panel = Math.min(width * 0.8, 340);
  const x = useRef(new Animated.Value(panel)).current;

  useEffect(() => {
    if (visible) Animated.timing(x, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    else x.setValue(panel);
  }, [visible, panel, x]);

  function go(href: Href) {
    onClose();
    router.push(href);
  }

  function logOut() {
    Alert.alert('Log out?', 'You can log back in any time with your phone number.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => { onClose(); void signOut(); } },
    ]);
  }

  const items: Array<{ label: string; icon: IconName; onPress: () => void }> = [
    { label: 'Account', icon: 'user', onPress: () => go('/customer/account') },
    { label: 'MoMo wallets', icon: 'wallet', onPress: () => go('/customer/wallets') },
    { label: 'Help & contact', icon: 'help', onPress: () => go('/customer/help') },
    { label: 'Privacy & terms', icon: 'shieldPlain', onPress: () => { onClose(); void Linking.openURL(`${LEGAL_URL}/privacy`); } },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} accessibilityLabel="Close menu" />
      <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: panel, backgroundColor: '#FFFFFF', paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20, paddingHorizontal: 20, transform: [{ translateX: x }], borderTopLeftRadius: 24, borderBottomLeftRadius: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: color.divider }}>
          <Avatar url={user?.avatarUrl} name={user?.fullName} size={52} ring={color.primary} />
          <View style={{ flex: 1 }}>
            <Text size={16} weight={800} numberOfLines={1}>{user?.fullName}</Text>
            <Text size={12} tone={color.inkMuted}>{prettyPhone(user?.phone)}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close menu"
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: color.canvas, alignItems: 'center', justifyContent: 'center' }}>
            <Text size={18} weight={700} tone={color.inkMuted}>×</Text>
          </Pressable>
        </View>

        <View style={{ paddingTop: 8 }}>
          {items.map((it) => (
            <Pressable key={it.label} onPress={it.onPress} accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, height: 56, borderRadius: 14, paddingHorizontal: 8, backgroundColor: pressed ? color.canvas : 'transparent' })}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: color.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={it.icon} size={18} color={color.primary} />
              </View>
              <Text size={15} weight={600} style={{ flex: 1 }}>{it.label}</Text>
              <Icon name="chevron" size={16} color={color.disabled} />
            </Pressable>
          ))}
        </View>

        <Pressable onPress={logOut} accessibilityRole="button"
          style={{ marginTop: 'auto', height: 50, borderRadius: 25, borderWidth: 1.5, borderColor: color.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon name="logout" size={18} color={color.primary} />
          <Text size={15} weight={700} tone={color.primary}>Log out</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}
