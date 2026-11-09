import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { BackButton, Banner, Button, Loading } from '@/components/ui';
import { color, font } from '@/theme';
import { ghs } from '@/lib/money';
import { groupLocal, prettyPhone, toE164Ghana } from '@/lib/phone';
import { NETS, guessNetwork, netInfo } from '@/lib/momo';
import { Icon } from '@/components/Icon';
import { NetBadge } from '@/components/NetBadge';
import { useLoad, useOrder } from '@/hooks/data';
import { useSession } from '@/stores/session';
import { useCart } from '@/stores/cart';
import { backend, type Network } from '@/backend';

type Stage = 'choose' | 'otp' | 'waiting';
const NEW = 'new';

// 12 · Payment (MoMo via Paystack, through the Node service)
export default function Payment() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const insets = useSafeAreaInsets();
  const user = useSession((s) => s.user);
  const clearCart = useCart((s) => s.clear);
  const { data: order } = useOrder(orderId);

  const saved = useLoad(() => backend.wallets(), []);
  const wallets = saved.data ?? [];
  // Which wallet pays: a saved one (default pre-selected) or NEW = type a number.
  const [walletId, setWalletId] = useState<string | null>(null);
  const [saveNew, setSaveNew] = useState(true);
  const ownLocal = (user?.phone ?? '').replace(/^233/, '');
  const [newNet, setNewNet] = useState<Network>(guessNetwork(ownLocal) ?? 'mtn');
  const [phone, setPhone] = useState(groupLocal(ownLocal));
  useEffect(() => {
    if (walletId || saved.loading) return;
    // Couldn't load saved wallets? Fall back to typing a number rather than blocking payment.
    setWalletId(saved.data?.find((w) => w.isDefault)?.id ?? saved.data?.[0]?.id ?? NEW);
  }, [saved.data, saved.loading, walletId]);
  const chosen = wallets.find((w) => w.id === walletId);
  const net: Network = chosen?.network ?? newNet;
  const [stage, setStage] = useState<Stage>('choose');
  const [reference, setReference] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  // Paid → confirmation. Realtime drives this; polling below is the fallback.
  useEffect(() => {
    if (!order || done.current) return;
    if (order.status !== 'pending_payment' && order.status !== 'payment_failed') {
      done.current = true;
      clearCart();
      router.replace(`/customer/order/${order.id}/confirmed`);
    }
  }, [order, clearCart]);

  useEffect(() => {
    if (stage !== 'waiting' || !orderId) return;
    const t = setInterval(async () => {
      try {
        const s = await backend.paymentStatus(orderId);
        if (s.paymentStatus === 'failed' || s.paymentStatus === 'abandoned') {
          setStage('choose');
          setError(s.message ? `Payment didn’t go through: ${s.message}` : 'Payment didn’t go through. Check your balance and try again.');
        }
      } catch { /* keep waiting */ }
    }, 8000);
    return () => clearInterval(t);
  }, [stage, orderId]);

  async function pay() {
    const e164 = chosen ? chosen.phone : toE164Ghana(phone);
    if (!e164) return setError('Enter your 9-digit MoMo number');
    setBusy(true);
    setError(null);
    try {
      const r = await backend.initiatePayment(orderId!, net, e164);
      // A new number they chose to keep: save it for next time (best effort; already-saved is fine).
      if (!chosen && saveNew && !wallets.some((w) => w.phone === e164)) {
        void backend.saveWallet({ network: net, phone: e164 }).catch(() => {});
      }
      setReference(r.reference);
      setStage(r.needsOtp ? 'otp' : 'waiting');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp() {
    if (!reference) return;
    setBusy(true);
    setError(null);
    try {
      await backend.submitOtp(reference, otp);
      setStage('waiting');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!order || !walletId) return <Loading />;
  const hint = net === 'vod'
    ? 'After you tap Pay, enter the code Telecel texts you, then approve the prompt on your phone.'
    : 'After you tap Pay, a prompt will pop up on your phone. Enter your PIN to approve — keep this screen open.';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#FFFFFF' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <BackButton />
          <Text size={22} weight={800} accessibilityRole="header">Payment</Text>
        </View>

        <View style={{ marginTop: 20, borderRadius: 20, backgroundColor: color.primary, paddingVertical: 18, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ gap: 4 }}>
            <Text size={13} tone="rgba(255,255,255,0.9)">Amount to pay</Text>
            <Text size={30} weight={800} tone="#FFFFFF" ls={-0.02}>{ghs(order.total)}</Text>
          </View>
          <View style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)' }}>
            <Text size={12} weight={700} tone="#FFFFFF">Order #{order.orderNo}</Text>
          </View>
        </View>

        {stage === 'waiting' ? (
          <View style={{ alignItems: 'center', gap: 14, paddingVertical: 48, flex: 1 }}>
            <ActivityIndicator size="large" color={color.primary} />
            <Text size={18} weight={800} align="center">Check your phone</Text>
            <Text size={14} lh={1.5} tone={color.inkMuted} align="center">
              Approve the {NETS.find((n) => n.id === net)!.name} prompt with your PIN. This screen updates by itself — keep it open.
            </Text>
            <Pressable onPress={() => { setStage('choose'); setError(null); }} hitSlop={10} style={{ marginTop: 12 }}>
              <Text size={13} weight={700} tone={color.inkMuted}>No prompt? Try again</Text>
            </Pressable>
          </View>
        ) : stage === 'otp' ? (
          <View style={{ gap: 12, marginTop: 24 }}>
            <Text size={16} weight={800}>Enter the Telecel code</Text>
            <Text size={13} tone={color.inkMuted} lh={1.5}>Telecel has texted a one-time code to your phone.</Text>
            <TextInput
              value={otp}
              onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 8))}
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              autoFocus
              accessibilityLabel="Telecel one-time code"
              style={{ height: 56, borderRadius: 14, borderWidth: 1.5, borderColor: color.primary, paddingHorizontal: 16, fontFamily: font[800], fontSize: 22, letterSpacing: 6, color: color.ink }}
            />
            {error && <Banner tone="error" icon="alert">{error}</Banner>}
            <Button title="Submit code" onPress={sendOtp} loading={busy} disabled={otp.length < 4} />
          </View>
        ) : (
          <>
            {wallets.length > 0 && (
              <>
                <Text size={16} weight={800} style={{ marginTop: 24, marginBottom: 12 }}>Pay from</Text>
                <View style={{ gap: 10 }} accessibilityRole="radiogroup">
                  {[...wallets.map((w) => ({ id: w.id, w })), { id: NEW, w: null }].map(({ id, w }) => {
                    const on = walletId === id;
                    return (
                      <Pressable key={id} onPress={() => { setWalletId(id); setError(null); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                        style={{ minHeight: 64, borderRadius: 16, borderWidth: on ? 2 : 1.5, borderColor: on ? color.primary : color.border, backgroundColor: on ? '#FFF7F7' : '#FFFFFF', paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        {w ? <NetBadge network={w.network} /> : (
                          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: color.canvas, alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name="plus" size={18} color={color.inkMuted} />
                          </View>
                        )}
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text size={15} weight={700}>{w ? prettyPhone(w.phone) : 'Use another number'}</Text>
                          <Text size={12} tone={color.inkMuted}>{w ? `${netInfo(w.network).name}${w.isDefault ? ' · Default' : ''}` : 'Any MoMo wallet'}</Text>
                        </View>
                        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? color.primary : color.ringIdle, alignItems: 'center', justifyContent: 'center' }}>
                          {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color.primary }} />}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            {walletId === NEW && (<>
            <Text size={16} weight={800} style={{ marginTop: 24, marginBottom: 12 }}>Choose your network</Text>
            <View style={{ gap: 10 }} accessibilityRole="radiogroup">
              {NETS.map((n) => {
                const on = n.id === net;
                return (
                  <Pressable
                    key={n.id}
                    onPress={() => setNewNet(n.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    style={{ height: 68, borderRadius: 16, borderWidth: on ? 2 : 1.5, borderColor: on ? color.primary : color.border, backgroundColor: on ? '#FFF7F7' : '#FFFFFF', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: n.badge, alignItems: 'center', justifyContent: 'center' }}>
                      <Text size={12} weight={800} tone={n.fg}>{n.mark}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text size={15} weight={700}>{n.name}</Text>
                      <Text size={12} tone={color.inkMuted}>{n.sub}</Text>
                    </View>
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? color.primary : color.ringIdle, alignItems: 'center', justifyContent: 'center' }}>
                      {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color.primary }} />}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Text size={13} weight={700} style={{ marginTop: 20 }} nativeID="momoLabel">Mobile money number</Text>
            <View style={{ marginTop: 8, height: 54, borderRadius: 14, borderWidth: 1.5, borderColor: color.border, backgroundColor: color.canvas, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10 }}>
              <Text size={15} weight={600} tone={color.inkMuted}>+233</Text>
              <TextInput
                accessibilityLabelledBy="momoLabel"
                value={phone}
                onChangeText={(t) => { setPhone(groupLocal(t)); const g = guessNetwork(t); if (g) setNewNet(g); }}
                keyboardType="phone-pad"
                maxLength={11}
                style={{ flex: 1, fontFamily: font[700], fontSize: 15, color: color.ink }}
              />
            </View>
            {wallets.length < 5 && (
              <Pressable onPress={() => setSaveNew((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: saveNew }}
                style={{ marginTop: 10, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: saveNew ? color.primary : color.disabled, backgroundColor: saveNew ? color.primary : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                  {saveNew && <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} />}
                </View>
                <Text size={13} weight={600}>{wallets.length === 0 ? 'Save as my default wallet' : 'Save this number for next time'}</Text>
              </Pressable>
            )}
            </>)}

            <Banner tone="warning" icon="info" style={{ marginTop: 16 }}>{hint}</Banner>
            {error && <Banner tone="error" icon="alert" style={{ marginTop: 10 }}>{error}</Banner>}

            <View style={{ marginTop: 'auto', paddingTop: 20 }}>
              <Button title={`Pay ${ghs(order.total)}`} icon="lock" onPress={pay} loading={busy} />
              <Text size={12} tone={color.inkMuted} align="center" style={{ marginTop: 12 }}>Secured by Paystack · Refunds go back to this wallet</Text>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
