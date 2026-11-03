import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { Button } from './ui';
import { color, font } from '@/theme';

/** Bottom sheet asking for a reason (reject, failed delivery, force-complete). */
export function ReasonSheet({
  visible, title, presets, confirm, minLength = 3, destructive = true, onCancel, onSubmit,
}: {
  visible: boolean;
  title: string;
  presets: string[];
  confirm: string;
  minLength?: number;
  destructive?: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<void> | void;
}) {
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const reason = (picked === 'Other' ? text : picked ?? '').trim();

  async function go() {
    setBusy(true);
    try { await onSubmit(reason); setPicked(null); setText(''); }
    finally { setBusy(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onCancel} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20, gap: 12 }}>
          <Text size={18} weight={800} accessibilityRole="header">{title}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[...presets, 'Other'].map((p) => {
              const on = picked === p;
              return (
                <Pressable key={p} onPress={() => setPicked(p)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderColor: on ? color.primary : color.border, backgroundColor: on ? color.primaryTint : '#FFFFFF', justifyContent: 'center' }}>
                  <Text size={14} weight={700} tone={on ? color.primaryText : color.ink}>{p}</Text>
                </Pressable>
              );
            })}
          </View>
          {picked === 'Other' && (
            <TextInput value={text} onChangeText={setText} autoFocus placeholder="Type the reason" placeholderTextColor="#9A928E" maxLength={200}
              style={{ height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: color.primary, paddingHorizontal: 14, fontFamily: font[500], fontSize: 15, color: color.ink }} />
          )}
          {reason.length > 0 && reason.length < minLength && <Text size={12} tone={color.primaryText}>At least {minLength} characters.</Text>}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <Button title="Cancel" variant="outline" onPress={onCancel} style={{ flex: 1 }} height={52} size={15} />
            <Button title={confirm} variant={destructive ? 'dark' : 'primary'} disabled={reason.length < minLength} loading={busy} onPress={go} style={{ flex: 2 }} height={52} size={15} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
