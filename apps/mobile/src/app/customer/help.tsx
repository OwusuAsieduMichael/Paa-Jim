import { Alert, Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { BackButton } from '@/components/ui';
import { color } from '@/theme';
import { SUPPORT_PHONE, SUPPORT_WHATSAPP } from '@/lib/config';
import { prettyPhone } from '@/lib/phone';

// Account → Help & contact: call the support line or chat on WhatsApp.
export default function Help() {
  const insets = useSafeAreaInsets();

  async function call() {
    const url = `tel:${SUPPORT_PHONE}`;
    try { await Linking.openURL(url); }
    catch { Alert.alert('Can’t start a call', `Dial ${prettyPhone(SUPPORT_PHONE)} from your phone app.`); }
  }

  async function whatsapp() {
    const text = encodeURIComponent('Hello Paa Jim, I need help with my order.');
    // The app link opens WhatsApp directly; the web link is the fallback when it isn't installed.
    try { await Linking.openURL(`whatsapp://send?phone=${SUPPORT_WHATSAPP}&text=${text}`); }
    catch {
      try { await Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}?text=${text}`); }
      catch { Alert.alert('WhatsApp isn’t available', `Message ${prettyPhone(SUPPORT_WHATSAPP)} on WhatsApp.`); }
    }
  }

  const options = [
    { key: 'call', icon: 'phone' as const, title: 'Call us', sub: prettyPhone(SUPPORT_PHONE), note: 'Talk to Paa Jim support now', bg: color.primary, onPress: call },
    { key: 'wa', icon: 'whatsapp' as const, title: 'Chat on WhatsApp', sub: prettyPhone(SUPPORT_WHATSAPP), note: 'Send a message, photo or voice note', bg: '#25D366', onPress: whatsapp },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#FFFFFF' }} contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <BackButton />
        <Text size={22} weight={800} accessibilityRole="header">Help & contact</Text>
      </View>
      <Text size={14} lh={1.5} tone={color.inkMuted}>
        Problem with an order, a payment or your account? We’re here from 10 AM to 7 PM, every day. Have your order number ready (e.g. #PJ-1042).
      </Text>

      {options.map((o) => (
        <Pressable key={o.key} onPress={() => void o.onPress()} accessibilityRole="button" accessibilityLabel={`${o.title}, ${o.sub}`}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 18, borderWidth: 1.5, borderColor: color.border, backgroundColor: pressed ? color.canvas : '#FFFFFF' })}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: o.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={o.icon} size={24} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text size={16} weight={800}>{o.title}</Text>
            <Text size={15} weight={700} tone={color.primary}>{o.sub}</Text>
            <Text size={12} tone={color.inkMuted}>{o.note}</Text>
          </View>
          <Icon name="chevron" size={18} color={color.disabled} />
        </Pressable>
      ))}
    </ScrollView>
  );
}
