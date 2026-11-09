import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, Pressable, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { COVERS } from '@/lib/menuImages';

const EVERY_MS = 4000;

/**
 * Edge-to-edge cover banners that swipe by themselves every 4 s (and by finger).
 * The banners are 2:1, so at full screen width they fill the space with nothing cut off.
 */
export function CoverCarousel({ height, onPress }: { height?: number; onPress?: () => void }) {
  const { width } = useWindowDimensions();
  const h = height ?? Math.round(width / 2);
  const list = useRef<FlatList<(typeof COVERS)[number]>>(null);
  const [index, setIndex] = useState(0);
  const dragging = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (dragging.current) return;
      const next = (index + 1) % COVERS.length;
      list.current?.scrollToOffset({ offset: next * width, animated: true });
      setIndex(next);
    }, EVERY_MS);
    return () => clearTimeout(t);
  }, [index, width]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    dragging.current = false;
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={{ width, height: h }}>
      <FlatList
        ref={list}
        data={COVERS}
        keyExtractor={(c) => c.key}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => { dragging.current = true; }}
        onMomentumScrollEnd={settle}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item }) => (
          <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : 'image'} accessibilityLabel={item.label}>
            <Image source={item.source} resizeMode="cover" style={{ width, height: h }} />
          </Pressable>
        )}
      />
      <View pointerEvents="none" style={{ position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        {COVERS.map((c, i) => (
          <View key={c.key} style={{ width: i === index ? 20 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? '#FFFFFF' : 'rgba(255,255,255,0.55)' }} />
        ))}
      </View>
    </View>
  );
}
