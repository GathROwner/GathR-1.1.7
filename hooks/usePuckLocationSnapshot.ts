import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { getConservativePuckSnapshot, type PuckLocationSample } from '../utils/clusterPuckLayout';

export type PuckLocationRead = { result: Promise<PuckLocationSample | null>; cancel: () => void };
const REFRESH_AGE = 20000;
const READ_TIMEOUT = 8000;
const RETRY_DELAY = 10000;

/** Short, cancellable foreground read; never changes the map/check-in location store. */
export function startPuckLocationRead(accept: (sample: PuckLocationSample) => boolean): PuckLocationRead {
  let subscription: Location.LocationSubscription | null = null;
  let finish!: (sample: PuckLocationSample | null) => void;
  const result = new Promise<PuckLocationSample | null>(resolve => {
    let done = false;
    const timeout = setTimeout(() => finish(null), READ_TIMEOUT);
    finish = sample => {
      if (done) return;
      done = true; clearTimeout(timeout); subscription?.remove(); resolve(sample);
    };
    // Expo registers a JS callback before native watch setup; avoid knowingly
    // starting a permission-denied watch that cannot return its cleanup handle.
    void Location.getForegroundPermissionsAsync().then(permission => {
      if (done) return;
      if (!permission.granted) { finish(null); return; }
      return Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 0 }, sample => {
        if (Date.now() - sample.timestamp < 10000 && accept(sample)) finish(sample);
      }).then(value => { subscription = value; if (done) value.remove(); });
    }).catch(() => finish(null));
  });
  return { result, cancel: () => finish(null) };
}

type Options = {
  location: PuckLocationSample | null;
  zoom: number;
  enabled: boolean;
  startRead?: typeof startPuckLocationRead;
};

/** Refresh before the 30s expiry even when iOS's normal 50m watch stays silent. */
export function usePuckLocationSnapshot({ location, zoom, enabled, startRead = startPuckLocationRead }: Options) {
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [resumeReadRequired, setResumeReadRequired] = useState(AppState.currentState === 'background' || AppState.currentState === 'inactive');
  const [ownedSample, setOwnedSample] = useState<PuckLocationSample | null>(null);
  const sample = ownedSample && (!location || ownedSample.timestamp > location.timestamp) ? ownedSample : location;
  const active = enabled && foreground && zoom <= 13.5;
  const idleRefresh = useRef<() => void>(() => {});
  useEffect(() => {
    const listener = AppState.addEventListener('change', state => {
      const isActive = state === 'active';
      if (!isActive) setResumeReadRequired(true);
      setForeground(isActive);
    });
    return () => listener.remove();
  }, []);
  useLayoutEffect(() => {
    if (!active) { idleRefresh.current = () => {}; return; }
    let stopped = false, pending: PuckLocationRead | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retryAfter = 0;
    const request = () => {
      if (stopped || pending || Date.now() < retryAfter) return;
      const snapshot = getConservativePuckSnapshot(sample, zoom);
      if (!resumeReadRequired && snapshot && Date.now() - sample!.timestamp < REFRESH_AGE) return;
      pending = startRead(value => !!getConservativePuckSnapshot(value, zoom));
      void pending.result.then(value => {
        if (stopped) return;
        pending = null;
        if (value && Date.now() - value.timestamp < 10000 && getConservativePuckSnapshot(value, zoom)) {
          setOwnedSample({ timestamp: value.timestamp, coords: { ...value.coords } });
          setResumeReadRequired(false);
        } else {
          retryAfter = Date.now() + RETRY_DELAY;
          timer = setTimeout(request, RETRY_DELAY);
        }
      });
    };
    idleRefresh.current = request;
    const snapshot = getConservativePuckSnapshot(sample, zoom);
    timer = setTimeout(request, !resumeReadRequired && snapshot ? Math.max(0, sample!.timestamp + REFRESH_AGE - Date.now()) : 0);
    return () => { stopped = true; if (timer) clearTimeout(timer); pending?.cancel(); idleRefresh.current = () => {}; };
  }, [active, sample, zoom, resumeReadRequired, startRead]);
  const getPuckSnapshot = useCallback(() => active && !resumeReadRequired ? getConservativePuckSnapshot(sample, zoom) : null, [active, resumeReadRequired, sample, zoom]);
  const refreshIfNeeded = useCallback(() => idleRefresh.current(), []);
  return { active, getPuckSnapshot, refreshIfNeeded, revision: sample?.timestamp ?? 0 };
}
