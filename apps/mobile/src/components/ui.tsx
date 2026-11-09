import type { ReactNode } from 'react';
import {
  ActivityIndicator, Image, Pressable, StyleSheet, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { color, font, radius } from '@/theme';
import type { Photo } from '@/lib/menuImages';

// ---------------------------------------------------------------- Button
type Variant = 'primary' | 'outlinePrimary' | 'dark' | 'ghost' | 'outline' | 'soft' | 'tint';
const VARIANT: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: color.primary, fg: '#FFFFFF' },
  outlinePrimary: { bg: '#FFFFFF', fg: color.primary, border: color.primary },
  dark: { bg: color.ink, fg: '#FFFFFF' },
  ghost: { bg: 'transparent', fg: color.inkMuted },
  outline: { bg: '#FFFFFF', fg: color.ink, border: color.border },
  soft: { bg: color.canvas, fg: color.ink },
  tint: { bg: color.primaryTint, fg: color.primaryText },
};

export function Button({
  title, onPress, variant = 'primary', height = 56, disabled, loading, icon, style, size = 16, weight = 700,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  height?: number;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  size?: number;
  weight?: 700 | 800;
}) {
  const v = VARIANT[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress?.(); }}
      style={({ pressed }) => [
        styles.btn,
        {
          height,
          backgroundColor: pressed && variant === 'primary' ? color.primaryDark : v.bg,
          borderWidth: v.border ? 1.5 : 0,
          borderColor: v.border,
          opacity: off && !loading ? 0.45 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : (
        <>
          {icon && <Icon name={icon} size={20} color={v.fg} />}
          <Text size={size} weight={weight} tone={v.fg}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------- IconButton
export function IconButton({
  icon, onPress, label, bg = color.canvas, fg = color.ink, size = 44, style, children,
}: {
  icon?: IconName;
  onPress?: () => void;
  label: string;
  bg?: string;
  fg?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: radius.md, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 }, style]}
    >
      {icon ? <Icon name={icon} size={20} color={fg} /> : children}
    </Pressable>
  );
}

export function BackButton({ bg = color.canvas, fg = color.ink, onPress, style }: { bg?: string; fg?: string; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <IconButton
      icon="back"
      label="Back"
      bg={bg}
      fg={fg}
      style={style}
      onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
    />
  );
}

// ---------------------------------------------------------------- Chip / pill
export function Pill({ children, bg = color.canvas, fg = color.ink, height = 28, dot, style }: {
  children: ReactNode; bg?: string; fg?: string; height?: number; dot?: string; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ height, paddingHorizontal: 10, borderRadius: height / 2, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }, style]}>
      {dot && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />}
      {typeof children === 'string' ? <Text size={12} weight={700} tone={fg}>{children}</Text> : children}
    </View>
  );
}

