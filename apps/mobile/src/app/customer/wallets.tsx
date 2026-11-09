import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { BackButton, Banner, Button, Loading } from '@/components/ui';
import { PhoneField } from '@/components/auth';
import { NetBadge } from '@/components/NetBadge';
import { color } from '@/theme';
import { prettyPhone, toE164Ghana } from '@/lib/phone';
import { NETS, guessNetwork, netInfo } from '@/lib/momo';
import { useLoad } from '@/hooks/data';
import { backend, BackendError, type Network, type Wallet } from '@/backend';

const MAX = 5;

// Account → MoMo wallets: saved numbers; the default one is used at payment.
export default function Wallets() {
  const insets = useSafeAreaInsets();
  const list = useLoad(() => backend.wallets(), []);
  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState('');
  const [net, setNet] = useState<Network | null>(null);
  const [netTouched, setNetTouched] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wallets = list.data ?? [];
  const e164 = toE164Ghana(phone);

  function onPhone(v: string) {
    setPhone(v);
    setError(null);
    if (!netTouched) setNet(guessNetwork(v));
  }

  async function add() {
    if (!e164) return setError('Enter the 9-digit MoMo number, e.g. 55 977 6547');
    if (!net) return setError('Choose the network for this number.');
    setBusy('add');
    setError(null);
    try {
      await backend.saveWallet({ network: net, phone: e164, isDefault: wallets.length === 0 ? true : undefined });
      setPhone(''); setNet(null); setNetTouched(false); setAdding(false);
      await list.reload();
    } catch (e) {
      setError(e instanceof BackendError ? e.message : 'Could not save the wallet. Try again.');
    } finally {
      setBusy(null);
    }
  }

  async function makeDefault(w: Wallet) {
    if (w.isDefault) return;
    setBusy(w.id);
    try { await backend.saveWallet({ id: w.id, network: w.network, phone: w.phone, isDefault: true }); await list.reload(); }
    catch (e) { Alert.alert('Could not update', (e as Error).message); }
    finally { setBusy(null); }
  }

  function remove(w: Wallet) {
    Alert.alert('Remove this wallet?', `${netInfo(w.network).name} · ${prettyPhone(w.phone)}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          setBusy(w.id);
          try { await backend.deleteWallet(w.id); await list.reload(); }
          catch (e) { Alert.alert('Could not remove', (e as Error).message); }
          finally { setBusy(null); }
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#FFFFFF' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 16 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <BackButton />
          <Text size={22} weight={800} accessibilityRole="header">MoMo wallets</Text>
        </View>
        <Text size={14} lh={1.5} tone={color.inkMuted}>
          Your <Text size={14} weight={700}>default</Text> wallet gets the payment prompt when you order. You can still pick another one at payment.
        </Text>

        {list.loading && !list.data ? <Loading /> : (
          <View style={{ gap: 10 }}>
            {wallets.map((w) => (
              <Pressable
                key={w.id}
                onPress={() => void makeDefault(w)}
                accessibilityRole="radio"
                accessibilityState={{ checked: w.isDefault }}
                accessibilityLabel={`${netInfo(w.network).name} ${prettyPhone(w.phone)}${w.isDefault ? ', default' : '. Tap to make default'}`}
                style={{ minHeight: 68, borderRadius: 16, borderWidth: w.isDefault ? 2 : 1.5, borderColor: w.isDefault ? color.primary : color.border, backgroundColor: w.isDefault ? '#FFF7F7' : '#FFFFFF', paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: busy === w.id ? 0.5 : 1 }}
              >
                <NetBadge network={w.network} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text size={16} weight={700}>{prettyPhone(w.phone)}</Text>
                  <Text size={12} tone={w.isDefault ? color.primary : color.inkMuted} weight={w.isDefault ? 700 : 500}>
                    {netInfo(w.network).name}{w.isDefault ? ' · Default' : ' · Tap to make default'}
                  </Text>
                </View>
                <Pressable onPress={() => remove(w)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${prettyPhone(w.phone)}`}
                  style={{ height: 36, paddingHorizontal: 10, justifyContent: 'center' }}>
                  <Text size={13} weight={700} tone={color.inkMuted}>Remove</Text>
                </Pressable>
              </Pressable>
            ))}
            {wallets.length === 0 && !adding && (
              <View style={{ padding: 18, borderRadius: 16, backgroundColor: color.canvas, alignItems: 'center', gap: 6 }}>
                <Icon name="wallet" size={26} color={color.inkMuted} />
                <Text size={14} weight={700}>No wallets saved yet</Text>
                <Text size={13} tone={color.inkMuted} align="center">Add your MoMo number so paying takes one tap.</Text>
              </View>
            )}
          </View>
        )}

        {adding ? (
          <View style={{ gap: 14, padding: 16, borderRadius: 18, borderWidth: 1.5, borderColor: color.border }}>
            <Text size={16} weight={800}>Add a wallet</Text>
            <PhoneField label="MoMo number" value={phone} onChange={onPhone} placeholder="55 977 6547" autoFocus autoComplete="tel-national" />
            <Text size={13} weight={700}>Network</Text>
            <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
              {NETS.map((n) => {
                const on = n.id === net;
                return (
                  <Pressable key={n.id} onPress={() => { setNet(n.id); setNetTouched(true); setError(null); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                    style={{ flex: 1, minHeight: 64, borderRadius: 14, borderWidth: on ? 2 : 1.5, borderColor: on ? color.primary : color.border, backgroundColor: on ? '#FFF7F7' : '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 }}>
                    <NetBadge network={n.id} size={28} />
                    <Text size={11} weight={700} align="center">{n.short}</Text>
                  </Pressable>
                );
              })}
            </View>
            {net && !netTouched && e164 && <Text size={12} tone={color.inkMuted}>We picked {netInfo(net).short} from the number. Change it if you’ve ported.</Text>}
            {error && <Banner tone="error" icon="alert">{error}</Banner>}
            <Button title={wallets.length === 0 ? 'Save as default wallet' : 'Save wallet'} onPress={add} loading={busy === 'add'} />
            <Button title="Cancel" variant="ghost" height={40} size={13} onPress={() => { setAdding(false); setError(null); }} />
          </View>
        ) : wallets.length < MAX ? (
          <Button title="Add a MoMo number" icon="plus" variant="outlinePrimary" onPress={() => setAdding(true)} />
        ) : (
          <Text size={12} tone={color.inkMuted} align="center">You’ve saved the maximum of {MAX} wallets. Remove one to add another.</Text>
        )}

        <View style={{ marginTop: 'auto', flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, backgroundColor: color.canvas }}>
          <Icon name="lock" size={18} color={color.inkMuted} />
          <Text size={12} lh={1.5} tone={color.inkMuted} style={{ flex: 1 }}>
            Paa Jim only saves the network and number. You approve every payment with your own MoMo PIN — we never see or store it.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
