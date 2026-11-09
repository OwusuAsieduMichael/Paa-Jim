import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { BackButton, Banner, Button } from '@/components/ui';
import { PhoneField, useResendTimer } from '@/components/auth';
import { color, font } from '@/theme';
import { prettyPhone, toE164Ghana } from '@/lib/phone';
import { useSession } from '@/stores/session';
import { backend, BackendError } from '@/backend';

// paajim-auth · ChangePhone — new number → code to the new number → confirmed
export default function ChangePhone() {
  const insets = useSafeAreaInsets();
  const { user, setUser } = useSession();
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resend = useResendTimer(60);
  const e164 = toE164Ghana(phone);
  const same = e164 !== null && e164 === user?.phone;

  async function sendCode() {
    if (!e164) return setError('Enter your 9-digit number, e.g. 55 987 6543');
    if (same) return setError('That’s already your number.');
    setBusy(true);
    setError(null);
    try {
      await backend.requestPhoneChange(e164);
      setCode('');
      resend.restart();
      setStep(2);
    } catch (e) {
      setError(e instanceof BackendError ? e.message : 'Could not send the code. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!e164 || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const u = await backend.confirmPhoneChange(e164, code);
      setUser(u);
      Alert.alert('Number updated', `You’ll log in with ${prettyPhone(e164)} from now on.`);
      if (router.canGoBack()) router.back(); else router.replace('/customer/account');
    } catch (e) {
      setError(e instanceof BackendError ? e.message : 'Could not confirm. Try again.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    if (resend.left > 0) return;
    await sendCode();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#FFFFFF' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <BackButton onPress={() => (step === 2 ? (setStep(1), setError(null)) : router.back())} />
          <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
            <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: color.primary }} />
            <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: step === 2 ? color.primary : '#F2E6E6' }} />
          </View>
          <Text size={12} weight={700} tone={color.inkMuted}>Step {step} of 2</Text>
        </View>

        {step === 1 ? (
          <View style={{ gap: 20, paddingTop: 28 }}>
            <View style={{ gap: 8 }}>
              <Text size={28} weight={800} ls={-0.02} accessibilityRole="header">Change phone number</Text>
              <Text size={15} lh={1.5} tone={color.inkMuted}>Your orders, addresses and favourites move to the new number.</Text>
            </View>
            <View style={{ padding: 14, borderRadius: 14, backgroundColor: color.canvas, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text size={14} tone={color.inkMuted}>Current number</Text>
              <Text size={14} weight={700}>{prettyPhone(user?.phone)}</Text>
            </View>
            <PhoneField label="New phone number" flag={false} value={phone} onChange={(v) => { setPhone(v); setError(null); }} placeholder="55 987 6543" autoFocus onSubmitEditing={sendCode} />
            {error && <Banner tone="error" icon="alert">{error}</Banner>}
            <Button title="Send code to new number" onPress={sendCode} loading={busy} />
          </View>
        ) : (
          <View style={{ gap: 18, paddingTop: 28 }}>
            <View style={{ gap: 8 }}>
              <Text size={28} weight={800} ls={-0.02} accessibilityRole="header">Confirm new number</Text>
              <Text size={15} lh={1.5} tone={color.inkMuted}>
                Enter the code we sent to <Text size={15} weight={700}>{prettyPhone(e164)}</Text>.
              </Text>
            </View>
            <View style={{ gap: 8 }}>
              <Text size={13} weight={700} nativeID="codeLabel">6-digit code</Text>
              <TextInput
                accessibilityLabelledBy="codeLabel"
                value={code}
                onChangeText={(t) => { setCode(t.replace(/\D/g, '').slice(0, 6)); setError(null); }}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={6}
                autoFocus
                onSubmitEditing={confirm}
                style={{ height: 54, borderRadius: 14, borderWidth: 1.5, borderColor: color.primary, paddingHorizontal: 16, fontFamily: font[800], fontSize: 20, letterSpacing: 6, color: color.ink }}
              />
              <View style={{ flexDirection: 'row' }}>
                <Text size={12} tone={color.inkMuted}>Expires in 5 min · </Text>
                <Pressable onPress={onResend} disabled={resend.left > 0} hitSlop={10} accessibilityRole="button">
                  <Text size={12} weight={700} tone={resend.left > 0 ? color.inkMuted : color.primary}>{resend.left > 0 ? resend.label : 'Resend code'}</Text>
                </Pressable>
              </View>
            </View>
            {error && <Banner tone="error" icon="alert">{error}</Banner>}
            <Button title="Confirm & update" onPress={confirm} loading={busy} disabled={code.length !== 6} />
            <Button title="Use a different number" variant="ghost" height={40} size={13} onPress={() => { setStep(1); setError(null); }} />
          </View>
        )}

        <View style={{ marginTop: 'auto', paddingTop: 24 }}>
          <View style={{ padding: 14, borderRadius: 14, backgroundColor: color.warningTint, flexDirection: 'row', gap: 10 }}>
            <Icon name="info" size={18} color={color.warningInk} />
            <Text size={12} lh={1.5} tone={color.warningText} style={{ flex: 1 }}>
              Also update your MoMo wallet number at checkout, so payment prompts reach the right phone.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
