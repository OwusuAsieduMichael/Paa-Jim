import { Redirect, Stack } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useSession, homeFor } from '@/stores/session';

export default function VendorLayout() {
  const user = useSession((s) => s.user);
  // The kitchen tablet stays awake while the vendor app is open.
  useKeepAwake();
  if (!user) return <Redirect href="/welcome" />;
  if (user.role !== 'vendor_staff') return <Redirect href={homeFor(user)} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F7F4F2' } }} />;
}
