import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Image, Linking, Pressable, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/ui';
import { color, shadow } from '@/theme';
import { LEGAL_URL } from '@/lib/config';
import { PHOTOS } from '@/lib/menuImages';
import { backend } from '@/backend';

// 02 · Onboarding — three slides that turn by themselves (or by swipe), each a slowly turning plate.
const SLIDES = [
  { photo: PHOTOS.jollofAssorted, tint: color.primaryTint, title: ['Welcome to ', 'Paa Jim'], body: 'Smoky jollof and fried rice from Paa Jim’s kitchen in Effiduase — cooked fresh, every day.' },
  { photo: PHOTOS.friedRiceChicken, tint: '#FBEBD0', title: ['Hot from the ', 'kitchen'], body: 'Order in a few taps and watch your rider bring it to your door, live on the map.' },
  { photo: PHOTOS.riceStewPlantain, tint: '#E3F0E6', title: ['Add a ', 'cold drink'], body: 'Coke, Fanta, Sprite, Pepsi, Malta or Awake water — and pay with MoMo, no cash needed.' },
];
const AUTO_MS = 4000;

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scroller = useRef<FlatList<(typeof SLIDES)[number]> | null>(null);
  const x = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);
  const touched = useRef(false); // once the user swipes, stop auto-advancing

  useEffect(() => {
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 24000, easing: Easing.linear, useNativeDriver: true })).start();
  }, [spin]);

  useEffect(() => {
    if (touched.current) return;
    const t = setTimeout(() => {
      const next = (index + 1) % SLIDES.length;
      scroller.current?.scrollToOffset({ offset: next * width, animated: true });
      setIndex(next);
    }, AUTO_MS);
    return () => clearTimeout(t);
  }, [index, width]);

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  const heroH = 400 + insets.top * 0.4;
  const plate = Math.min(width * 0.6, 240);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <Animated.FlatList
        ref={scroller}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => { touched.current = true; }}
        onMomentumScrollEnd={onEnd}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        style={{ flexGrow: 0 }}
        renderItem={({ item: s, index: i }) => {
          const range = [(i - 1) * width, i * width, (i + 1) * width];
          // The plate drifts in slower than the page and shrinks as it leaves: a gentle parallax.
          const shift = x.interpolate({ inputRange: range, outputRange: [width * 0.35, 0, -width * 0.35], extrapolate: 'clamp' });
          const scale = x.interpolate({ inputRange: range, outputRange: [0.7, 1, 0.7], extrapolate: 'clamp' });
          const fade = x.interpolate({ inputRange: range, outputRange: [0, 1, 0], extrapolate: 'clamp' });
          return (
            <View style={{ width }}>
              <View style={{ height: heroH, backgroundColor: s.tint, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingTop: insets.top * 0.4 }}>
                <Svg width={420} height={420} style={{ position: 'absolute', opacity: 0.35 }} fill="none" stroke={color.primarySoft} strokeWidth={2}>
                  <Circle cx={210} cy={210} r={200} /><Circle cx={210} cy={210} r={150} />
                </Svg>
                <Animated.View style={[{ width: plate + 36, height: plate + 36, borderRadius: (plate + 36) / 2, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', transform: [{ translateX: shift }, { scale }] }, shadow.brand]}>
                  <Animated.View style={{ width: plate, height: plate, borderRadius: plate / 2, overflow: 'hidden', transform: [{ rotate }] }}>
                    <Image source={s.photo.source} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
                  </Animated.View>
                </Animated.View>
              </View>
              <Animated.View style={{ paddingHorizontal: 28, paddingTop: 30, gap: 12, opacity: fade }}>
                <Text size={30} weight={800} lh={1.15} ls={-0.02} accessibilityRole="header">
                  {s.title[0]}<Text size={30} weight={800} tone={color.primary}>{s.title[1]}</Text>
                </Text>
                <Text size={15} lh={1.5} tone={color.inkMuted}>{s.body}</Text>
              </Animated.View>
            </View>
          );
        }}
      />

      {/* Floating badges stay put while the slides move underneath */}
      <View pointerEvents="none" style={[{ position: 'absolute', top: 64 + insets.top * 0.4, right: 30, backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }, shadow.soft]}>
        <Icon name="clock" size={16} color={color.primary} />
        <Text size={12} weight={700}>~30 min</Text>
      </View>
      <View pointerEvents="none" style={[{ position: 'absolute', top: heroH - 64, left: 26, backgroundColor: '#FFFFFF', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }, shadow.soft]}>
        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: color.momoYellow }} />
        <Text size={12} weight={700}>Pay with MoMo</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 28, paddingTop: 16 }}>
        {SLIDES.map((_, i) => (
          <Pressable
            key={i}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Slide ${i + 1} of ${SLIDES.length}`}
            accessibilityState={{ selected: i === index }}
            onPress={() => { touched.current = true; setIndex(i); scroller.current?.scrollToOffset({ offset: i * width, animated: true }); }}
          >
            <View style={{ width: i === index ? 22 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? color.primary : color.primarySoft }} />
          </Pressable>
        ))}
      </View>

      <View style={{ marginTop: 'auto', paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 16) + 24, gap: 14 }}>
        {backend.demo && (
          <Text size={12} tone={color.warningText} align="center" lh={1.4} style={{ backgroundColor: color.warningTint, padding: 8, borderRadius: 10 }}>
            Demo mode — no backend configured. Any 6-digit code works.{'\n'}Log in as 24 000 0001 customer · 0002 kitchen · 0003 rider
          </Text>
        )}
        <Button title="Create account" onPress={() => router.push('/signup')} />
        <Button title="I already have an account" variant="outlinePrimary" onPress={() => router.push('/login')} />
        <Text size={12} tone={color.inkMuted} align="center" lh={1.5}>
          By continuing you agree to our{' '}
          <Text size={12} weight={700} tone={color.primary} onPress={() => Linking.openURL(`${LEGAL_URL}/terms`)}>Terms</Text> and{' '}
          <Text size={12} weight={700} tone={color.primary} onPress={() => Linking.openURL(`${LEGAL_URL}/privacy`)}>Privacy Policy</Text>
        </Text>
      </View>
    </View>
  );
}
