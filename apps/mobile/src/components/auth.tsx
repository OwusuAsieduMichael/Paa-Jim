import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { Icon } from './Icon';
import { BackButton, CodeBoxes } from './ui';
import { color, font, shadow } from '@/theme';
import { groupLocal } from '@/lib/phone';
import { LEGAL_URL } from '@/lib/config';

// Shared pieces of the paajim-auth designs (Signup, Login, Verify, ChangePhone).

/** Red header with a back button, title and subtitle (Signup / Login). */
export function AuthHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: color.primary, paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: 64, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, gap: 22 }}>
      <BackButton bg="rgba(255,255,255,0.18)" fg="#FFFFFF" onPress={onBack} />
      <View style={{ gap: 8 }}>
        <Text size={30} weight={800} tone="#FFFFFF" ls={-0.02} accessibilityRole="header">{title}</Text>
        <Text size={15} tone="rgba(255,255,255,0.92)" lh={1.5}>{subtitle}</Text>
      </View>
    </View>
  );
}

/** White card that overlaps the red header. */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <View style={[{ marginTop: -34, marginHorizontal: 20, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20, paddingTop: 24, gap: 18 }, shadow.card]}>
      {children}
    </View>
  );
}

/** Ghana flag + "+233" + the 9 local digits, grouped as you type ("24 123 4567"). */
export function PhoneField({ label = 'Phone number', value, onChange, hint, flag = true, ...rest }: {
  label?: string; value: string; onChange: (v: string) => void; hint?: string; flag?: boolean;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'onChange'>) {
  const [focused, setFocused] = useState(false);
  const id = useRef(`phone-${Math.random().toString(36).slice(2, 7)}`).current;
  return (
    <View style={{ gap: 8 }}>
      <Text size={13} weight={700} nativeID={id}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ height: 54, paddingHorizontal: 14, borderRadius: 14, backgroundColor: color.canvas, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {flag && (
            <View style={{ width: 22, height: 15, borderRadius: 2, overflow: 'hidden' }} accessibilityLabel="Ghana">
              <View style={{ flex: 1, backgroundColor: '#CE1126' }} /><View style={{ flex: 1, backgroundColor: '#FCD116' }} /><View style={{ flex: 1, backgroundColor: '#006B3F' }} />
            </View>
          )}
          <Text size={15} weight={600}>+233</Text>
        </View>
        <TextInput
          accessibilityLabelledBy={id}
          value={value}
          onChangeText={(t) => onChange(groupLocal(t))}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          placeholder="24 123 4567"
          placeholderTextColor="#9A928E"
          maxLength={11}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
          style={{ flex: 1, minWidth: 0, height: 54, borderRadius: 14, borderWidth: 1.5, borderColor: focused ? color.primary : color.border, backgroundColor: focused ? '#FFFFFF' : color.canvas, paddingHorizontal: 16, fontFamily: font[600], fontSize: 16, color: color.ink }}
        />
      </View>
      {hint && <Text size={12} tone={color.inkMuted}>{hint}</Text>}
    </View>
  );
}

/**
 * Six code boxes over a hidden input. The phone's own number keyboard opens, so
 * iOS (oneTimeCode) and Android (sms-otp) can offer the code from the SMS.
 */
export function OtpInput({ value, onChange, length = 6, autoFocus = true }: {
  value: string; onChange: (v: string) => void; length?: number; autoFocus?: boolean;
}) {
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  // Re-open the keyboard after an error clears the code.
  useEffect(() => { if (value === '') ref.current?.focus(); }, [value]);
  return (
    <View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <CodeBoxes value={value} length={length} />
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        caretHidden
        accessibilityLabel={`${length}-digit code`}
        style={[StyleSheet.absoluteFill, { opacity: 0.02, color: 'transparent', fontSize: 1 }]}
      />
    </View>
  );
}

/** "Resend in 0:60" countdown. Returns seconds left and a restart function. */
export function useResendTimer(seconds = 60) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return { left, restart: () => setLeft(seconds), label: `Resend in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` };
}

/** Terms & Privacy checkbox (Signup). */
export function TermsCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    // The whole row toggles (box + sentence, 44px tall); only the two links open pages.
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel="I agree to the Terms and Privacy Policy"
      style={{ flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 44 }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: checked ? color.primary : color.disabled, backgroundColor: checked ? color.primary : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
        {checked && <Icon name="check" size={14} color="#FFFFFF" strokeWidth={3} />}
      </View>
      <Text size={12} lh={1.5} tone={color.inkMuted} style={{ flex: 1 }}>
        I agree to the{' '}
        <Text size={12} weight={700} tone={color.primary} onPress={() => Linking.openURL(`${LEGAL_URL}/terms`)}>Terms</Text> and{' '}
        <Text size={12} weight={700} tone={color.primary} onPress={() => Linking.openURL(`${LEGAL_URL}/privacy`)}>Privacy Policy</Text>
      </Text>
    </Pressable>
  );
}
