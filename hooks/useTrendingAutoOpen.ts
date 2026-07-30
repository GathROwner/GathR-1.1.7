/**
 * useTrendingAutoOpen - Cold-start Trending lightbox
 *
 * Auto-opens the trending lightbox once per cold start (new JS runtime),
 * never on background->foreground resume. A hard app close kills the JS
 * runtime, so the module-scope flag below is the cold-start detector.
 * A persisted cooldown keeps frequent re-opens from feeling naggy.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useMapStore } from '../store/mapStore';
import { useUserPrefsStore } from '../store/userPrefsStore';
import { buildTrendingEvents } from '../utils/trendingUtils';
import { openTrendingLightbox } from '../utils/trendingLightbox';

const TRENDING_AUTO_OPEN_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours
// Fires after the tutorial's 1000ms auto-trigger delay (TUTORIAL_CONFIG
// AUTO_TRIGGER_DELAY, invoked from interest-selection -> map) so the
// fire-time tutorial check below wins that race for brand-new users.
const TRENDING_AUTO_OPEN_FIRE_DELAY_MS = Platform.OS === 'android' ? 3000 : 1500;

type TrendingAutoOpenOptions = {
  startupReady?: boolean;
  startupReason?: string;
};

// Module scope: survives MapScreen remounts, resets only on a new JS runtime
// (cold start). Backgrounding the app does not reset it.
let hasAutoOpenedThisSession = false;

export const getHasTrendingAutoOpenedThisSession = () => hasAutoOpenedThisSession;

const warnAndroidTrendingAutoOpenTiming = (
  phase: string,
  payload: Record<string, unknown> = {}
): void => {
  if (Platform.OS !== 'android') {
    return;
  }

  console.warn('[TrendingAutoOpenTiming]', phase, payload);
};

export function useTrendingAutoOpen(options: TrendingAutoOpenOptions = {}): void {
  const onScreenEvents = useMapStore((state) => state.onScreenEvents);
  const filterCriteria = useMapStore((state) => state.filterCriteria);
  const showTrendingOnOpen = useUserPrefsStore((state) => state.showTrendingOnOpen);
  const trendingLastAutoShownAt = useUserPrefsStore((state) => state.trendingLastAutoShownAt);
  const interests = useUserPrefsStore((state) => state.interests);
  const startupReady = options.startupReady ?? true;
  const startupReason = options.startupReason ?? 'ready';

  // Evaluate only while foregrounded (mirrors the hotspot's gating).
  const [canEvaluateTrigger, setCanEvaluateTrigger] = useState(
    AppState.currentState === 'active'
  );
  const fireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loggedEligibilityRef = useRef(false);
  const loggedStartupBlockedRef = useRef(false);
  const startupReadyRef = useRef(startupReady);
  const startupReasonRef = useRef(startupReason);

  startupReadyRef.current = startupReady;
  startupReasonRef.current = startupReason;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      setCanEvaluateTrigger(nextAppState === 'active');
    });
    return () => subscription.remove();
  }, []);

  const fire = useCallback(() => {
    fireTimerRef.current = null;

    if (hasAutoOpenedThisSession) return;
    // Re-check everything against fresh state at fire time.
    if (AppState.currentState !== 'active') return;
    if (!startupReadyRef.current) {
      warnAndroidTrendingAutoOpenTiming('fire_skipped_startup_not_ready', {
        startupReason: startupReasonRef.current,
      });
      return;
    }

    // The tutorial owns the first-run experience. Consume this session's
    // auto-open so trending does not pop up right after the tutorial ends.
    if ((global as any).gathrTutorialUiVisible === true) {
      hasAutoOpenedThisSession = true;
      return;
    }

    const mapState = useMapStore.getState();
    // A lightbox already open at fire time (e.g. shared-event deep link) is
    // this session's first impression; consume rather than queue behind it.
    if (mapState.selectedImageData) {
      hasAutoOpenedThisSession = true;
      return;
    }
    // Same for a cluster callout the user has already opened: they are
    // engaged, and popping a modal over the callout would double-render
    // (EventCallout ignores trending data, but don't interrupt regardless).
    if (mapState.selectedCluster || mapState.selectedVenues.length > 0) {
      hasAutoOpenedThisSession = true;
      return;
    }

    const prefs = useUserPrefsStore.getState();
    if (!prefs.showTrendingOnOpen) return;
    if (
      prefs.trendingLastAutoShownAt &&
      Date.now() - prefs.trendingLastAutoShownAt < TRENDING_AUTO_OPEN_COOLDOWN_MS
    ) {
      return;
    }

    const trendingEvents = buildTrendingEvents({
      onScreenEvents: mapState.onScreenEvents,
      filterCriteria: mapState.filterCriteria,
      userInterests: prefs.interests,
    });
    if (trendingEvents.length === 0) return;

    hasAutoOpenedThisSession = true;
    prefs.markTrendingAutoShown();
    warnAndroidTrendingAutoOpenTiming('opened', {
      eventCount: trendingEvents.length,
      startupReason: startupReasonRef.current,
    });
    openTrendingLightbox(trendingEvents, 'auto');
  }, []);

  useEffect(() => {
    if (hasAutoOpenedThisSession) return;
    if (fireTimerRef.current) return;
    if (!canEvaluateTrigger) return;
    if (!showTrendingOnOpen) return;
    if (!startupReady) {
      if (!loggedStartupBlockedRef.current) {
        loggedStartupBlockedRef.current = true;
        warnAndroidTrendingAutoOpenTiming('blocked_startup_not_ready', {
          startupReason,
        });
      }
      return;
    }
    if (
      trendingLastAutoShownAt &&
      Date.now() - trendingLastAutoShownAt < TRENDING_AUTO_OPEN_COOLDOWN_MS
    ) {
      return;
    }
    if (onScreenEvents.length === 0) return;

    const trendingEvents = buildTrendingEvents({
      onScreenEvents,
      filterCriteria,
      userInterests: interests,
    });
    if (trendingEvents.length === 0) return;

    if (__DEV__ && !loggedEligibilityRef.current) {
      loggedEligibilityRef.current = true;
      console.log('[TrendingAutoOpen] Eligible - scheduling fire', {
        eventCount: trendingEvents.length,
        lastAutoShownAt: trendingLastAutoShownAt ?? 'never',
      });
    }
    warnAndroidTrendingAutoOpenTiming('scheduled', {
      delayMs: TRENDING_AUTO_OPEN_FIRE_DELAY_MS,
      eventCount: trendingEvents.length,
      startupReason,
      lastAutoShownAt: trendingLastAutoShownAt ?? 'never',
    });

    fireTimerRef.current = setTimeout(fire, TRENDING_AUTO_OPEN_FIRE_DELAY_MS);
  }, [
    canEvaluateTrigger,
    filterCriteria,
    fire,
    interests,
    onScreenEvents,
    showTrendingOnOpen,
    startupReady,
    startupReason,
    trendingLastAutoShownAt,
  ]);

  // Clear the timer only on unmount: onScreenEvents churns during startup,
  // and a dep-change cleanup would cancel the pending fire forever.
  useEffect(() => {
    return () => {
      if (fireTimerRef.current) {
        clearTimeout(fireTimerRef.current);
        fireTimerRef.current = null;
      }
    };
  }, []);
}
