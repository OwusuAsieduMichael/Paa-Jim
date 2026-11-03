import Svg, { Path, Circle, Rect, Polygon } from 'react-native-svg';
import type { ReactNode } from 'react';
import { color as c } from '@/theme';

// Paths lifted from the design screens (24×24, 2px stroke, round caps).
const ICONS: Record<string, (fill: string) => ReactNode> = {
  back: () => <Path d="M15 5l-7 7 7 7" />,
  chevron: () => <Path d="M9 5l7 7-7 7" />,
  home: (f) => <Path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" fill={f} />,
  grid: () => (<><Rect x="3" y="3" width="7" height="7" rx="2" /><Rect x="14" y="3" width="7" height="7" rx="2" /><Rect x="3" y="14" width="7" height="7" rx="2" /><Rect x="14" y="14" width="7" height="7" rx="2" /></>),
  bag: (f) => (<><Path d="M5 8h14l-1 12H6z" fill={f} /><Path d="M9 8a3 3 0 0 1 6 0" fill="none" /></>),
  user: () => (<><Circle cx="12" cy="8" r="4" /><Path d="M4 21a8 8 0 0 1 16 0" /></>),
  search: () => (<><Circle cx="11" cy="11" r="7" /><Path d="m20 20-3.5-3.5" /></>),
  bell: () => (<><Path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><Path d="M10 20a2 2 0 0 0 4 0" /></>),
  pin: () => (<><Path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><Circle cx="12" cy="9" r="2.5" /></>),
  clock: () => (<><Circle cx="12" cy="12" r="9" /><Path d="M12 7v5l3 2" /></>),
  star: (f) => <Polygon points="12,3 14.8,9 21,9.5 16.2,13.6 17.8,20 12,16.6 6.2,20 7.8,13.6 3,9.5 9.2,9" fill={f} />,
  phone: () => <Path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  check: () => <Path d="M5 12.5 10 17 19 7" />,
  shield: () => (<><Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><Path d="M9 12l2 2 4-4" /></>),
  shieldPlain: () => <Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  mobile: () => (<><Rect x="6" y="2" width="12" height="20" rx="2" /><Path d="M11 18h2" /></>),
  lock: () => (<><Rect x="5" y="11" width="14" height="10" rx="2" /><Path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
  backspace: () => (<><Path d="M9 5h11v14H9l-6-7z" /><Path d="M13 10l4 4M17 10l-4 4" /></>),
  turnRight: () => <Path d="M9 18V8h8M13 4l4 4-4 4" />,
  logout: () => <Path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />,
  thumbUp: () => <Path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11a2 2 0 0 0 2-1.7l1.4-9A2 2 0 0 0 19.4 9z" />,
  thumbDown: () => <Path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H6a2 2 0 0 0-2 1.7l-1.4 9A2 2 0 0 0 4.6 15z" />,
  plus: () => <Path d="M12 5v14M5 12h14" />,
  alert: () => (<><Path d="M12 3 2 21h20z" /><Path d="M12 10v4M12 17h.01" /></>),
  heart: () => <Path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  pause: () => <Path d="M10 5v14M14 5v14" />,
  bike: () => (<><Circle cx="6" cy="17" r="3" /><Circle cx="18" cy="17" r="3" /><Path d="M6 17l4-7h5l3 7M10 10 8 6H5" /></>),
  info: () => (<><Circle cx="12" cy="12" r="9" /><Path d="M12 8h.01M11 12h1v5h1" /></>),
  locate: () => (<><Circle cx="12" cy="12" r="4" /><Path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>),
  list: () => <Path d="M4 6h16M4 12h16M4 18h10" />,
  dashboard: () => (<><Rect x="3" y="3" width="7" height="9" rx="2" /><Rect x="14" y="3" width="7" height="5" rx="2" /><Rect x="14" y="12" width="7" height="9" rx="2" /><Rect x="3" y="16" width="7" height="5" rx="2" /></>),
  wallet: () => <Path d="M3 7h18v12H3zM3 11h18M16 15h2" />,
  refresh: () => <Path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />,
  help: () => (<><Circle cx="12" cy="12" r="9" /><Path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 17h.01" /></>),
  navigate: () => <Path d="M12 2 19 21 12 17 5 21z" />,
  logo: () => (<><Path d="M6 24h36a18 18 0 0 1-36 0z" /><Path d="M16 17c0-3 3-3 3-6M24 17c0-3 3-3 3-6M32 17c0-3 3-3 3-6" /></>),
};

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 20,
  color = c.ink,
  fill = 'none',
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color?: string;
  fill?: string;
  strokeWidth?: number;
}) {
  const viewBox = name === 'logo' ? '0 0 48 48' : '0 0 24 24';
  return (
    <Svg width={size} height={size} viewBox={viewBox} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]!(fill)}
    </Svg>
  );
}
