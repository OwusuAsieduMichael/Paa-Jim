import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { Icon, type IconName } from '@/components/Icon';
import { color } from '@/theme';
import { initials, prettyPhone } from '@/lib/phone';
import { LEGAL_URL, SUPPORT_PHONE } from '@/lib/config';
import { useLoad } from '@/hooks/data';
import { useSession } from '@/stores/session';
import { backend } from '@/backend';

// 17 · Account
export default function Account() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useSession();
  const orders = useLoad(() => backend.myOrders(), [], { refetchOnFocus: true });
  const addresses = useLoad(() => backend.addresses(), [], { refetchOnFocus: true });
  const last = orders.data?.find((o) => o.momoNetwork);

  const rows: Array<{ label: string; meta?: string; icon: IconName; onPress: () => void }> = [
    { label: 'Edit profile', icon: 'user', onPress: () => router.push('/profile-setup') },
    { label: 'Saved addresses', meta: addresses.data?.map((a) => a.label).join(', '), icon: 'pin', onPress: () => router.push('/profile-setup?mode=address') },
    { label: 'MoMo wallets', meta: last ? `${last.momoNetwork?.toUpperCase()} ··· ${last.momoLast4}` : undefined, icon: 'wallet', onPress: () => Alert.alert('MoMo wallets', 'You choose your network and number each time you pay. Paa Jim never stores your PIN.') },
    { label: 'Notifications', meta: 'On', icon: 'bell', onPress: () => Linking.openSettings() },
    { label: 'Refund policy', icon: 'refresh', onPress: () => Alert.alert('Refund policy', 'If the kitchen can’t accept your order within 8 minutes, or rejects it, your full payment goes back to the same MoMo wallet automatically — usually within 24 hours.') },
    { label: 'Help & contact', icon: 'help', onPress: () => Linking.openURL(`tel:${SUPPORT_PHONE}`) },
    { label: 'Privacy & terms', icon: 'shieldPlain', onPress: () => Linking.openURL(`${LEGAL_URL}/privacy`) },
  ];

  function confirmDelete() {
    // Required in-app route (Apple 5.1.1(v), Google Play). The web route is LEGAL_URL/delete-account.
    Alert.alert(
      'Delete your account?',
      'This removes your profile, addresses and device tokens. Order records are kept for tax and refund purposes as described in the privacy policy.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Request deletion', style: 'destructive', onPress: () => Linking.openURL(`${LEGAL_URL}/delete-account?phone=${encodeURIComponent(user?.phone ?? '')}`) },
      ],
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#FFFFFF' }} contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 24 }}>
      <View style={{ paddingHorizontal: 20, alignItems: 'center', gap: 8 }}>
        <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: color.primaryTint, borderWidth: 3, borderColor: color.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text size={28} weight={800} tone={color.primary}>{initials(user?.fullName)}</Text>
        </View>
        <Text size={22} weight={800} style={{ marginTop: 4 }}>{user?.fullName}</Text>
        <Text size={14} tone={color.inkMuted}>{prettyPhone(user?.phone)}</Text>
      </View>

      <View style={{ marginTop: 18, marginHorizontal: 20, flexDirection: 'row', gap: 10 }}>
        {[
          { n: orders.data?.length ?? 0, l: 'Orders' },
          { n: addresses.data?.length ?? 0, l: 'Addresses' },
          { n: orders.data?.filter((o) => o.rated).length ?? 0, l: 'Reviews' },
        ].map((s) => (
          <View key={s.l} style={{ flex: 1, padding: 12, borderRadius: 16, backgroundColor: color.canvas, alignItems: 'center', gap: 2 }}>
            <Text size={18} weight={800}>{s.n}</Text>
            <Text size={11} weight={600} tone={color.inkMuted}>{s.l}</Text>
          </View>
        ))}
      </View>

      <View style={{ paddingTop: 14, paddingHorizontal: 20 }}>
        {rows.map((r) => (
          <Pressable key={r.label} onPress={r.onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, height: 56, borderBottomWidth: 1, borderBottomColor: color.divider }}>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: color.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={r.icon} size={18} color={color.primary} />
            </View>
            <Text size={15} weight={600} style={{ flex: 1 }}>{r.label}</Text>
            {r.meta ? <Text size={12} tone={color.inkMuted}>{r.meta}</Text> : null}
            <Icon name="chevron" size={16} color={color.disabled} />
          </Pressable>
        ))}
      </View>

      <View style={{ paddingTop: 16, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable onPress={() => void signOut()} accessibilityRole="button" style={{ height: 44, paddingHorizontal: 18, borderRadius: 22, borderWidth: 1.5, borderColor: color.primary, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="logout" size={18} color={color.primary} />
          <Text size={14} weight={700} tone={color.primary}>Log out</Text>
        </Pressable>
        <Pressable onPress={confirmDelete} hitSlop={10} style={{ height: 44, justifyContent: 'center' }}>
          <Text size={13} weight={600} tone={color.inkMuted}>Delete account</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
