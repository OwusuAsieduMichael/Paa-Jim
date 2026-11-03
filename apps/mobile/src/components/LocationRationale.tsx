import { Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { Icon } from './Icon';
import { Button } from './ui';
import { color } from '@/theme';

/**
 * Prominent disclosure shown BEFORE the OS background-location prompt.
 * Google Play rejects background location without one. Riders only.
 */
export function LocationRationale({ visible, onContinue, onCancel }: { visible: boolean; onContinue: () => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={{ flex: 1, padding: 24, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24, gap: 16, backgroundColor: '#FFFFFF' }}>
        <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: color.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="pin" size={34} color={color.primary} />
        </View>
        <Text size={26} weight={800} accessibilityRole="header">Share your location while delivering</Text>
        <Text size={15} lh={1.55} tone={color.inkMuted}>
          Paa Jim collects your location <Text size={15} weight={700}>in the background, even when the app is closed or not in use</Text>, but only while you are delivering an order — from the moment you claim it until you mark it arrived.
        </Text>
        {[
          ['The customer sees you on a live map', 'They know when to come to the gate.'],
          ['Only while en route', 'Location stops the moment you arrive or the delivery ends. It is never collected when you are off shift.'],
          ['Kept for 30 days', 'Then deleted automatically.'],
        ].map(([t, b]) => (
          <View key={t} style={{ flexDirection: 'row', gap: 12 }}>
            <Icon name="check" size={20} color={color.success} strokeWidth={2.5} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text size={14} weight={700}>{t}</Text>
              <Text size={13} lh={1.45} tone={color.inkMuted}>{b}</Text>
            </View>
          </View>
        ))}
        <Text size={13} lh={1.5} tone={color.inkMuted}>On the next screen choose <Text size={13} weight={700}>“Allow all the time”</Text>. You’ll see a notification while tracking is on.</Text>
        <View style={{ marginTop: 'auto', gap: 8 }}>
          <Button title="Continue" onPress={onContinue} />
          <Button title="Not now" variant="ghost" height={44} size={14} onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}