export function Chip({ label, on, onPress, height = 38 }: { label: string; on: boolean; onPress: () => void; height?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{ height, paddingHorizontal: 16, borderRadius: height / 2, backgroundColor: on ? color.primary : color.canvas, justifyContent: 'center' }}
    >
      <Text size={13} weight={on ? 700 : 600} tone={on ? '#FFFFFF' : color.ink}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------- Field
export function Field({ label, focused, containerStyle, style, ...rest }: TextInputProps & { label?: string; focused?: boolean; containerStyle?: StyleProp<ViewStyle> }) {
    return (
      <View style={[{ gap: 8 }, containerStyle]}>
        {label && <Text size={13} weight={700}>{label}</Text>}
        <TextInput
          placeholderTextColor="#9A928E"
          {...rest}
          style={[
            {
              height: 52, borderRadius: radius.md, borderWidth: 1.5,
              borderColor: focused ? color.primary : color.border,
              backgroundColor: focused ? '#FFFFFF' : color.canvas,
              paddingHorizontal: 16, fontFamily: font[600], fontSize: 15, color: color.ink,
            },
            style,
          ]}
        />
      </View>
    );
}

// ---------------------------------------------------------------- Keypad + code boxes
export function Keypad({ onKey, onDelete }: { onKey: (d: string) => void; onDelete: () => void }) {
  const insets = useSafeAreaInsets();
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return (
    <View style={{ backgroundColor: color.keypad, paddingTop: 10, paddingHorizontal: 8, paddingBottom: Math.max(insets.bottom, 12) + 18, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {keys.map((k, i) => (
        <Pressable
          key={i}
          disabled={k === ''}
          accessibilityRole={k ? 'button' : undefined}
          accessibilityLabel={k === 'del' ? 'Delete' : k || undefined}
          onPress={() => { Haptics.selectionAsync().catch(() => {}); if (k === 'del') { onDelete(); } else { onKey(k); } }}
          style={({ pressed }) => ({ width: '31.9%', height: 50, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: k === '' || k === 'del' ? 'transparent' : pressed ? '#E6E1DE' : '#FFFFFF' })}
        >
          {k === 'del' ? <Icon name="backspace" size={24} /> : <Text size={22} weight={600}>{k}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

export function CodeBoxes({ value, length, height = 56, filledBg = color.canvas, size = 22, gap = 10 }: {
  value: string; length: number; height?: number; filledBg?: string; size?: number; gap?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', gap }} accessibilityLabel={`${value.length} of ${length} digits entered`}>
      {Array.from({ length }).map((_, i) => {
        const ch = value[i];
        const active = i === value.length;
        return (
          <View key={i} style={{ flex: 1, height, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? '#FFFFFF' : filledBg, borderWidth: active ? 2 : 0, borderColor: color.primary }}>
            {ch ? <Text size={size} weight={800}>{ch}</Text> : active ? <View style={{ width: 2, height: 24, backgroundColor: color.primary }} /> : null}
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------- Photo placeholder
// With a `photo` the tint shows only while it loads; without one, the tint and label stand in.
export function PhotoTile({ tint, label = '[Photo]', photo, dim, style, children }: {
  tint: string; label?: string; photo?: Photo; dim?: boolean; style?: StyleProp<ViewStyle>; children?: ReactNode;
}) {
  const flat = StyleSheet.flatten(style) ?? {};
  const inner = { borderRadius: flat.borderRadius, borderTopLeftRadius: flat.borderTopLeftRadius, borderTopRightRadius: flat.borderTopRightRadius, overflow: 'hidden' as const };
  return (
    <View style={[{ backgroundColor: photo?.fit === 'contain' ? '#FFFFFF' : tint, alignItems: 'center', justifyContent: 'center' }, style]}>
      {photo ? (
        <View style={[StyleSheet.absoluteFill, inner]}>
          <Image source={photo.source} resizeMode={photo.fit} style={[{ width: '100%', height: '100%' }, photo.fit === 'contain' && { transform: [{ scale: 0.9 }] }]} accessibilityIgnoresInvertColors />
          {dim && <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.6)', alignItems: 'center', justifyContent: 'center' }]}><Text size={11} weight={700} tone={color.inkMuted}>Sold out</Text></View>}
        </View>
      ) : (
        <Text size={10} weight={600} tone={color.photoText} align="center">{label}</Text>
      )}
      {children}
    </View>
  );
}

// ---------------------------------------------------------------- Misc
export function Row({ children, style, gap = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: color.divider }, style]} />;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: '#FFFFFF', borderRadius: radius.xl, padding: 16, gap: 12 }, style]}>{children}</View>;
}

export function SectionHeader({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Row style={[{ justifyContent: 'space-between', alignItems: 'flex-end' }, style]}>
      <Text size={18} weight={800} accessibilityRole="header">{title}</Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text size={13} weight={700} tone={color.primary}>{action}</Text>
        </Pressable>
      )}
    </Row>
  );
}

export function Banner({ tone = 'warning', icon = 'info', children, style }: { tone?: 'warning' | 'success' | 'error'; icon?: IconName; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = {
    warning: { bg: color.warningTint, fg: color.warningText },
    success: { bg: color.successTint, fg: color.successText },
    error: { bg: color.primaryTint, fg: color.primaryText },
  }[tone];
  return (
    <View style={[{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: t.bg, alignItems: 'flex-start' }, style]}>
      <Icon name={icon} size={18} color={t.fg} />
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <Text size={13} lh={1.5} tone={t.fg}>{children}</Text> : children}</View>
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
      <ActivityIndicator color={color.primary} size="large" />
      {label && <Text size={14} tone={color.inkMuted}>{label}</Text>}
    </View>
  );
}

export function Empty({ title, body, action, onAction }: { title: string; body?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 10 }}>
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: color.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="bag" size={28} color={color.primary} />
      </View>
      <Text size={17} weight={800} align="center">{title}</Text>
      {body && <Text size={14} tone={color.inkMuted} align="center" lh={1.5}>{body}</Text>}
      {action && <Button title={action} onPress={onAction} style={{ alignSelf: 'stretch', marginTop: 8 }} />}
    </View>
  );
}

// ---------------------------------------------------------------- Tab bar (customer + vendor)
// Keyed by tab title: customer Home/Menu/Orders/Account, vendor Orders/Overview.
const TAB_ICON: Record<string, IconName> = { Home: 'home', Menu: 'grid', Orders: 'bag', Account: 'user', Overview: 'dashboard', Kitchen: 'list' };

export function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: color.border, backgroundColor: '#FFFFFF', paddingTop: 8, paddingBottom: Math.max(insets.bottom, 14) }}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const opts = descriptors[route.key]!.options;
        const label = (opts.title ?? route.name) as string;
        const tint = focused ? color.primary : color.inkMuted;
        const iconName = (opts.tabBarAccessibilityLabel === 'kitchen-orders' ? 'list' : TAB_ICON[label]) ?? 'home';
        const fillable = iconName === 'home' || iconName === 'bag';
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={() => {
              const e = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !e.defaultPrevented) navigateToTab(route.key);
            }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 52 }}
          >
            <Icon name={iconName} size={22} color={tint} fill={focused && fillable ? color.primary : 'none'} />
            <Text size={11} weight={focused ? 700 : 600} tone={tint}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16 },
});
