import { Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { backend, type Role } from '@/backend';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * Channels must exist before a token is requested (Android 13+), and can't be
 * changed after creation except name/description — so settle them here.
 *  - orders: the vendor alarm. MAX importance, custom looping-style sound,
 *            long vibration, shows on the lock screen, bypasses DND.
 *  - status: normal customer updates.
 */
export async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('orders', {
    name: 'New orders (kitchen alarm)',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'order_alarm.wav',
    vibrationPattern: [0, 800, 400, 800, 400, 800],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    enableLights: true,
    lightColor: '#C1121F',
  });
  await Notifications.setNotificationChannelAsync('status', {
    name: 'Order updates',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250],
  });
}

/** Ask permission and register this device's native FCM/APNs token. */
export async function registerForPush(): Promise<void> {
  if (!Device.isDevice || backend.demo) return;
  await ensureChannels();
  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted && current.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return;
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    await backend.registerPushToken(String(token.data), Platform.OS === 'ios' ? 'ios' : 'android');
  } catch {
    // Expo Go on Android cannot receive push; a development build can.
  }
}

/** Tap on a notification → open the relevant screen for this role. */
export function routeNotifications(role: Role | undefined) {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const orderId = r.notification.request.content.data?.orderId as string | undefined;
    if (!orderId) return;
    if (role === 'vendor_staff') router.push(`/vendor/order/${orderId}`);
    else if (role === 'customer') router.push(`/customer/order/${orderId}/track`);
  });
  return () => sub.remove();
}

/** In-app alarm while the vendor tablet is open: buzz until acknowledged. */
export function startInAppAlarm() {
  Vibration.vibrate([0, 700, 500], true);
  return () => Vibration.cancel();
}
