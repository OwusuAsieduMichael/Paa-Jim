import { useState, type ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { Icon } from './Icon';
import { Banner, Button } from './ui';
import { color } from '@/theme';
import { prettyPhone } from '@/lib/phone';
import { AvatarPicker } from './Avatar';
import { useSession } from '@/stores/session';

export type SignOutAction = { title: string; variant?: 'primary' | 'outlinePrimary' | 'ghost'; run: () => Promise<void> };

/**
 * Bottom sheet for staff (rider, kitchen): who is signed in, what signing out
 * will do, and the sign-out buttons. `blocked` hides sign-out and explains why.
 */
export function AccountSheet({ visible, onClose, roleLabel, notes, blocked, actions }: {
  visible: boolean;
  onClose: () => void;
  roleLabel: string;
  notes?: ReactNode;
  blocked?: ReactNode;
  actions: SignOutAction[];
}) {
  const insets = useSafeAreaInsets();
  const user = useSession((s) => s.user);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(a: SignOutAction) {
    setBusy(a.title);
    setError(null);
    try { await a.run(); }
    catch (e) { setError((e as Error).message || 'Could not sign out. Try again.'); }
    finally { setBusy(null); }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} accessibilityLabel="Close" />
      <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20, gap: 14 }}>
        <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: color.border }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <AvatarPicker size={60} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text size={17} weight={800} accessibilityRole="header">{user?.fullName ?? 'Signed in'}</Text>
            <Text size={13} tone={color.inkMuted}>{roleLabel} · {prettyPhone(user?.phone)}</Text>
            <Text size={12} tone={color.inkMuted}>Tap the photo to change it</Text>
          </View>
        </View>

        {blocked ?? (
          <>
            {notes && <View style={{ padding: 14, borderRadius: 14, backgroundColor: color.canvas, gap: 8 }}>{notes}</View>}
            {error && <Banner tone="error" icon="alert">{error}</Banner>}
            {actions.map((a) => (
              <Button key={a.title} title={a.title} icon={a.variant === 'primary' || !a.variant ? 'logout' : undefined} variant={a.variant ?? 'primary'}
                loading={busy === a.title} disabled={busy !== null && busy !== a.title} onPress={() => void run(a)} />
            ))}
          </>
        )}
        <Button title="Cancel" variant="ghost" height={44} size={14} onPress={onClose} />
      </View>
    </Modal>
  );
}

/** One line of "what happens when you sign out". */
export function SheetNote({ icon = 'check', children }: { icon?: 'check' | 'alert' | 'bell' | 'bike'; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Icon name={icon} size={16} color={icon === 'alert' ? color.primary : color.inkMuted} />
      <Text size={13} lh={1.45} tone={color.ink} style={{ flex: 1 }}>{children}</Text>
    </View>
  );
}
