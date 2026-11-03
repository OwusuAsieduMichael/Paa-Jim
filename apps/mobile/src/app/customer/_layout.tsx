import { Redirect, Stack } from 'expo-router';
import { useSession, homeFor } from '@/stores/session';

export default function CustomerLayout() {
  const user = useSession((s) => s.user);
  if (!user) return <Redirect href="/welcome" />;
  if (user.role !== 'customer') return <Redirect href={homeFor(user)} />;
  if (!user.fullName) return <Redirect href="/profile-setup" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFFFFF' } }} />;
}
