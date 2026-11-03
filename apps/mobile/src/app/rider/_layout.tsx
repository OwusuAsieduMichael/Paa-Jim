import { Redirect, Stack } from 'expo-router';
import { useSession, homeFor } from '@/stores/session';

export default function RiderLayout() {
  const user = useSession((s) => s.user);
  if (!user) return <Redirect href="/welcome" />;
  if (user.role !== 'rider') return <Redirect href={homeFor(user)} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFFFFF' } }} />;
}
