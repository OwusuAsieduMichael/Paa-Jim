import { create } from 'zustand';
import { backend, type User } from '@/backend';

interface SessionState {
  user: User | null;
  ready: boolean;
  pendingPhone: string | null; // between phone and verify screens
  hydrate(): Promise<void>;
  setUser(u: User | null): void;
  setPendingPhone(p: string | null): void;
  signOut(): Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  ready: false,
  pendingPhone: null,
  async hydrate() {
    try {
      set({ user: await backend.currentUser(), ready: true });
    } catch {
      set({ user: null, ready: true });
    }
    backend.onAuthChange((u) => set({ user: u }));
  },
  setUser: (user) => set({ user }),
  setPendingPhone: (pendingPhone) => set({ pendingPhone }),
  async signOut() {
    await backend.signOut();
    set({ user: null });
  },
}));

export function homeFor(user: User | null): string {
  if (!user) return '/welcome';
  switch (user.role) {
    case 'vendor_staff': return '/vendor';
    case 'rider': return '/rider';
    case 'admin': return '/admin-note';
    default: return user.fullName ? '/customer' : '/profile-setup';
  }
}
