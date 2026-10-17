import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useRouter, useSegments } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { checkOut } from '../../services/socialService';
import { useMapStore } from '../../store/mapStore';
import { useCheckInReadinessStore } from '../../store/checkInReadinessStore';
import { useSocialStore } from '../../store/socialStore';
import { CHECK_IN_RADIUS_METRES, resolveCheckInRadiusCenter } from '../../utils/checkInRadius';
import { readinessDistance } from '../../utils/checkInReadiness';

const CHECK_IN_EXIT_RADIUS_METRES = CHECK_IN_RADIUS_METRES;
const CHECK_IN_EXIT_MAX_ACCURACY_METRES = 50;
const CHECK_IN_EXIT_GRACE_MS = 5 * 60_000;
const CHECK_IN_EXIT_FIX_MAX_AGE_MS = 15_000;
const CHECK_IN_EXIT_POLL_MS = 15_000;
const CHECK_IN_EXIT_NOTIFICATION_KIND = 'check_in_exit_warning';

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

export default function CheckInExitMonitor() {
  const ownCheckIn = useSocialStore((state) => state.ownCheckIn);
  const readinessAnchor = useCheckInReadinessStore((state) => state.evidence.anchor);
  const selectedVenues = useMapStore((state) => state.selectedVenues);
  const clusters = useMapStore((state) => state.clusters);
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [exitDeadlineMs, setExitDeadlineMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === 'active');
  const [locationRevision, setLocationRevision] = useState(0);
  const ownCheckInRef = useRef(ownCheckIn);
  const centerRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const exitDeadlineRef = useRef<number | null>(null);
  const lastFreshFixAtRef = useRef(0);
  const lastFixOutsideRef = useRef(false);
  const checkingOutRef = useRef(false);
  const monitoredRevisionRef = useRef<string | null>(null);
  const appIsActiveRef = useRef(AppState.currentState === 'active');
  const notificationIdRef = useRef<string | null>(null);
  const notificationGenerationRef = useRef(0);
  const pollingLocationRef = useRef(false);

  ownCheckInRef.current = ownCheckIn;
  const hasActiveCheckIn = Boolean(ownCheckIn);

  const center = useMemo(() => {
    return resolveCheckInRadiusCenter(ownCheckIn, readinessAnchor, selectedVenues, clusters);
  }, [clusters, ownCheckIn, readinessAnchor, selectedVenues]);

  centerRef.current = center;
  const monitorKey = ownCheckIn && center
    ? `${ownCheckIn.revision}:${center.latitude.toFixed(6)}:${center.longitude.toFixed(6)}`
    : null;

  const cancelBackgroundNotice = useCallback(async () => {
    notificationGenerationRef.current += 1;
    const id = notificationIdRef.current;
    notificationIdRef.current = null;
    if (id) {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch {
        // Notification cancellation is best effort; it does not affect checkout state.
      }
    }
  }, []);

  const scheduleBackgroundNotice = useCallback(async (deadlineMs: number) => {
    const generation = ++notificationGenerationRef.current;
    const priorId = notificationIdRef.current;
    notificationIdRef.current = null;
    if (priorId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(priorId);
      } catch {
        // Continue and attempt to schedule the current warning.
      }
    }
    try {
      const permission = await Notifications.getPermissionsAsync();
      if (!permission.granted || appIsActiveRef.current) return;
      const seconds = Math.max(1, Math.ceil((deadlineMs - Date.now()) / 1000));
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Check your GathR check-in',
          body: 'GathR noticed you may have left your check-in area. Open the app to confirm your status.',
          data: { kind: CHECK_IN_EXIT_NOTIFICATION_KIND },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
      });
      if (notificationGenerationRef.current !== generation
        || appIsActiveRef.current
        || exitDeadlineRef.current !== deadlineMs) {
        await Notifications.cancelScheduledNotificationAsync(id);
      } else {
        notificationIdRef.current = id;
      }
    } catch {
      // A notification is optional; the in-app countdown and server check-out remain available.
    }
  }, []);

  const resetExitWarning = useCallback(() => {
    exitDeadlineRef.current = null;
    lastFixOutsideRef.current = false;
    setExitDeadlineMs(null);
    setNowMs(Date.now());
    void cancelBackgroundNotice();
  }, [cancelBackgroundNotice]);

  const observeFix = useCallback((location: Location.LocationObject) => {
    if (!ownCheckInRef.current || !centerRef.current) return;
    const { latitude, longitude, accuracy } = location.coords;
    const capturedAtMs = location.timestamp;
    const ageMs = Date.now() - capturedAtMs;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || !Number.isFinite(accuracy) || accuracy === null || accuracy < 0
      || accuracy > CHECK_IN_EXIT_MAX_ACCURACY_METRES
      || ageMs < 0 || ageMs > CHECK_IN_EXIT_FIX_MAX_AGE_MS) return;

    lastFreshFixAtRef.current = capturedAtMs;
    setLocationRevision((value) => value + 1);
    const distanceMetres = readinessDistance(centerRef.current, { latitude, longitude });
    const confidentlyOutside = distanceMetres - accuracy > CHECK_IN_EXIT_RADIUS_METRES;
    const confidentlyInside = distanceMetres + accuracy <= CHECK_IN_EXIT_RADIUS_METRES;
    if (confidentlyOutside) {
      lastFixOutsideRef.current = true;
      if (exitDeadlineRef.current === null) {
        const deadline = Date.now() + CHECK_IN_EXIT_GRACE_MS;
        exitDeadlineRef.current = deadline;
        setExitDeadlineMs(deadline);
      }
      setNowMs(Date.now());
    } else if (confidentlyInside) {
      lastFixOutsideRef.current = false;
      if (exitDeadlineRef.current !== null) resetExitWarning();
    }
    // If accuracy overlaps the edge of the radius, keep the last confident state.
  }, [resetExitWarning]);

  useEffect(() => {
    const revision = ownCheckInRef.current?.revision ?? null;
    if (revision !== monitoredRevisionRef.current) {
      monitoredRevisionRef.current = revision;
      checkingOutRef.current = false;
      lastFreshFixAtRef.current = 0;
      resetExitWarning();
    }
    if (!ownCheckInRef.current || !centerRef.current) {
      resetExitWarning();
      return undefined;
    }

    let disposed = false;
    let generation = 0;
    let startingWatch = false;
    let subscription: Location.LocationSubscription | null = null;
    const stopWatching = () => {
      generation += 1;
      subscription?.remove();
      subscription = null;
    };
    const startWatching = async () => {
      if (disposed || AppState.currentState !== 'active' || subscription || startingWatch) return;
      startingWatch = true;
      const runId = ++generation;
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (disposed || runId !== generation || permission.status !== 'granted') return;
        const mapFix = useMapStore.getState().userLocation;
        const mapFixAge = mapFix ? Date.now() - mapFix.timestamp : Number.POSITIVE_INFINITY;
        if (mapFix && mapFixAge >= 0 && mapFixAge <= CHECK_IN_EXIT_FIX_MAX_AGE_MS) observeFix(mapFix);
        else {
          const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (!disposed && runId === generation) observeFix(current);
        }
        if (disposed || runId !== generation) return;
        const nextSubscription = await Location.watchPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 20,
          timeInterval: CHECK_IN_EXIT_POLL_MS,
        }, observeFix);
        if (disposed || runId !== generation || AppState.currentState !== 'active') nextSubscription.remove();
        else subscription = nextSubscription;
      } catch {
        // A location failure cannot start or complete an automatic checkout.
      } finally {
        startingWatch = false;
        if (!disposed && AppState.currentState === 'active' && !subscription && runId !== generation) {
          void startWatching();
        }
      }
    };
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      appIsActiveRef.current = active;
      setAppIsActive(active);
      if (active) {
        setNowMs(Date.now());
        void cancelBackgroundNotice();
        void startWatching();
      } else {
        stopWatching();
        const deadline = exitDeadlineRef.current;
        if (deadline !== null) void scheduleBackgroundNotice(deadline);
      }
    });
    if (AppState.currentState === 'active') void startWatching();

    return () => {
      disposed = true;
      stopWatching();
      appStateSubscription.remove();
    };
  }, [cancelBackgroundNotice, hasActiveCheckIn, monitorKey, observeFix, resetExitWarning, scheduleBackgroundNotice]);

  const remainingSeconds = exitDeadlineMs === null
    ? 0
    : Math.max(0, Math.ceil((exitDeadlineMs - nowMs) / 1000));
  const performAutomaticCheckout = useCallback(async () => {
    const activeCheckIn = ownCheckInRef.current;
    if (!activeCheckIn || checkingOutRef.current || !appIsActiveRef.current
      || !lastFixOutsideRef.current
      || Date.now() - lastFreshFixAtRef.current > CHECK_IN_EXIT_FIX_MAX_AGE_MS) return;
    checkingOutRef.current = true;
    void cancelBackgroundNotice();
    try {
      const result = await checkOut(activeCheckIn.revision);
      if (!result.checkedOut) {
        checkingOutRef.current = false;
        resetExitWarning();
        return;
      }
      resetExitWarning();
      Alert.alert(
        'Checked out',
        `You were checked out because you stayed outside the ${CHECK_IN_EXIT_RADIUS_METRES} m check-in area.`,
        [{ text: 'OK' }]
      );
    } catch {
      checkingOutRef.current = false;
      const nextAttempt = Date.now() + 30_000;
      exitDeadlineRef.current = nextAttempt;
      setExitDeadlineMs(nextAttempt);
      setNowMs(Date.now());
      Alert.alert('Couldn’t check out', 'Your check-in is still active. GathR will try again while you remain away.');
    }
  }, [cancelBackgroundNotice, resetExitWarning]);

  useEffect(() => {
    if (exitDeadlineMs === null || !appIsActive) return undefined;
    const ticker = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, [appIsActive, exitDeadlineMs]);

  useEffect(() => {
    if (exitDeadlineMs !== null && remainingSeconds === 0) void performAutomaticCheckout();
  }, [appIsActive, exitDeadlineMs, locationRevision, performAutomaticCheckout, remainingSeconds]);

  useEffect(() => {
    if (exitDeadlineMs === null || !appIsActive || !monitorKey) return undefined;
    let disposed = false;
    const poll = setInterval(() => {
      if (pollingLocationRef.current) return;
      pollingLocationRef.current = true;
      void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((location) => { if (!disposed) observeFix(location); })
        .catch(() => undefined)
        .finally(() => { pollingLocationRef.current = false; });
    }, CHECK_IN_EXIT_POLL_MS);
    return () => {
      disposed = true;
      clearInterval(poll);
    };
  }, [appIsActive, exitDeadlineMs, monitorKey, observeFix]);

  const isMapRoute = segments.some((segment) => segment === 'map');
  if (!isMapRoute || !ownCheckIn || exitDeadlineMs === null) return null;

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { top: insets.top + 170 }]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`You have left your check-in area. Automatic checkout in ${formatCountdown(remainingSeconds)}. Open check-in settings.`}
        onPress={() => router.push('/check-in')}
        activeOpacity={0.88}
        style={[styles.banner, { width: Math.min(width - 28, 280) }]}
      >
        <View style={styles.iconCircle}>
          <Ionicons name="walk-outline" size={18} color="#B54708" />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>You’ve left your check-in area</Text>
          <Text style={styles.subtitle}>
            Checking you out in <Text style={styles.timer}>{formatCountdown(remainingSeconds)}</Text>
          </Text>
          <Text style={styles.returnCopy}>Come back to stay checked in</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color="#B54708" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 14,
    right: 14,
    alignItems: 'flex-start',
    zIndex: 1000,
    elevation: 1000,
  },
  banner: {
    minHeight: 68,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#F5C26B',
    backgroundColor: '#FFFAEB',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 7,
  },
  iconCircle: {
    width: 33,
    height: 33,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF0C7',
    marginRight: 9,
  },
  copy: { flex: 1, minWidth: 0 },
  title: { color: '#7A2E0E', fontSize: 12, fontWeight: '800' },
  subtitle: { color: '#93370D', fontSize: 11, lineHeight: 14, marginTop: 2 },
  returnCopy: { color: '#93370D', fontSize: 10, lineHeight: 13, marginTop: 1, opacity: 0.86 },
  timer: { fontWeight: '800', fontVariant: ['tabular-nums'] },
});
