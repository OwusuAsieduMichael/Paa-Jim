import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { backend } from '@/backend';

// Rider location — the only path with real write volume (Handbook §2.6):
//  * only while en_route (not idle, not arrived)
//  * 5 s interval, 20 m distance filter → stationary riders stop writing
//  * one insert per ping; a DB trigger updates rider_profiles for Realtime
// Only the rider role ever requests background location.

export const RIDER_TASK = 'paajim-rider-location';
const ACTIVE_KEY = 'paajim-active-delivery';

// Must be defined at module scope, before the app renders (imported by the root layout).
if (!TaskManager.isTaskDefined(RIDER_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(RIDER_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const orderId = await AsyncStorage.getItem(ACTIVE_KEY);
    if (!orderId) return;
    const last = data.locations[data.locations.length - 1]!;
    try {
      await backend.pingLocation(orderId, last.coords.latitude, last.coords.longitude, last.coords.heading ?? null, last.coords.speed ?? null);
    } catch {
      // Dropped pings are fine; the next one supersedes it.
    }
  });
}

export type PermissionOutcome = 'background' | 'foreground-only' | 'denied';

/** Call only after showing the in-app rationale screen (Play policy). */
export async function requestRiderLocation(): Promise<PermissionOutcome> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return 'denied';
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.granted ? 'background' : 'foreground-only';
}

export async function hasBackgroundPermission() {
  const bg = await Location.getBackgroundPermissionsAsync();
  return bg.granted;
}

let foregroundSub: Location.LocationSubscription | null = null;

export async function startDeliveryTracking(orderId: string) {
  await AsyncStorage.setItem(ACTIVE_KEY, orderId);
  const opts = { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 20 };
  if (await hasBackgroundPermission()) {
    const running = await Location.hasStartedLocationUpdatesAsync(RIDER_TASK).catch(() => false);
    if (!running) {
      await Location.startLocationUpdatesAsync(RIDER_TASK, {
        ...opts,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Delivering a Paa Jim order',
          notificationBody: 'Your location is shared with the customer until you deliver.',
          notificationColor: '#C1121F',
          killServiceOnDestroy: false,
        },
      });
    }
  } else {
    // Foreground-only fallback: tracking pauses if the app is backgrounded.
    foregroundSub?.remove();
    foregroundSub = await Location.watchPositionAsync(opts, (l) => {
      void backend.pingLocation(orderId, l.coords.latitude, l.coords.longitude, l.coords.heading ?? null, l.coords.speed ?? null).catch(() => {});
    });
  }
}

export async function stopDeliveryTracking() {
  await AsyncStorage.removeItem(ACTIVE_KEY);
  foregroundSub?.remove();
  foregroundSub = null;
  const running = await Location.hasStartedLocationUpdatesAsync(RIDER_TASK).catch(() => false);
  if (running) await Location.stopLocationUpdatesAsync(RIDER_TASK);
}
