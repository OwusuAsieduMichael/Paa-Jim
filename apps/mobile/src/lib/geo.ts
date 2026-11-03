export interface LatLng { lat: number; lng: number }

/** Great-circle distance in km. */
export function km(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Motorbike in town: ~22 km/h door to door, minimum 1 minute. */
export const etaMinutes = (distanceKm: number) => Math.max(1, Math.round((distanceKm / 22) * 60));

export const toLatLng = (p: LatLng) => ({ latitude: p.lat, longitude: p.lng });
