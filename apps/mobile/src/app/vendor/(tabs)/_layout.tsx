import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '@/components/ui';

// Vendor tab bar: Orders · Overview
export default function VendorTabs() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(p) => <TabBar {...p} />}>
      <Tabs.Screen name="index" options={{ title: 'Orders', tabBarAccessibilityLabel: 'kitchen-orders' }} />
      <Tabs.Screen name="overview" options={{ title: 'Overview' }} />
    </Tabs>
  );
}
