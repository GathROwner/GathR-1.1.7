import { useSyncExternalStore } from 'react';
import { AppState, type NativeEventSubscription } from 'react-native';

type Listener = () => void;

let currentMinute = Math.floor(Date.now() / 60000);
let boundaryTimer: ReturnType<typeof setTimeout> | null = null;
let minuteTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: NativeEventSubscription | null = null;
const listeners = new Set<Listener>();

const refresh = () => {
  const nextMinute = Math.floor(Date.now() / 60000);
  if (nextMinute === currentMinute) return;
  currentMinute = nextMinute;
  listeners.forEach((listener) => listener());
};

const startClock = () => {
  if (boundaryTimer || minuteTimer) return;
  refresh();
  const delayToBoundary = 60000 - (Date.now() % 60000) + 25;
  boundaryTimer = setTimeout(() => {
    boundaryTimer = null;
    refresh();
    minuteTimer = setInterval(refresh, 60000);
  }, delayToBoundary);
  appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') refresh();
  });
};

const stopClock = () => {
  if (boundaryTimer) clearTimeout(boundaryTimer);
  if (minuteTimer) clearInterval(minuteTimer);
  boundaryTimer = null;
  minuteTimer = null;
  appStateSubscription?.remove();
  appStateSubscription = null;
};

const subscribe = (listener: Listener) => {
  listeners.add(listener);
  startClock();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopClock();
  };
};

const getSnapshot = () => currentMinute;

/**
 * Re-renders all mounted time-bearing surfaces from one shared clock, aligned
 * to minute boundaries and refreshed immediately when the app returns active.
 */
export const useEventTimingMinute = (): number =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
