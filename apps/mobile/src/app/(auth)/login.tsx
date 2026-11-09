import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { Banner, Button } from '@/components/ui';
import { AuthCard, AuthHeader, PhoneField } from '@/components/auth';
import { color } from '@/theme';
import { toE164Ghana } from '@/lib/phone';
import { useSession } from '@/stores/session';
import { backend, BackendError } from '@/backend';

// paajim-auth · Login — phone → SMS code. Never creates an account.
export default function Login() {
  const insets = useSafeAreaInsets();
  const setPending = useSession((s) => s.setPending);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noAccount, setNoAccount] = useState(false);
  const e164 = toE164Ghana(phone);

  async function send() {
    if (!e164) return setError('Enter your 9-digit number, e.g. 24 123 4567');
    setBusy(true);
    setError(null);
    setNoAccount(false);
    try {
      await backend.sendOtp(e164, { mode: 'login' });
      setPending({ phone: e164, intent: { mode: 'login' } });
      router.push('/verify');
    } catch (e) {
      if (e instanceof BackendError && e.code === 'no_account') setNoAccount(true);
      else setError(e instanceof BackendError ? e.message : 'Could not send the code. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#FFFFFF' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <AuthHeader title="Welcome back" subtitle="Enter your phone number and we’ll text you a 6-digit code." onBack={() => router.replace('/welcome')} />

        <AuthCard>
          <PhoneField
            value={phone}
            onChange={(v) => { setPhone(v); setError(null); setNoAccount(false); }}
            autoFocus
            onSubmitEditing={send}
            autoComplete="tel-national"
          />
          {noAccount && (
            <Banner tone="error" icon="alert">
              <Text size={13} lh={1.5} tone={color.primaryText}>
                No account with this number —{' '}
                <Text size={13} weight={700} tone={color.primary} accessibilityRole="link"
                  onPress={() => router.replace({ pathname: '/signup', params: { phone: e164 ?? '' } })}>
                  create one?
                </Text>
              </Text>
            </Banner>
          )}
          {error && <Banner tone="error" icon="alert">{error}</Banner>}
          <Button title="Send code" onPress={send} loading={busy} />
        </AuthCard>

        <View style={{ marginTop: 22, marginHorizontal: 24, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: color.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="shield" size={18} color={color.primary} />
          </View>
          <Text size={13} lh={1.5} tone={color.inkMuted} style={{ flex: 1 }}>
            <Text size={13} weight={700}>Changed your number?</Text> Log in with your old number and update it in Account. If you’ve lost the old SIM, just create a new account.
          </Text>
        </View>

        <View style={{ marginTop: 'auto', paddingTop: 24, paddingHorizontal: 24, paddingBottom: insets.bottom + 36, gap: 10, alignItems: 'center' }}>
          <Text size={14} tone={color.inkMuted}>
            New to Paa Jim?{' '}
            <Text size={14} weight={700} tone={color.primary} onPress={() => router.replace('/signup')} accessibilityRole="link">Create account</Text>
          </Text>
          <Text size={12} tone={color.inkMuted} align="center">Vendor or rider? Use the number admin registered for you.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
