import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { Button, PhotoTile } from '@/components/ui';
import { color, shadow } from '@/theme';
import { LEGAL_URL } from '@/lib/config';
import { backend } from '@/backend';

// 02 · Onboarding
export default function Welcome() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <View style={{ height: 430 + insets.top * 0.4, backgroundColor: color.primaryTint, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingTop: insets.top * 0.4 }}>
        <Svg width={420} height={420} style={{ position: 'absolute', opacity: 0.35 }} fill="none" stroke={color.primarySoft} strokeWidth={2}>
          <Circle cx={210} cy={210} r={200} /><Circle cx={210} cy={210} r={150} />
        </Svg>
        <View style={[{ width: 230, height: 230, borderRadius: 115, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, shadow.brand]}>
          <PhotoTile tint={color.heroPhoto} label={'[Hero photo:\nJollof & chicken]'} style={{ width: 190, height: 190, borderRadius: 95 }} />
        </View>
        <View style={[{ position: 'absolute', top: 70 + insets.top * 0.4, right: 34, backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }, shadow.soft]}>
          <Icon name="clock" size={16} color={color.primary} />
          <Text size={12} weight={700}>~30 min</Text>
        </View>
        <View style={[{ position: 'absolute', bottom: 70, left: 30, backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }, shadow.soft]}>
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: color.momoYellow }} />
          <Text size={12} weight={700}>Pay with MoMo</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 28, paddingTop: 32, gap: 12 }}>
        <Text size={32} weight={800} lh={1.15} ls={-0.02} accessibilityRole="header">
          Welcome to <Text size={32} weight={800} tone={color.primary}>Paa Jim</Text>
        </Text>
        <Text size={15} lh={1.5} tone={color.inkMuted}>
          Smoky jollof and fried rice from Paa Jim’s kitchen, with ice-cold drinks — cooked fresh, delivered by our own riders.
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, paddingTop: 6 }}>
          <View style={{ width: 22, height: 6, borderRadius: 3, backgroundColor: color.primary }} />
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.primarySoft }} />
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.primarySoft }} />
        </View>
      </View>

      <View style={{ marginTop: 'auto', paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 16) + 24, gap: 14 }}>
        {backend.demo && (
          <Text size={12} tone={color.warningText} align="center" style={{ backgroundColor: color.warningTint, padding: 8, borderRadius: 10 }}>
            Demo mode — no backend configured. Any 6-digit code works.
          </Text>
        )}
        <Button title="Continue with phone number" icon="mobile" onPress={() => router.push('/phone')} />
        <Text size={12} tone={color.inkMuted} align="center" lh={1.5}>
          By continuing you agree to our{' '}
          <Text size={12} weight={700} tone={color.primary} onPress={() => Linking.openURL(`${LEGAL_URL}/terms`)}>Terms</Text> and{' '}
          <Text size={12} weight={700} tone={color.primary} onPress={() => Linking.openURL(`${LEGAL_URL}/privacy`)}>Privacy Policy</Text>
        </Text>
      </View>
    </View>
  );
}
