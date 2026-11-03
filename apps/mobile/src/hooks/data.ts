import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { backend, type Order, type KitchenStatus, type MenuItem, type Category } from '@/backend';

/** Generic loader with refresh + error. Re-runs when the screen regains focus. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = [], opts: { refetchOnFocus?: boolean } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    try {
      setError(null);
      setData(await fnRef.current());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setLoading(true); void reload(); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(useCallback(() => { if (opts.refetchOnFocus) void reload(); }, [opts.refetchOnFocus, reload]));
  return { data, error, loading, reload, setData };
}

/** One order, kept live over Realtime. Subscribes on mount, unsubscribes on unmount. */
export function useOrder(id: string | undefined) {
  const q = useLoad<Order>(() => backend.order(id!), [id]);
  const { setData, reload } = q;
  useEffect(() => {
    if (!id) return;
    const off = backend.subscribeOrder(id, (patch) => setData((o) => (o ? { ...o, ...patch, items: o.items } : o)));
    // Catch up on anything missed while backgrounded.
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void reload(); });
    return () => { off(); sub.remove(); };
  }, [id, setData, reload]);
  return q;
}

export function useKitchen() {
  return useLoad<KitchenStatus>(() => backend.kitchenStatus(), [], { refetchOnFocus: true });
}

export function useMenu() {
  const q = useLoad<{ categories: Category[]; items: MenuItem[] }>(() => backend.menu());
  const { reload } = q;
  useEffect(() => backend.subscribeMenu(() => void reload()), [reload]);
  return q;
}

/** Re-render every `ms` (countdowns, "cooking for 12 min"). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}
