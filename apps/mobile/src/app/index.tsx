import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { useSession, homeFor } from '@/stores/session';
import { color, shadow } from '@/theme';

// 01 · Splash. Signed-in users go straight to their role's home.
export default function Splash() {
  const user = useSession((s) => s.user);
  useEffect(() => {
    if (user) return;
    const t = setTimeout(() => router.replace('/welcome'), 1800);
    return () => clearTimeout(t);
  }, [user]);
  if (user) return <Redirect href={homeFor(user)} />;

  return (
    <Pressable onPress={() => router.replace('/welcome')} style={{ flex: 1, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', gap: 20, overflow: 'hidden' }}>
      <StatusBar style="light" />
      <Svg width={520} height={520} style={{ position: 'absolute', top: -120, right: -220, opacity: 0.12 }} fill="none" stroke="#FFFFFF" strokeWidth={2}>
        <Circle cx={260} cy={260} r={250} /><Circle cx={260} cy={260} r={180} /><Circle cx={260} cy={260} r={110} />
      </Svg>
      <Svg width={360} height={360} style={{ position: 'absolute', bottom: -140, left: -150, opacity: 0.12 }} fill="none" stroke="#FFFFFF" strokeWidth={2}>
        <Circle cx={180} cy={180} r={170} /><Circle cx={180} cy={180} r={110} />
      </Svg>
      <View style={[{ width: 96, height: 96, borderRadius: 28, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, shadow.card]}>
        <Icon name="logo" size={56} color={color.primary} strokeWidth={3.2} />
      </View>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text size={40} weight={800} tone="#FFFFFF" ls={-0.02} accessibilityRole="header">Paa Jim</Text>
        <Text size={15} weight={500} tone="rgba(255,255,255,0.92)">Hot local meals, at your door</Text>
      </View>
      <View style={{ position: 'absolute', bottom: 64, alignItems: 'center', gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={{ width: 22, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' }} />
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' }} />
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' }} />
        </View>
        <Text size={13} weight={600} tone="#FFFFFF">Tap to start</Text>
      </View>
    </Pressable>
  );
}
