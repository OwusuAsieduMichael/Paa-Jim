import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Text } from '@/components/Text';
import { Banner, Button, Field } from '@/components/ui';
import { AuthCard, AuthHeader, PhoneField, TermsCheckbox } from '@/components/auth';
import { color } from '@/theme';
import { groupLocal, toE164Ghana } from '@/lib/phone';
import { useSession } from '@/stores/session';
import { backend, BackendError } from '@/backend';

// paajim-auth · Signup — name + phone + terms → SMS code
export default function Signup() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ phone?: string }>();
  const setPending = useSession((s) => s.setPending);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(params.phone ? groupLocal(params.phone.replace(/^233/, '')) : '');
  const [agreed, setAgreed] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const e164 = toE164Ghana(phone);
  const fullName = name.trim().replace(/\s+/g, ' ');

  async function send() {
    if (fullName.length < 2) return setError('Enter your full name so the rider knows who to ask for.');
    if (!e164) return setError('Enter your 9-digit number, e.g. 24 123 4567');
    if (!agreed) return setError('Please agree to the Terms and Privacy Policy to continue.');
    setBusy(true);
    setError(null);
    const intent = { mode: 'signup' as const, fullName };
    try {
      await backend.sendOtp(e164, intent);
      setPending({ phone: e164, intent });
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
        <AuthHeader title="Create account" subtitle="Just your name and number. No password to remember." onBack={() => router.replace('/welcome')} />

        <AuthCard>
          <Field
            label="Full name"
            value={name}
            onChangeText={(t) => { setName(t); setError(null); }}
            autoComplete="name"
            textContentType="name"
            autoCapitalize="words"
            placeholder="Michael Asiedu"
            maxLength={80}
            returnKeyType="next"
            focused={nameFocused}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            style={{ height: 54, fontSize: 16 }}
          />
          <PhoneField
            value={phone}
            onChange={(v) => { setPhone(v); setError(null); }}
            hint="Use the number on your MoMo wallet — it makes paying faster."
            autoComplete="tel-national"
          />
          <TermsCheckbox checked={agreed} onChange={(v) => { setAgreed(v); setError(null); }} />
          {error && <Banner tone="error" icon="alert">{error}</Banner>}
          {/* Always tappable: send() says exactly what's missing instead of a silently grey button. */}
          <Button title="Send code" onPress={send} loading={busy} />
        </AuthCard>

        <View style={{ marginTop: 'auto', paddingTop: 24, paddingBottom: insets.bottom + 36, alignItems: 'center' }}>
          <Text size={14} tone={color.inkMuted}>
            Already have an account?{' '}
            <Text size={14} weight={700} tone={color.primary} onPress={() => router.replace('/login')} accessibilityRole="link">Log in</Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
