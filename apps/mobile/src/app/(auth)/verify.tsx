import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Text } from '@/components/Text';
import { BackButton, Banner, Button } from '@/components/ui';
import { OtpInput, useResendTimer } from '@/components/auth';
import { color } from '@/theme';
import { prettyPhone } from '@/lib/phone';
import { useSession, homeFor } from '@/stores/session';
import { backend, BackendError } from '@/backend';

// paajim-auth · Verify — shared by sign-up and log-in
export default function Verify() {
  const insets = useSafeAreaInsets();
  const { pending, setUser } = useSession();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const resend = useResendTimer(60);

  useEffect(() => { if (!pending) router.replace('/welcome'); }, [pending]);

  // "Wrong number? Change it" — back to the screen the number was typed on.
  const changeNumber = () => {
    if (router.canGoBack()) router.back();
    else router.replace(pending?.intent.mode === 'signup' ? '/signup' : '/login');
  };

  async function submit(c = code) {
    if (c.length !== 6 || !pending || busy) return;
    setBusy(true);
    setError(null);
    try {
      let u = await backend.verifyOtp(pending.phone, c);
      // Signing up with a number that already had an account logs into it; fill a missing name.
      if (pending.intent.mode === 'signup' && !u.fullName) {
        await backend.updateName(pending.intent.fullName);
        u = { ...u, fullName: pending.intent.fullName };
      }
      setUser(u);
      router.replace(homeFor(u));
    } catch (e) {
      setError(e instanceof BackendError ? e.message : 'Could not verify. Try again.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    if (!pending || resend.left > 0) return;
    setError(null);
    try {
      await backend.sendOtp(pending.phone, pending.intent);
      resend.restart();
      setNotice('New code sent.');
    } catch (e) {
      setError(e instanceof BackendError ? e.message : 'Could not resend. Try again.');
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#FFFFFF' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <BackButton onPress={changeNumber} />
        <View style={{ paddingTop: 28, gap: 10 }}>
          <Text size={30} weight={800} ls={-0.02} accessibilityRole="header">Check your SMS</Text>
          <Text size={15} lh={1.5} tone={color.inkMuted}>
            We sent a 6-digit code to <Text size={15} weight={700}>{prettyPhone(pending?.phone)}</Text> to make sure it’s really you.
          </Text>
        </View>

        <View style={{ paddingTop: 32 }}>
          <OtpInput
            value={code}
            onChange={(v) => { setCode(v); setError(null); setNotice(null); if (v.length === 6) void submit(v); }}
          />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 18 }}>
          <Text size={14} tone={color.inkMuted}>Code expires in 5 min · </Text>
          <Pressable onPress={onResend} disabled={resend.left > 0} hitSlop={10} accessibilityRole="button">
            <Text size={14} weight={700} tone={resend.left > 0 ? color.inkMuted : color.primary}>
              {resend.left > 0 ? resend.label : 'Resend code'}
            </Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', marginTop: 6 }}>
          <Text size={14} tone={color.inkMuted}>Wrong number? </Text>
          <Pressable onPress={changeNumber} hitSlop={10} accessibilityRole="link">
            <Text size={14} weight={700} tone={color.primary}>Change it</Text>
          </Pressable>
        </View>

        {error && <Banner tone="error" icon="alert" style={{ marginTop: 16 }}>{error}</Banner>}
        {notice && !error && <Banner tone="success" icon="check" style={{ marginTop: 16 }}>{notice}</Banner>}

        <Button title="Verify" onPress={() => submit()} loading={busy} disabled={code.length !== 6} style={{ marginTop: 24 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
