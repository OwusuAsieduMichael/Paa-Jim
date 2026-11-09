import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Text } from './Text';
import { Icon } from './Icon';
import { VendorAccountButton } from './VendorAccount';
import { color } from '@/theme';

/** Dark vendor header (queue, overview). */
export function VendorHeader({ eyebrow, title, right, children }: { eyebrow: string; title: string; right?: ReactNode; children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: color.ink, paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 18, gap: 16 }}>
      <StatusBar style="light" />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="logo" size={24} color="#FFFFFF" strokeWidth={3.2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text size={12} tone="rgba(255,255,255,0.75)">{eyebrow}</Text>
          <Text size={17} weight={800} tone="#FFFFFF" accessibilityRole="header">{title}</Text>
        </View>
        {right}
        <VendorAccountButton />
      </View>
      {children}
    </View>
  );
}

export function StatTile({ value, label, accent }: { value: string | number; label: string; accent?: string }) {
  return (
    <View style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: color.ink2 }}>
      <Text size={22} weight={800} tone={accent ?? '#FFFFFF'}>{value}</Text>
      <Text size={11} tone="rgba(255,255,255,0.8)">{label}</Text>
    </View>
  );
}
