import { Redirect, Stack } from 'expo-router';
import { useSession, homeFor } from '@/stores/session';

export default function AuthLayout() {
  const user = useSession((s) => s.user);
  // Signed-in users skip auth — except a new customer still finishing their profile.
  if (user && !(user.role === 'customer' && !user.fullName)) return <Redirect href={homeFor(user)} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFFFFF' } }} />;
}
