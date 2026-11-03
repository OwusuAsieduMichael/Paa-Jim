import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { BackButton, Banner, Button } from '@/components/ui';
import { color, font, shadow } from '@/theme';
import { groupLocal, toE164Ghana } from '@/lib/phone';
import { useSession } from '@/stores/session';
import { backend, BackendError } from '@/backend';

// 03 · Login (phone)
export default function Phone() {
  const insets = useSafeAreaInsets();
  const setPendingPhone = useSession((s) => s.setPendingPhone);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const e164 = toE164Ghana(value);

  async function send() {
    if (!e164) return setError('Enter your 9-digit number, e.g. 24 123 4567');
    setBusy(true);
    setError(null);
    try {
      await backend.sendOtp(e164);
      setPendingPhone(e164);
      router.push('/verify');
    } catch (e) {
      setError(e instanceof BackendError ? e.message : 'Could not send the code. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#FFFFFF' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: color.primary, paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: 64, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, gap: 22 }}>
          <BackButton bg="rgba(255,255,255,0.18)" fg="#FFFFFF" />
          <View style={{ gap: 8 }}>
            <Text size={30} weight={800} tone="#FFFFFF" ls={-0.02} accessibilityRole="header">Sign in</Text>
            <Text size={15} tone="rgba(255,255,255,0.92)" lh={1.5}>Enter your phone number. We’ll text you a 6-digit code — no password needed.</Text>
          </View>
        </View>

        <View style={[{ marginTop: -34, marginHorizontal: 20, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20, paddingTop: 24, gap: 18 }, shadow.card]}>
          <View style={{ gap: 8 }}>
            <Text size={13} weight={700} nativeID="phoneLabel">Phone number</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ height: 54, paddingHorizontal: 14, borderRadius: 14, backgroundColor: color.canvas, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 22, height: 15, borderRadius: 2, overflow: 'hidden' }} accessibilityLabel="Ghana">
                  <View style={{ flex: 1, backgroundColor: '#CE1126' }} /><View style={{ flex: 1, backgroundColor: '#FCD116' }} /><View style={{ flex: 1, backgroundColor: '#006B3F' }} />
                </View>
                <Text size={15} weight={600}>+233</Text>
              </View>
              <TextInput
                accessibilityLabelledBy="phoneLabel"
                value={value}
                onChangeText={(t) => { setValue(groupLocal(t)); setError(null); }}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                placeholder="24 123 4567"
                placeholderTextColor="#9A928E"
                maxLength={11}
                autoFocus
                onSubmitEditing={send}
                style={{ flex: 1, minWidth: 0, height: 54, borderRadius: 14, borderWidth: 1.5, borderColor: color.primary, paddingHorizontal: 16, fontFamily: font[600], fontSize: 16, color: color.ink }}
              />
            </View>
            <Text size={12} tone={color.inkMuted}>Use the number on your MoMo wallet — it makes paying faster.</Text>
          </View>
          {error && <Banner tone="error" icon="alert">{error}</Banner>}
          <Button title="Send code" onPress={send} loading={busy} disabled={!e164} />
        </View>

        <View style={{ paddingHorizontal: 28, paddingTop: 28, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: color.border }} />
            <Text size={13} tone={color.inkMuted}>Why phone sign-in?</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: color.border }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: color.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="shield" size={18} color={color.primary} />
            </View>
            <Text size={13} lh={1.5} tone={color.inkMuted} style={{ flex: 1 }}>
              <Text size={13} weight={700}>No passwords to forget.</Text> Your rider can also call you when they arrive.
            </Text>
          </View>
        </View>

        <Text size={12} tone={color.inkMuted} align="center" style={{ marginTop: 'auto', marginBottom: insets.bottom + 28, paddingTop: 24 }}>
          Vendor or rider? Use the number Paa Jim registered for you.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
