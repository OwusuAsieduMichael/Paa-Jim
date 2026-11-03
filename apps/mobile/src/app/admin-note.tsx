import { View } from 'react-native';
import { Text } from '@/components/Text';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/ui';
import { color } from '@/theme';
import { useSession } from '@/stores/session';

// Admins work from the web dashboard (and Supabase Studio), not the mobile app.
export default function AdminNote() {
  const signOut = useSession((s) => s.signOut);
  return (
    <View style={{ flex: 1, padding: 32, justifyContent: 'center', gap: 16, backgroundColor: '#FFFFFF' }}>
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: color.primaryTint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="shieldPlain" size={28} color={color.primary} />
      </View>
      <Text size={26} weight={800}>Admin accounts use the dashboard</Text>
      <Text size={15} lh={1.5} tone={color.inkMuted}>
        Prices, refunds, riders and kill switches are managed from the Paa Jim admin dashboard on a computer, with your authenticator app.
      </Text>
      <Button title="Sign out" variant="outline" onPress={() => void signOut()} />
    </View>
  );
}
