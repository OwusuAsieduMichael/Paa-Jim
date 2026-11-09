import { create } from 'zustand';
import { router } from 'expo-router';
import { backend, type AuthIntent, type User } from '@/backend';
import { unregisterPush } from '@/features/notifications';
import { stopDeliveryTracking } from '@/features/riderTracking';
import { useCart } from './cart';

/** Carried from the sign-up / log-in screen to the shared verify screen. */
export type PendingAuth = { phone: string; intent: AuthIntent };

interface SessionState {
  user: User | null;
  ready: boolean;
  pending: PendingAuth | null;
  hydrate(): Promise<void>;
  setUser(u: User | null): void;
  setPending(p: PendingAuth | null): void;
  signOut(): Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  ready: false,
  pending: null,
  async hydrate() {
    try {
      set({ user: await backend.currentUser(), ready: true });
    } catch {
      set({ user: null, ready: true });
    }
    backend.onAuthChange((u) => set({ user: u }));
  },
  setUser: (user) => set({ user }),
  setPending: (pending) => set({ pending }),
  // Tidy up while still signed in (these writes need the session), then leave.
  // None of the tidy-up steps may stop someone from signing out.
  async signOut() {
    const role = get().user?.role;
    await Promise.allSettled([
      unregisterPush(),
      ...(role === 'rider' ? [stopDeliveryTracking(), backend.setOnShift(false)] : []),
    ]);
    useCart.getState().clear();
    await backend.signOut().catch(() => {});
    set({ user: null, pending: null });
    router.replace('/welcome');
  },
}));

export function homeFor(user: User | null): string {
  if (!user) return '/welcome';
  switch (user.role) {
    case 'vendor_staff': return '/vendor';
    case 'rider': return '/rider';
    case 'admin': return '/admin-note';
    // Sign-up collects the name, so this only catches accounts made without one.
    default: return user.fullName ? '/customer' : '/profile-setup';
  }
}
