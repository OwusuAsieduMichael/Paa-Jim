import type { ExpoConfig } from 'expo/config';

// Everything here ships in the app bundle. Never put a secret in an
// EXPO_PUBLIC_ variable — the prefix literally means "send to the client".
const IS_PROD = process.env.APP_VARIANT === 'production';

const config: ExpoConfig = {
  name: IS_PROD ? 'Paa Jim' : 'Paa Jim (dev)',
  slug: 'paajim',
  scheme: 'paajim',
  version: '1.0.0',
  orientation: 'default', // phones portrait; the vendor uses a tablet
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  backgroundColor: '#FFFFFF',
  ios: {
    bundleIdentifier: IS_PROD ? 'com.paajim.app' : 'com.paajim.app.dev',
    supportsTablet: true,
    config: { googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY },
    infoPlist: {
      UIBackgroundModes: ['location'],
      NSLocationWhenInUseUsageDescription: 'Paa Jim uses your location to find your delivery address and show your rider on the map.',
      NSLocationAlwaysAndWhenInUseUsageDescription: 'Riders: Paa Jim shares your location with the customer only while you are delivering their order.',
    },
  },
  android: {
    package: IS_PROD ? 'com.paajim.app' : 'com.paajim.app.dev',
    adaptiveIcon: {
      backgroundColor: '#C1121F',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    // google-services.json comes from an EAS file secret, never from git.
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? undefined,
    permissions: [
      'ACCESS_COARSE_LOCATION',
      'ACCESS_FINE_LOCATION',
      'ACCESS_BACKGROUND_LOCATION', // rider role only requests it, behind a rationale screen
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_LOCATION',
      'POST_NOTIFICATIONS',
      'VIBRATE',
      'USE_FULL_SCREEN_INTENT',
    ],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    [
      'expo-image-picker',
      {
        cameraPermission: 'Paa Jim uses the camera so you can take a profile photo. Riders and customers see it on an order.',
        photosPermission: 'Paa Jim lets you choose a profile photo from your gallery.',
        microphonePermission: false,
      },
    ],
    'expo-secure-store',
    'expo-font',
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 120, resizeMode: 'contain', backgroundColor: '#C1121F' },
    ],
    [
      'expo-location',
      {
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
        locationAlwaysAndWhenInUsePermission:
          'Riders: Paa Jim shares your location with the customer only while you are delivering their order.',
      },
    ],
    [
      'expo-notifications',
      { color: '#C1121F', sounds: ['./assets/sounds/order_alarm.wav'], defaultChannel: 'status' },
    ],
    [
      'react-native-maps',
      // Restricted by package name + SHA-1 in Google Cloud (get SHA-1 from `eas credentials`).
      { androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY },
    ],
  ],
  experiments: { typedRoutes: false },
  extra: {
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
