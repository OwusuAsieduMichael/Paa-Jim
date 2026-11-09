import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import Svg, { Path, Circle } from 'react-native-svg';
import { color } from '@/theme';

// Google Maps on Android; Apple Maps on iPhone (Expo Go on iOS has no Google Maps,
// and Apple Maps needs no API key).
export const MAP_PROVIDER = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;

export function Pin({ fill = color.primary, size = 36 }: { fill?: string; size?: number }) {
  return (
    <Svg width={size} height={size * 1.2} viewBox="0 0 36 44">
      <Path d="M18 2C8 2 2 9.5 2 17.5 2 29 18 42 18 42s16-13 16-24.5C34 9.5 28 2 18 2z" fill={fill} stroke="#FFFFFF" strokeWidth={3} />
      <Circle cx={18} cy={18} r={6} fill="#FFFFFF" />
    </Svg>
  );
}

/** Small static-feeling map with a single pin (address setup). */
export function MiniMap({ lat, lng, style, onPress }: { lat: number; lng: number; style?: StyleProp<ViewStyle>; onPress?: (c: { lat: number; lng: number }) => void }) {
  const region: Region = { latitude: lat, longitude: lng, latitudeDelta: 0.008, longitudeDelta: 0.008 };
  return (
    <View style={[{ borderRadius: 18, overflow: 'hidden', backgroundColor: color.map }, style]}>
      <MapView
        provider={MAP_PROVIDER}
        style={{ flex: 1 }}
        region={region}
        toolbarEnabled={false}
        showsPointsOfInterests={false}
        onPress={(e) => onPress?.({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
        accessibilityLabel="Map of your delivery location. Tap to move the pin."
      >
        <Marker coordinate={{ latitude: lat, longitude: lng }} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
          <Pin />
        </Marker>
      </MapView>
    </View>
  );
}
