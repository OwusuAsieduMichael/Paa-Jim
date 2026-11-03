// Design tokens — DESIGN_HANDOFF.md
export const color = {
  primary: '#C1121F',
  primaryDark: '#8E0D17',
  primaryText: '#A00F1A',
  primaryTint: '#FDECEC',
  primarySoft: '#F0C6C9',
  ink: '#1A1A1A',
  ink2: '#2B2B2B',
  inkMuted: '#5B5B5B',
  surface: '#FFFFFF',
  canvas: '#F7F4F2',
  keypad: '#F2EEEC',
  border: '#ECE7E4',
  divider: '#F0EBE8',
  ringIdle: '#CFC7C3',
  lineIdle: '#E2DCD8',
  disabled: '#B9B2AE',
  map: '#EDEAE6',
  success: '#1E8E3E',
  successText: '#146C2E',
  successTint: '#E8F5EC',
  warning: '#E09A00',
  warningText: '#5A4300',
  warningInk: '#8A5A00',
  warningTint: '#FFF6E0',
  star: '#F2A900',
  starTint: '#FFF4D6',
  info: '#1F6FB2',
  momoYellow: '#FFCC00',
  photoText: '#5B3A2A',
  heroPhoto: '#F3D3C2',
  heroPhotoText: '#6B2A12',
} as const;

export const radius = { sm: 10, md: 14, lg: 16, xl: 18, xxl: 22, pill: 999 } as const;
export const gutter = 20;

export const font = {
  400: 'PlusJakartaSans_400Regular',
  500: 'PlusJakartaSans_500Medium',
  600: 'PlusJakartaSans_600SemiBold',
  700: 'PlusJakartaSans_700Bold',
  800: 'PlusJakartaSans_800ExtraBold',
} as const;
export type Weight = keyof typeof font;

export const shadow = {
  card: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  soft: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  sheet: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 15, shadowOffset: { width: 0, height: -8 }, elevation: 12 },
  brand: { shadowColor: color.primary, shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 18 }, elevation: 10 },
} as const;
