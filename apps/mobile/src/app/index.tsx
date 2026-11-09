import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, View, useWindowDimensions } from 'react-native';
import { Redirect, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '@/components/Text';
import { useSession, homeFor } from '@/stores/session';
import { LOGO, PHOTOS } from '@/lib/menuImages';
import { color } from '@/theme';

// 01 · Intro. Plates of food sweep in around the logo, then the onboarding carousel.
// Signed-in users skip it and go straight to their role's home.
const PLATES = [PHOTOS.jollofAssorted, PHOTOS.friedRiceChicken, PHOTOS.riceStewPlantain, PHOTOS.jollofChicken];
const DURATION = 8000; // long enough to read the lines below; tap anywhere to skip
const LINES = [
  'Smoky party jollof, made fresh daily',
  'Fried rice and rice & stew, just how you like it',
  'Ice-cold Coke, Fanta, Malta and Awake water',
  'Pay with MoMo. Delivered hot to your door',
];
const LINE_MS = 1650;

export default function Intro() {
  const user = useSession((s) => s.user);
  if (user) return <Redirect href={homeFor(user)} />;
  return <IntroAnimation />;
}

function IntroAnimation() {
  const { width, height } = useWindowDimensions();
  const plates = useRef(PLATES.map(() => new Animated.Value(0))).current;
  const logo = useRef(new Animated.Value(0)).current;
  const words = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current;
  const left = useRef(false);
  const progress = useRef(new Animated.Value(0)).current;
  const lineFade = useRef(new Animated.Value(0)).current;
  const [line, setLine] = useState(0);

  function go() {
    if (left.current) return;
    left.current = true;
    Animated.timing(out, { toValue: 0, duration: 260, useNativeDriver: true }).start(() => router.replace('/welcome'));
  }

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    t = setTimeout(go, DURATION);
    Animated.timing(progress, { toValue: 1, duration: DURATION, easing: Easing.linear, useNativeDriver: true }).start();
    // The lines start once the logo has landed, then take turns.
    const lines: ReturnType<typeof setTimeout>[] = [];
    LINES.forEach((_, i) => lines.push(setTimeout(() => {
      if (!alive) return;
      Animated.timing(lineFade, { toValue: 0, duration: i ? 180 : 0, useNativeDriver: true }).start(() => {
        setLine(i);
        Animated.timing(lineFade, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      });
    }, 1300 + i * LINE_MS)));
    Animated.stagger(110, plates.map((p) => Animated.spring(p, { toValue: 1, friction: 7, tension: 40, useNativeDriver: true }))).start();
    Animated.sequence([
      Animated.delay(350),
      Animated.spring(logo, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
      Animated.timing(words, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 14000, easing: Easing.linear, useNativeDriver: true })).start();
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ])).start();
    return () => { alive = false; if (t) clearTimeout(t); lines.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Where each plate settles: the four corners around the logo, partly off-screen.
  const plateSize = Math.min(width * 0.52, 230);
  const spots = [
    { x: -width * 0.36, y: -height * 0.3, from: { x: -width, y: -height * 0.6 } },
    { x: width * 0.38, y: -height * 0.24, from: { x: width, y: -height * 0.5 } },
    { x: -width * 0.4, y: height * 0.27, from: { x: -width, y: height * 0.6 } },
    { x: width * 0.36, y: height * 0.32, from: { x: width, y: height * 0.6 } },
  ];
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotateBack = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });

  return (
    <Pressable onPress={go} accessibilityRole="button" accessibilityLabel="Paa Jim. Tap to start" style={{ flex: 1, backgroundColor: color.primary }}>
      <StatusBar style="light" />
      <Animated.View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', opacity: out }}>
        {/* soft rings breathing behind everything */}
        <Animated.View style={{ position: 'absolute', opacity: 0.14, transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }) }] }}>
          <Svg width={560} height={560} fill="none" stroke="#FFFFFF" strokeWidth={2}>
            <Circle cx={280} cy={280} r={270} /><Circle cx={280} cy={280} r={200} /><Circle cx={280} cy={280} r={130} />
          </Svg>
        </Animated.View>

        {PLATES.map((photo, i) => {
          const p = plates[i];
          const s = spots[i];
          return (
            <Animated.View
              key={i}
              style={{
                position: 'absolute', width: plateSize, height: plateSize, borderRadius: plateSize / 2,
                borderWidth: 6, borderColor: 'rgba(255,255,255,0.22)', overflow: 'hidden', backgroundColor: color.primaryText,
                opacity: p,
                transform: [
                  { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [s.from.x, s.x] }) },
                  { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [s.from.y, s.y] }) },
                  { rotate: i % 2 ? rotateBack : rotate },
                ],
              }}
            >
              <Image source={photo.source} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
            </Animated.View>
          );
        })}

        <Animated.View style={{ alignItems: 'center', gap: 18, opacity: logo, transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }}>
          <View style={{ width: 150, height: 150, borderRadius: 75, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 12 }}>
            <Image source={LOGO} style={{ width: 140, height: 140 }} accessibilityLabel="Paa Jim Fast Food logo" />
          </View>
        </Animated.View>

        <Animated.View style={{ alignItems: 'center', gap: 6, marginTop: 22, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 22, backgroundColor: 'rgba(120,0,0,0.35)', opacity: words, transform: [{ translateY: words.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
          <Text size={13} weight={700} tone={color.momoYellow} ls={0.2}>AKWAABA!</Text>
          <Text size={34} weight={800} tone="#FFFFFF" ls={-0.02} accessibilityRole="header">Paa Jim</Text>
          <Text size={15} weight={600} tone="rgba(255,255,255,0.95)">Hot & fresh, at your door</Text>
        </Animated.View>

        <Animated.View style={{ marginTop: 16, minHeight: 48, paddingHorizontal: 36, justifyContent: 'center', opacity: lineFade, transform: [{ translateY: lineFade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
          <Text size={16} weight={700} tone="#FFFFFF" align="center" lh={1.4} accessibilityLiveRegion="polite">{LINES[line]}</Text>
        </Animated.View>
      </Animated.View>

      {/* How long until it moves on, and that it can be skipped */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 48, alignItems: 'center', gap: 12 }}>
        <View style={{ width: 160, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
          <Animated.View style={{ width: 160, height: 4, backgroundColor: '#FFFFFF', transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-160, 0] }) }] }} />
        </View>
        <Text size={13} weight={600} tone="rgba(255,255,255,0.85)">Tap anywhere to skip</Text>
      </View>
    </Pressable>
  );
}
