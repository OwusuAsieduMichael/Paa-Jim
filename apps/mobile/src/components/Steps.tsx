import { View } from 'react-native';
import { Text } from './Text';
import { color } from '@/theme';

/** Checkout progress: 1 Details — 2 Pay — 3 Track */
export function CheckoutSteps({ at }: { at: 1 | 2 | 3 }) {
  const steps = ['Details', 'Pay', 'Track'];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessibilityLabel={`Step ${at} of 3: ${steps[at - 1]}`}>
      {steps.map((s, i) => {
        const n = i + 1;
        const on = n <= at;
        return (
          <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: i < 2 ? 1 : undefined }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? color.primary : 'transparent', borderWidth: on ? 0 : 2, borderColor: color.ringIdle }}>
                <Text size={11} weight={700} tone={on ? '#FFFFFF' : color.inkMuted}>{n}</Text>
              </View>
              <Text size={12} weight={700} tone={on ? color.primary : color.inkMuted}>{s}</Text>
            </View>
            {i < 2 && <View style={{ flex: 1, height: 2, backgroundColor: n < at ? color.primary : color.lineIdle }} />}
          </View>
        );
      })}
    </View>
  );
}
