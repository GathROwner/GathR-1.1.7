import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { fetchMinimumAppVersionPolicy } from '../services/minimumAppVersionPolicy';
import { requiredAppVersion, shouldCheckMinimumAppVersion } from '../utils/minimumAppVersion';

const FOREGROUND_CHECK_INTERVAL_MS = 60000;

export function useMinimumAppVersion() {
  const [minimumVersion, setMinimumVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const mounted = useRef(false);
  const flight = useRef<Promise<void> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lastCheck = useRef(0);
  const blocked = useRef(false);
  const eligible = shouldCheckMinimumAppVersion(Updates.channel, Platform.OS, __DEV__);

  const check = useCallback((): Promise<void> => {
    if (!eligible || !mounted.current) return Promise.resolve();
    if (flight.current) return flight.current;
    setChecking(true);
    const requestController = new AbortController();
    controller.current = requestController;
    const request = (async () => {
      const policy = await fetchMinimumAppVersionPolicy(requestController.signal);
      if (!mounted.current || requestController.signal.aborted) return;
      // Native version only: OTA runtime/manifest versions do not prove a
      // store upgrade. An unreadable native version always fails open.
      const required = requiredAppVersion(policy, Platform.OS,
        Application.nativeApplicationVersion, Platform.Version);
      blocked.current = required !== null;
      setMinimumVersion(required);
    })().finally(() => {
      if (controller.current === requestController) {
        controller.current = null;
        flight.current = null;
        if (mounted.current) setChecking(false);
      }
    });
    lastCheck.current = Date.now();
    flight.current = request;
    return request;
  }, [eligible]);

  useEffect(() => {
    mounted.current = true;
    if (!eligible) return () => { mounted.current = false; };
    void check();
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && previous !== 'active' &&
          (blocked.current || Date.now() - lastCheck.current >= FOREGROUND_CHECK_INTERVAL_MS)) {
        void check();
      }
      previous = next;
    });
    return () => {
      mounted.current = false;
      subscription.remove();
      controller.current?.abort();
      controller.current = null;
      flight.current = null;
    };
  }, [eligible, check]);

  return { minimumVersion, checking, check };
}
