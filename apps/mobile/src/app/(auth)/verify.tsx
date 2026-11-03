import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { BackButton, Banner, Button, CodeBoxes, Keypad } from '@/components/ui';
import { color } from '@/theme';
import { prettyPhone } from '@/lib/phone';
import { useSession, homeFor } from '@/stores/session';
import { backend, BackendError } from '@/backend';

// 04 · Verify (6-digit OTP)
export default function Verify() {
  const insets = useSafeAreaInsets();
  const { pendingPhone, setUser } = useSession();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(45);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => { if (!pendingPhone) router.replace('/phone'); }, [pendingPhone]);

  async function submit(c = code) {
    if (c.length !== 6 || !pendingPhone) return;
    setBusy(true);
    setError(null);
    try {
      const u = await backend.verifyOtp(pendingPhone, c);
      setUser(u);
      router.replace(homeFor(u));
    } catch (e) {
      setError(e instanceof BackendError ? e.message : 'Could not verify. Try again.');
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!pendingPhone || resendIn > 0) return;
    setError(null);
    try { await backend.sendOtp(pendingPhone); setResendIn(45); }
    catch (e) { setError((e as Error).message); }
  }

  const onKey = (d: string) => {
    if (busy || code.length >= 6) return;
    const next = code + d;
    setCode(next);
    setError(null);
    if (next.length === 6) void submit(next);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 24 }}>
        <BackButton />
        <View style={{ paddingTop: 28, gap: 10 }}>
          <Text size={30} weight={800} ls={-0.02} accessibilityRole="header">Verification code</Text>
          <Text size={15} lh={1.5} tone={color.inkMuted}>
            Enter the 6-digit code we sent to <Text size={15} weight={700}>{prettyPhone(pendingPhone)}</Text>
          </Text>
        </View>
        <View style={{ paddingTop: 32 }}>
          <CodeBoxes value={code} length={6} />
        </View>
        <View style={{ flexDirection: 'row', marginTop: 20 }}>
          <Text size={14} tone={color.inkMuted}>Didn’t get it? </Text>
          <Pressable onPress={resend} disabled={resendIn > 0} hitSlop={8}>
            <Text size={14} weight={700} tone={resendIn > 0 ? color.inkMuted : color.primary}>
              {resendIn > 0 ? `Resend in 0:${String(resendIn).padStart(2, '0')}` : 'Resend code'}
            </Text>
          </Pressable>
        </View>
        {error && <Banner tone="error" icon="alert" style={{ marginTop: 16 }}>{error}</Banner>}
        <Button title="Verify & continue" onPress={() => submit()} loading={busy} disabled={code.length !== 6} style={{ marginTop: 28 }} />
      </View>
      <View style={{ marginTop: 'auto' }}>
        <Keypad onKey={onKey} onDelete={() => setCode((c) => c.slice(0, -1))} />
      </View>
    </View>
  );
}
