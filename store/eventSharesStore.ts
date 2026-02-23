import { create } from 'zustand';
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '../config/firebaseConfig';

type EventSharesState = {
  counts: Record<string, number>;
};

const listeners: Record<string, { unsub: () => void; refCount: number }> = {};

const useEventSharesStore = create<EventSharesState>(() => ({
  counts: {},
}));

const updateCount = (eventId: string, value?: number) => {
  useEventSharesStore.setState((state) => {
    const nextCounts = { ...state.counts };
    if (value === undefined || value === null) {
      delete nextCounts[eventId];
    } else {
      nextCounts[eventId] = Math.max(0, value);
    }
    return { counts: nextCounts };
  });
};

export const startEventSharesListener = (eventId: string | number) => {
  if (!eventId) return;
  const key = String(eventId);
  const existing = listeners[key];
  if (existing) {
    existing.refCount += 1;
    return;
  }

  const ref = doc(firestore, 'eventShares', key);
  const unsub = onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      const nextCount = Number(snap.data()?.count ?? 0);
      updateCount(key, nextCount);
    } else {
      updateCount(key, undefined);
    }
  });

  listeners[key] = { unsub, refCount: 1 };
};

export const stopEventSharesListener = (eventId: string | number) => {
  if (!eventId) return;
  const key = String(eventId);
  const entry = listeners[key];
  if (!entry) return;

  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    entry.unsub();
    delete listeners[key];
    useEventSharesStore.setState((state) => {
      const counts = { ...state.counts };
      delete counts[key];
      return { counts };
    });
  }
};

export const setEventShareCount = (eventId: string | number, value: number) => {
  if (!eventId) return;
  updateCount(String(eventId), value);
};

export const useEventShareCount = (eventId?: string | number | null) => {
  return useEventSharesStore((state) => {
    if (!eventId) return undefined;
    const key = String(eventId);
    if (!(key in state.counts)) return undefined;
    return state.counts[key];
  });
};
