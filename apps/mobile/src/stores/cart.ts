import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { add, times, toPesewas, type Pesewas } from '@/lib/money';
import type { MenuItem } from '@/backend';

// The cart total is an ESTIMATE for display. The order total always comes
// from create_order() on the server; checkout shows that one.

export interface CartEntry {
  key: string;
  menuItemId: string;
  name: string;
  unitPrice: string;
  tint: string;
  qty: number;
  note?: string;
}

interface CartState {
  lines: CartEntry[];
  /** client uuid for the order being placed — the idempotency key */
  pendingOrderId: string | null;
  add(item: MenuItem, qty?: number, note?: string): void;
  setQty(key: string, qty: number): void;
  clear(): void;
  setPendingOrderId(id: string | null): void;
}

const keyOf = (id: string, note?: string) => `${id}|${note ?? ''}`;

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      pendingOrderId: null,
      add: (item, qty = 1, note) =>
        set((s) => {
          const key = keyOf(item.id, note);
          const found = s.lines.find((l) => l.key === key);
          const lines = found
            ? s.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(20, l.qty + qty) } : l))
            : [...s.lines, { key, menuItemId: item.id, name: item.name, unitPrice: item.price, tint: item.tint, qty, note }];
          return { lines, pendingOrderId: null }; // cart changed → new order id
        }),
      setQty: (key, qty) =>
        set((s) => ({
          lines: qty <= 0 ? s.lines.filter((l) => l.key !== key) : s.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(20, qty) } : l)),
          pendingOrderId: null,
        })),
      clear: () => set({ lines: [], pendingOrderId: null }),
      setPendingOrderId: (pendingOrderId) => set({ pendingOrderId }),
    }),
    { name: 'paajim-cart', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export const cartCount = (lines: CartEntry[]) => lines.reduce((s, l) => s + l.qty, 0);
export const cartSubtotal = (lines: CartEntry[]): Pesewas => add(...lines.map((l) => times(toPesewas(l.unitPrice), l.qty)));
