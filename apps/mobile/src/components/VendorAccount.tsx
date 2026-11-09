import { useState } from 'react';
import { Pressable } from 'react-native';
import { Text } from './Text';
import { Button } from './ui';
import { AccountSheet, SheetNote, type SignOutAction } from './AccountSheet';
import { color } from '@/theme';
import { Avatar } from './Avatar';
import { useSession } from '@/stores/session';
import { backend } from '@/backend';

type Check = { inProgress: number; waiting: number; kitchenOpen: boolean };

/** Kitchen account button for the vendor header: opens the sign-out sheet. */
export function VendorAccountButton({ asButton = false }: { asButton?: boolean }) {
  const { user, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<Check | null>(null);

  async function show() {
    setOpen(true);
    // Fresh numbers each time: what this tablet is leaving behind.
    const [queue, kitchen] = await Promise.all([backend.vendorQueue().catch(() => []), backend.kitchenStatus().catch(() => null)]);
    setCheck({
      waiting: queue.filter((o) => o.status === 'paid').length,
      inProgress: queue.filter((o) => ['accepted', 'ready_for_pickup', 'en_route', 'arrived', 'delivery_failed'].includes(o.status)).length,
      kitchenOpen: kitchen?.isOpen ?? false,
    });
  }

  const actions: SignOutAction[] = check?.kitchenOpen
    ? [
        // End of the day: close first, so nobody can pay for an order that no tablet will hear.
        { title: 'Close kitchen & sign out', run: async () => { await backend.setKitchenOpen(false); await signOut(); } },
        { title: 'Sign out, keep kitchen open', variant: 'outlinePrimary', run: signOut },
      ]
    : [{ title: 'Sign out', run: signOut }];

  return (
    <>
      {asButton ? <Button title="Sign out of this tablet" icon="logout" variant="ghost" height={44} size={13} onPress={() => void show()} /> : <Pressable onPress={() => void show()} accessibilityRole="button" accessibilityLabel="Kitchen account and sign out" hitSlop={6}
        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color.ink2, alignItems: 'center', justifyContent: 'center' }}>
        <Avatar url={user?.avatarUrl} name={user?.fullName} size={40} bg={color.ink2} fg="#FFFFFF" />
      </Pressable>}
      <AccountSheet
        visible={open}
        onClose={() => setOpen(false)}
        roleLabel="Kitchen"
        notes={!check ? <Text size={13} tone={color.inkMuted}>Checking open orders…</Text> : <>
          {check.waiting > 0 && <SheetNote icon="alert">{`${check.waiting} new ${check.waiting === 1 ? 'order is' : 'orders are'} waiting to be accepted. Accept or reject them first, or make sure another tablet is signed in.`}</SheetNote>}
          {check.inProgress > 0 && <SheetNote icon="alert">{`${check.inProgress} ${check.inProgress === 1 ? 'order is' : 'orders are'} still in progress. Make sure another tablet is signed in to finish ${check.inProgress === 1 ? 'it' : 'them'}.`}</SheetNote>}
          <SheetNote icon="bell">New orders will stop ringing on this tablet.</SheetNote>
          {check.kitchenOpen
            ? <SheetNote>The kitchen is still open to customers. Close it if you’re done for the day.</SheetNote>
            : <SheetNote>The kitchen is closed to customers.</SheetNote>}
        </>}
        actions={check ? actions : []}
      />
    </>
  );
}
