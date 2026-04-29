/**
 * useHotspotHighlight - Daily Hotspot Feature Hook
 *
 * Shows a pulsing highlight on the most active cluster once per day.
 * Integrates with tutorial system to avoid conflicts.
 *
 * Features:
 * - Finds the "hottest" cluster (NOW > TODAY > event count)
 * - Zooms camera to cluster, shows tooltip, then zooms back on dismiss
 * - Respects tutorial active state (no hotspot during tutorial)
 * - Once per day with user toggle to disable
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState, Platform } from 'react-native';
import { useMapStore } from '../store/mapStore';
import {
  useUserPrefsStore,
  updateShowDailyHotspot,
} from '../store/userPrefsStore';
import { useTutorial } from './useTutorial';
import { useAuth } from '../contexts/AuthContext';
import { Cluster, TimeStatus } from '../types/events';
import { amplitudeTrack } from '../lib/amplitudeAnalytics';
import { isEventNow, isEventHappeningToday } from '../utils/dateUtils';
import { setMapTraceSnapshot, traceMapEvent } from '../utils/mapTrace';

interface HotspotHighlightState {
  shouldShow: boolean;
  targetCluster: Cluster | null;
  tooltipText: string;
  tooltipSubtext: string;
  isAnimating: boolean;
  targetCoordinates: { longitude: number; latitude: number } | null;
}

interface HotspotHighlightActions {
  dismiss: () => void;
  disablePermanently: () => void;
  onClusterTap: () => void;
  onOverlayPositionReady: () => void;
}

interface OriginalCameraPosition {
  coordinates: [number, number];
  zoom: number;
}

const HOTSPOT_VERBOSE_DEBUG = false;
const HOTSPOT_TRIGGER_DELAY_MS = 0;
const HOTSPOT_CAMERA_ZOOM_LEVEL = 14.4;
const HOTSPOT_CAMERA_ANIMATION_MS = Platform.OS === 'android' ? 0 : 1000;
const HOTSPOT_MIN_CAMERA_IDLE_MS = Platform.OS === 'android' ? 0 : 300;
const DEFER_HOTSPOT_VISIBILITY_UNTIL_REFINED = Platform.OS === 'ios' || Platform.OS === 'android';
const ANDROID_HOTSPOT_TIMING_DIAGNOSTICS = __DEV__ && Platform.OS === 'android';
const ANDROID_CLUSTER_STORE_SYNC_BACKUP_MS = 8000;

function hotspotDebugLog(...args: unknown[]) {
  if (__DEV__ && HOTSPOT_VERBOSE_DEBUG) {
    console.log(...args);
  }
}

/**
 * Helper to determine a venue's "hotness" based on event timing.
 * Used for sorting venues within a cluster by priority.
 * Uses centralized dateUtils functions to properly handle AM/PM time formats.
 */
function getVenueHotness(venue: { events?: any[] }) {
  let nowCount = 0;
  let todayCount = 0;
  let futureCount = 0;

  for (const event of (venue.events || [])) {
    // Use centralized date utilities that properly handle "H:MM:SS AM/PM" format
    const eventIsNow = isEventNow(
      event.startDate,
      event.startTime,
      event.endDate,
      event.endTime
    );

    if (eventIsNow) {
      nowCount++;
    } else if (isEventHappeningToday(event)) {
      todayCount++;
    } else {
      futureCount++;
    }
  }

  return { nowCount, todayCount, futureCount, total: (venue.events?.length || 0) };
}

/**
 * Calculate venue relevance score using same additive scoring as handleMarkerPress:
 * - Favorite venue: +500
 * - Interest match: +100
 * - NOW event: +10
 * - TODAY event: +5
 * - FUTURE event: +1
 * Score is based on highest-scoring event in the venue.
 */
function calculateVenueRelevanceScore(
  venue: { events?: any[]; locationKey?: string },
  favoriteVenues: string[],
  userInterests: string[]
): number {
  const isFavoriteVenue = venue.locationKey ? favoriteVenues.includes(venue.locationKey) : false;
  const favoriteVenueScore = isFavoriteVenue ? 500 : 0;

  let maxEventScore = 0;
  for (const event of (venue.events || [])) {
    const interestScore = userInterests.includes(event.category) ? 100 : 0;

    let timeScore = 1; // Default: future
    const eventIsNow = isEventNow(
      event.startDate,
      event.startTime,
      event.endDate,
      event.endTime
    );
    if (eventIsNow) {
      timeScore = 10;
    } else if (isEventHappeningToday(event)) {
      timeScore = 5;
    }

    const eventScore = favoriteVenueScore + interestScore + timeScore;
    maxEventScore = Math.max(maxEventScore, eventScore);
  }

  return maxEventScore;
}

/**
 * Sort venues by relevance using additive scoring (matches handleMarkerPress):
 * Score = favoriteVenue(500) + interest(100) + time(10/5/1)
 * Higher scores first.
 */
function sortVenuesByRelevance<T extends { events?: any[]; locationKey?: string }>(
  venues: T[],
  favoriteVenues: string[] = [],
  userInterests: string[] = []
): T[] {
  return [...venues]
    .map(venue => ({
      venue,
      score: calculateVenueRelevanceScore(venue, favoriteVenues, userInterests)
    }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.venue);
}


/**
 * Find the "hottest" cluster using same priority as tutorial:
 * 1. Clusters with timeStatus === 'now' (highest priority)
 * 2. Clusters with timeStatus === 'today'
 * 3. Clusters with most total events/specials
 */
function findHottestCluster(clusters: Cluster[]): Cluster | null {
  if (!clusters || clusters.length === 0) return null;

  // Filter to clusters with content
  const withContent = clusters.filter(
    (c) => c.eventCount > 0 || c.specialCount > 0
  );

  if (withContent.length === 0) return null;

  // DEBUG: Log all clusters being considered
  hotspotDebugLog('[Hotspot] ===== Finding hottest cluster =====');
  hotspotDebugLog('[Hotspot] Total clusters:', clusters.length);
  hotspotDebugLog('[Hotspot] Clusters with content:', withContent.length);
  withContent.forEach((c, i) => {
    hotspotDebugLog(`[Hotspot] Cluster ${i}: timeStatus=${c.timeStatus}, events=${c.eventCount}, specials=${c.specialCount}, venues=${c.venues?.length}, firstVenue=${c.venues?.[0]?.venue}`);
  });

  // Sort by priority
  const sorted = [...withContent].sort((a, b) => {
    // Priority 1: NOW > TODAY > FUTURE
    const statusPriority: Record<TimeStatus, number> = {
      now: 0,
      today: 1,
      future: 2,
    };
    const statusDiff = statusPriority[a.timeStatus] - statusPriority[b.timeStatus];
    if (statusDiff !== 0) return statusDiff;

    // Priority 2: More total events/specials
    const aTotal = (a.eventCount || 0) + (a.specialCount || 0);
    const bTotal = (b.eventCount || 0) + (b.specialCount || 0);
    return bTotal - aTotal;
  });

  // DEBUG: Log the winner
  const winner = sorted[0];
  hotspotDebugLog('[Hotspot] ===== Winner =====');
  hotspotDebugLog(`[Hotspot] Selected: timeStatus=${winner.timeStatus}, events=${winner.eventCount}, specials=${winner.specialCount}, firstVenue=${winner.venues?.[0]?.venue}`);

  return sorted[0];
}

/**
 * Generate time-urgency tooltip text based on cluster content.
 * Accurately counts NOW vs TODAY events across all venues in the cluster.
 */
function generateTooltipText(cluster: Cluster): { text: string; subtext: string } {
  const venueName = cluster.venues?.[0]?.venue || 'this location';

  // Count NOW and TODAY events across all venues in the cluster
  let nowCount = 0;
  let todayCount = 0;

  for (const venue of (cluster.venues || [])) {
    for (const event of (venue.events || [])) {
      const eventIsNow = isEventNow(
        event.startDate,
        event.startTime,
        event.endDate,
        event.endTime
      );

      if (eventIsNow) {
        nowCount++;
      } else if (isEventHappeningToday(event)) {
        todayCount++;
      }
    }
  }

  const totalCount = nowCount + todayCount;

  // Get the first event to extract category details
  const firstEvent = cluster.venues?.[0]?.events?.[0];
  const category = firstEvent?.category || cluster.categories?.[0] || '';

  // Generate text based on NOW/TODAY split
  if (nowCount > 0) {
    // Has events happening now
    if (nowCount === 1 && todayCount === 0) {
      // Single NOW event, no TODAY events
      if (category) {
        return {
          text: `${category} happening now!`,
          subtext: `at ${venueName}`,
        };
      }
      return {
        text: 'Something happening now!',
        subtext: `at ${venueName}`,
      };
    }

    if (todayCount === 0) {
      // Multiple NOW events, no TODAY events
      return {
        text: `${nowCount} events live now!`,
        subtext: 'Tap to explore',
      };
    }

    // Mix of NOW and TODAY events: "X live now, Y later today"
    const nowText = nowCount === 1 ? '1 event now' : `${nowCount} events now`;
    const todayText = todayCount === 1 ? '1 later today' : `${todayCount} later today`;
    return {
      text: `${nowText}, ${todayText}`,
      subtext: 'Tap to explore',
    };
  }

  // No NOW events, only TODAY events
  if (todayCount > 0) {
    if (todayCount === 1 && category) {
      return {
        text: `${category} tonight`,
        subtext: `at ${venueName}`,
      };
    }
    return {
      text: `${todayCount} events happening today`,
      subtext: 'Tap to see what\'s on',
    };
  }

  // Future only
  return {
    text: `${totalCount || cluster.eventCount || 0} upcoming events`,
    subtext: `at ${venueName}`,
  };
}

export function useHotspotHighlight(
  ignoreProgrammaticCameraRef: React.MutableRefObject<boolean>
): HotspotHighlightState & HotspotHighlightActions {
  const { user } = useAuth();
  const { isActive: tutorialIsActive } = useTutorial();
  const clusters = useMapStore((state) => state.clusters);
  const userLocation = useMapStore((state) => state.userLocation);

  const showDailyHotspot = useUserPrefsStore((state) => state.showDailyHotspot);
  const hotspotLastShownDate = useUserPrefsStore((state) => state.hotspotLastShownDate);
  const markHotspotShownToday = useUserPrefsStore((state) => state.markHotspotShownToday);
  const setShowDailyHotspot = useUserPrefsStore((state) => state.setShowDailyHotspot);
  const favoriteVenues = useUserPrefsStore((state) => state.favoriteVenues);
  const userInterests = useUserPrefsStore((state) => state.interests);

  // Internal state
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [targetCluster, setTargetCluster] = useState<Cluster | null>(null);

  // Store tooltip text - captured AFTER zoom completes to show accurate zoomed-in counts
  const [capturedTooltipText, setCapturedTooltipText] = useState('');
  const [capturedTooltipSubtext, setCapturedTooltipSubtext] = useState('');

  // Store the target coordinates to find the cluster after zoom
  const targetCoordsRef = useRef<{ longitude: number; latitude: number } | null>(null);

  // Store the hottest venue name to find the correct cluster after zoom
  const hottestVenueNameRef = useRef<string | null>(null);

  // Track original camera position for zoom-back
  const originalCameraRef = useRef<OriginalCameraPosition | null>(null);
  const hasTriggeredRef = useRef(false);
  const initialHotspotShownRef = useRef(false);
  const overlayPositionReadyRef = useRef(false);
  const visibleSourceRef = useRef<'camera_ready' | 'camera_unavailable' | 'camera_retry' | null>(null);
  const triggerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraFinalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredClusterSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingClusterStoreSyncRef = useRef(false);
  const pendingClusterUnlockReasonRef = useRef<string | null>(null);
  const hotspotCameraReadyCallbackRef = useRef<(() => void) | null>(null);
  const hotspotCameraIdleCallbackRef = useRef<(() => void) | null>(null);
  const cameraRefRetryCountRef = useRef(0);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hotspotTimingStartRef = useRef<number | null>(null);
  const logAndroidHotspotTiming = useCallback((label: string, details?: Record<string, unknown>) => {
    if (!ANDROID_HOTSPOT_TIMING_DIAGNOSTICS) {
      return;
    }

    const startedAt = hotspotTimingStartRef.current;
    console.warn('[GathRHotspotTiming]', label, JSON.stringify({
      sinceTriggerMs: startedAt ? Date.now() - startedAt : null,
      ...(details ?? {}),
    }));
  }, []);

  // Track if we should evaluate hotspot trigger (only on app foreground).
  // This has to be state because eligibility is read during render; a ref-only
  // update will not re-run the trigger after the hook mounts.
  const initialCanEvaluateTrigger = AppState.currentState === 'active';
  const [canEvaluateTrigger, setCanEvaluateTriggerState] = useState(initialCanEvaluateTrigger);
  const canEvaluateTriggerRef = useRef(initialCanEvaluateTrigger);
  const setCanEvaluateTriggerFlag = useCallback((value: boolean) => {
    canEvaluateTriggerRef.current = value;
    setCanEvaluateTriggerState((current) => (current === value ? current : value));
  }, []);
  const setHotspotProgrammaticLock = useCallback((value: boolean, reason: string) => {
    ignoreProgrammaticCameraRef.current = value;
    setMapTraceSnapshot({
      ignoreProgrammatic: value,
      ignoreProgrammaticReason: `hotspot_${reason}`,
    });
    traceMapEvent(value ? 'ignore_programmatic_on' : 'ignore_programmatic_off', {
      reason: `hotspot_${reason}`,
    });
  }, [ignoreProgrammaticCameraRef]);
  const flushPendingClusterStoreSync = useCallback((source: 'overlay_ready' | 'backup_timer') => {
    if (!pendingClusterStoreSyncRef.current) {
      return;
    }

    pendingClusterStoreSyncRef.current = false;
    if (deferredClusterSyncTimerRef.current) {
      clearTimeout(deferredClusterSyncTimerRef.current);
      deferredClusterSyncTimerRef.current = null;
    }

    logAndroidHotspotTiming('deferred_cluster_store_sync_started', {
      source,
      targetZoom: HOTSPOT_CAMERA_ZOOM_LEVEL,
    });
    useMapStore.getState().setZoomLevel(HOTSPOT_CAMERA_ZOOM_LEVEL);
    logAndroidHotspotTiming('deferred_cluster_store_sync_completed', {
      source,
      clusterCount: useMapStore.getState().clusters.length,
    });

    const unlockReason =
      pendingClusterUnlockReasonRef.current ?? `trigger_zoom_in_complete_${source}`;
    pendingClusterUnlockReasonRef.current = null;
    setHotspotProgrammaticLock(false, unlockReason);
  }, [logAndroidHotspotTiming, setHotspotProgrammaticLock]);

  const clearCameraFinalizeTimer = useCallback(() => {
    if (cameraFinalizeTimerRef.current) {
      clearTimeout(cameraFinalizeTimerRef.current);
      cameraFinalizeTimerRef.current = null;
    }
  }, []);

  const clearCameraRetryTimer = useCallback(() => {
    if (cameraRetryTimerRef.current) {
      clearTimeout(cameraRetryTimerRef.current);
      cameraRetryTimerRef.current = null;
    }
  }, []);

  const clearHotspotCameraIdleCallback = useCallback(() => {
    const globalAny = global as any;
    if (
      hotspotCameraIdleCallbackRef.current &&
      globalAny.mapHotspotCameraIdleCallback === hotspotCameraIdleCallbackRef.current
    ) {
      delete globalAny.mapHotspotCameraIdleCallback;
    }
    hotspotCameraIdleCallbackRef.current = null;
  }, []);

  const clearHotspotCameraReadyCallback = useCallback(() => {
    const globalAny = global as any;
    if (
      hotspotCameraReadyCallbackRef.current &&
      globalAny.mapHotspotCameraReadyCallback === hotspotCameraReadyCallbackRef.current
    ) {
      delete globalAny.mapHotspotCameraReadyCallback;
    }
    hotspotCameraReadyCallbackRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearCameraRetryTimer();
      clearCameraFinalizeTimer();
      clearHotspotCameraReadyCallback();
      clearHotspotCameraIdleCallback();
    };
  }, [
    clearCameraFinalizeTimer,
    clearCameraRetryTimer,
    clearHotspotCameraIdleCallback,
    clearHotspotCameraReadyCallback,
  ]);

  useEffect(() => {
    setMapTraceSnapshot({
      hotspotVisible: isVisible,
      hotspotAnimating: isAnimating,
      hotspotTargetClusterId: targetCluster?.id ?? null,
      hotspotTooltipText: capturedTooltipText || null,
    });
  }, [capturedTooltipText, isAnimating, isVisible, targetCluster]);

  // Listen for app state changes - only trigger hotspot on app foreground
  useEffect(() => {
    traceMapEvent('hotspot_hook_mounted', {
      appState: AppState.currentState,
    });

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // App came to foreground, allow evaluation
        hotspotDebugLog('[Hotspot] App foregrounded - allowing hotspot evaluation');
        setCanEvaluateTriggerFlag(true);
        traceMapEvent('hotspot_appstate_active');
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        // App went to background, reset evaluation flag
        hotspotDebugLog('[Hotspot] App backgrounded - resetting evaluation flag');
        setCanEvaluateTriggerFlag(false);
        traceMapEvent('hotspot_appstate_inactive', {
          appState: nextAppState,
        });
      }
    });

    // Initial mount counts as foreground
    // Also log current state for debugging
    const currentState = AppState.currentState;
    hotspotDebugLog('[Hotspot] Hook mounted - AppState:', currentState);
    setCanEvaluateTriggerFlag(currentState === 'active');

    return () => {
      traceMapEvent('hotspot_hook_unmounted');
      subscription.remove();
    };
  }, [setCanEvaluateTriggerFlag]);

  // DEBUG FLAGS:
  // - DEBUG_IGNORE_DATE: Set to true to bypass "already shown today" check (for testing)
  // - Keep false in production to respect once-per-day logic
  const DEBUG_IGNORE_DATE = false;

  // Track previous value of showDailyHotspot to detect mid-session changes
  const prevShowDailyHotspotRef = useRef(showDailyHotspot);

  // Calculate if we should show the hotspot
  const shouldShowHotspot = useMemo(() => {
    const hotspotSettingChanged = prevShowDailyHotspotRef.current !== showDailyHotspot;

    hotspotDebugLog('[Hotspot] Evaluating shouldShowHotspot:', {
      canEvaluate: canEvaluateTrigger,
      tutorialActive: tutorialIsActive,
      showDailyHotspot,
      hotspotLastShownDate,
      today: new Date().toISOString().split('T')[0],
      clustersLength: clusters.length,
      hasTriggered: hasTriggeredRef.current,
      hotspotSettingChanged,
    });

    // 0a. Check if setting just changed - if so, reset evaluation flag and block
    // This must happen BEFORE the evaluation window check to prevent race conditions
    if (hotspotSettingChanged) {
      hotspotDebugLog('[Hotspot] Setting changed during evaluation - resetting evaluation flag');
      return false;
    }

    // 0b. Must be in evaluation window (app foreground)
    // This prevents hotspot from triggering when user enables it in settings mid-session
    if (!canEvaluateTrigger) {
      hotspotDebugLog('[Hotspot] Blocked: not in evaluation window (app not foregrounded)');
      return false;
    }

    // 1. Tutorial not active
    if (tutorialIsActive) {
      hotspotDebugLog('[Hotspot] Blocked: tutorial active');
      return false;
    }

    // 2. User hasn't disabled it (for authenticated users)
    // Guests always see it (showDailyHotspot defaults to true)
    if (user && !showDailyHotspot) {
      hotspotDebugLog('[Hotspot] Blocked: user disabled hotspot');
      return false;
    }

    // 3. Haven't shown today (skip check if DEBUG_IGNORE_DATE is true)
    if (!DEBUG_IGNORE_DATE) {
      const today = new Date().toISOString().split('T')[0];
      if (hotspotLastShownDate === today) {
        hotspotDebugLog('[Hotspot] Blocked: already shown today');
        return false;
      }
    } else {
      hotspotDebugLog('[Hotspot] DEBUG: Ignoring date check (DEBUG_IGNORE_DATE = true)');
    }

    // 4. Clusters are loaded
    if (!clusters || clusters.length === 0) {
      hotspotDebugLog('[Hotspot] Blocked: no clusters loaded');
      return false;
    }

    // 5. Haven't already triggered this session
    if (hasTriggeredRef.current) {
      hotspotDebugLog('[Hotspot] Blocked: already triggered this session');
      return false;
    }

    hotspotDebugLog('[Hotspot] All checks passed - hotspot should trigger');
    return true;
  }, [canEvaluateTrigger, tutorialIsActive, user, showDailyHotspot, hotspotLastShownDate, clusters]);

  useEffect(() => {
    if (prevShowDailyHotspotRef.current === showDailyHotspot) {
      return;
    }

    hotspotDebugLog('[Hotspot] Setting changed - resetting evaluation flag');
    prevShowDailyHotspotRef.current = showDailyHotspot;
    setCanEvaluateTriggerFlag(false);
  }, [showDailyHotspot, setCanEvaluateTriggerFlag]);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    console.log('[HotspotEligibility]', {
      shouldShowHotspot,
      tutorialIsActive,
      showDailyHotspot,
      hotspotLastShownDate: hotspotLastShownDate ?? 'none',
      today,
      clusterCount: clusters.length,
      canEvaluateTrigger: canEvaluateTriggerRef.current,
      hasTriggeredThisSession: hasTriggeredRef.current,
      appState: AppState.currentState,
      blockedBecauseAlreadyShownToday: hotspotLastShownDate === today,
    });
  }, [
    clusters.length,
    hotspotLastShownDate,
    shouldShowHotspot,
    showDailyHotspot,
    tutorialIsActive,
  ]);

  // Tooltip text is now captured in triggerHotspot BEFORE zoom occurs
  // This avoids issues where cluster splits apart at higher zoom levels
  const tooltipText = capturedTooltipText;
  const tooltipSubtext = capturedTooltipSubtext;

  /**
   * Dismiss the hotspot and zoom back to original position
   */
  const dismiss = useCallback(() => {
    traceMapEvent('hotspot_dismiss_requested', {
      targetClusterId: targetCluster?.id ?? 'none',
      hadOriginalCamera: !!originalCameraRef.current,
    });

    // Clear auto-dismiss timeout
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }

    setIsVisible(false);
    overlayPositionReadyRef.current = false;
    visibleSourceRef.current = null;

    // Zoom back to original position
    const cameraRef = (global as any).mapCameraRef;
    if (cameraRef?.current && originalCameraRef.current) {
      const coords = originalCameraRef.current.coordinates;

      // Validate coordinates are valid numbers before zooming
      if (
        Array.isArray(coords) &&
        coords.length === 2 &&
        typeof coords[0] === 'number' &&
        typeof coords[1] === 'number' &&
        !isNaN(coords[0]) &&
        !isNaN(coords[1])
      ) {
        setHotspotProgrammaticLock(true, 'dismiss_zoom_back');

        cameraRef.current.setCamera({
          centerCoordinate: coords,
          zoomLevel: originalCameraRef.current.zoom,
          animationDuration: 800,
        });

        setTimeout(() => {
          setHotspotProgrammaticLock(false, 'dismiss_zoom_back_complete');
        }, 900);
      }
    }

    // Track analytics
    amplitudeTrack('hotspot_dismissed', {
      auto_dismissed: dismissTimeoutRef.current === null,
    });
  }, [setHotspotProgrammaticLock, targetCluster]);

  const onOverlayPositionReady = useCallback(() => {
    if (!isVisible || !targetCluster || overlayPositionReadyRef.current) {
      return;
    }

    overlayPositionReadyRef.current = true;
    logAndroidHotspotTiming('overlay_position_ready_callback', {
      targetClusterId: targetCluster.id,
      venueCount: targetCluster.venues?.length ?? 0,
    });
    markHotspotShownToday();

    // Reset evaluation only after the user-visible overlay is genuinely on
    // screen. This avoids consuming the daily hotspot behind first-run prompts.
    setCanEvaluateTriggerFlag(false);
    hotspotDebugLog('[Hotspot] Evaluation flag reset after overlay position ready');

    const source = visibleSourceRef.current || 'camera_ready';

    amplitudeTrack('hotspot_shown', {
      cluster_id: targetCluster.id,
      time_status: targetCluster.timeStatus,
      event_count: targetCluster.eventCount,
      special_count: targetCluster.specialCount,
      venue_name: targetCluster.venues?.[0]?.venue || 'unknown',
      source,
    });

    dismissTimeoutRef.current = setTimeout(() => {
      traceMapEvent('hotspot_auto_dismiss_timer_fired', {
        clusterId: targetCluster.id,
        delayMs: 7000,
      });
      dismissTimeoutRef.current = null;
      dismiss();
    }, 7000);

    flushPendingClusterStoreSync('overlay_ready');
  }, [
    dismiss,
    flushPendingClusterStoreSync,
    isVisible,
    logAndroidHotspotTiming,
    markHotspotShownToday,
    setCanEvaluateTriggerFlag,
    targetCluster,
  ]);

  /**
   * Trigger the hotspot animation sequence
   */
  const triggerHotspot = useCallback(async () => {
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;
    hotspotTimingStartRef.current = Date.now();
    overlayPositionReadyRef.current = false;
    visibleSourceRef.current = null;
    logAndroidHotspotTiming('trigger_started', {
      clusterCount: clusters.length,
    });
    traceMapEvent('hotspot_trigger_started', {
      clusterCount: clusters.length,
    });

    const hottest = findHottestCluster(clusters);
    if (!hottest) {
      logAndroidHotspotTiming('trigger_aborted_no_cluster');
      traceMapEvent('hotspot_trigger_aborted_no_cluster');
      return;
    }

    setTargetCluster(hottest);

    // Find the hottest venue within the cluster using additive scoring (matches handleMarkerPress)
    // Score = favoriteVenue(500) + interest(100) + time(10/5/1)
    const sortedVenues = hottest.venues ? sortVenuesByRelevance(hottest.venues, favoriteVenues, userInterests) : [];
    const hottestVenue = sortedVenues[0] || hottest.venues?.[0];
    logAndroidHotspotTiming('hottest_cluster_selected', {
      clusterId: hottest.id,
      clusterVenueCount: hottest.venues?.length ?? 0,
      eventCount: hottest.eventCount,
      specialCount: hottest.specialCount,
      hottestVenueName: hottestVenue?.venue ?? 'none',
      hottestVenueLatitude: hottestVenue?.latitude ?? null,
      hottestVenueLongitude: hottestVenue?.longitude ?? null,
    });

    if (hottestVenue && sortedVenues.length > 1) {
      const hotness = getVenueHotness(hottestVenue);
      const isFav = hottestVenue.locationKey ? favoriteVenues.includes(hottestVenue.locationKey) : false;
      hotspotDebugLog(`[Hotspot] Selected hottest venue: ${hottestVenue.venue} (fav=${isFav}, now=${hotness.nowCount}, today=${hotness.todayCount}, total=${hotness.total}) from ${hottest.venues?.length || 0} venues`);

      // DEBUG: Log all venues with their hotness scores for comparison
      hotspotDebugLog('[Hotspot] ===== All venues in cluster (sorted by relevance) =====');
      sortedVenues.forEach((v, idx) => {
        const vHot = getVenueHotness(v);
        const vIsFav = v.locationKey ? favoriteVenues.includes(v.locationKey) : false;
        hotspotDebugLog(`[Hotspot]   ${idx + 1}. ${v.venue}: fav=${vIsFav}, now=${vHot.nowCount}, today=${vHot.todayCount}, total=${vHot.total}`);
        // Log events at this venue
        (v.events || []).forEach((evt: any) => {
          const evtIsNow = isEventNow(evt.startDate, evt.startTime, evt.endDate, evt.endTime);
          hotspotDebugLog(`[Hotspot]      - "${evt.title}" (${evt.category}) | ${evt.startDate} ${evt.startTime}-${evt.endTime} | isNow=${evtIsNow}`);
        });
      });
    }

    // Store target coordinates and name of the hottest venue
    if (hottestVenue) {
      targetCoordsRef.current = {
        longitude: hottestVenue.longitude,
        latitude: hottestVenue.latitude,
      };
      hottestVenueNameRef.current = hottestVenue.venue;

      // DEBUG LOG 2: Log the 'hottest event' in the hottest venue
      const venueEvents = hottestVenue.events || [];
      // Find hottest event (NOW > TODAY > FUTURE)
      let hottestEvent: any = null;
      for (const evt of venueEvents) {
        const evtIsNow = isEventNow(evt.startDate, evt.startTime, evt.endDate, evt.endTime);
        if (evtIsNow) {
          hottestEvent = evt;
          break;
        }
        if (!hottestEvent) hottestEvent = evt;
      }
      if (hottestEvent) {
        hotspotDebugLog('[Hotspot] ===== Hottest Event =====');
        hotspotDebugLog(`[Hotspot] Hottest event: "${hottestEvent.title}" (${hottestEvent.category})`);
        hotspotDebugLog(`[Hotspot]   Venue: ${hottestVenue.venue}`);
        hotspotDebugLog(`[Hotspot]   Date: ${hottestEvent.startDate} ${hottestEvent.startTime}-${hottestEvent.endTime}`);
        const evtIsNow = isEventNow(hottestEvent.startDate, hottestEvent.startTime, hottestEvent.endDate, hottestEvent.endTime);
        hotspotDebugLog(`[Hotspot]   Is happening NOW: ${evtIsNow}`);
      }
    }

    const captureOriginalCameraPosition = () => {
      try {
        const mapStore = useMapStore.getState();

        // Validate userLocation coordinates are actual numbers
        // userLocation is a Location.LocationObject, so coords are under .coords
        const hasValidUserLocation = userLocation &&
          userLocation.coords &&
          typeof userLocation.coords.longitude === 'number' &&
          typeof userLocation.coords.latitude === 'number' &&
          !isNaN(userLocation.coords.longitude) &&
          !isNaN(userLocation.coords.latitude);

        const coordinates: [number, number] = hasValidUserLocation
          ? [userLocation.coords.longitude, userLocation.coords.latitude]
          : [-63.1276, 46.2336]; // Default to Halifax/PEI area

        originalCameraRef.current = {
          coordinates,
          zoom: mapStore?.zoomLevel || 12,
        };
      } catch (e) {
        // Set fallback so we don't crash on zoom-back
        originalCameraRef.current = {
          coordinates: [-63.1276, 46.2336],
          zoom: 12,
        };
      }
    };

    const showHotspot = (
      clusterForTooltip: Cluster,
      source: 'camera_ready' | 'camera_unavailable' | 'camera_retry',
      traceLabel: string
    ) => {
      if (initialHotspotShownRef.current) {
        return;
      }

      initialHotspotShownRef.current = true;
      overlayPositionReadyRef.current = false;
      visibleSourceRef.current = source;
      const tooltip = generateTooltipText(clusterForTooltip);
      setTargetCluster(clusterForTooltip);
      setCapturedTooltipText(tooltip.text);
      setCapturedTooltipSubtext(tooltip.subtext);
      setIsVisible(true);
      logAndroidHotspotTiming('visible_state_set', {
        traceLabel,
        clusterId: clusterForTooltip.id,
        venueCount: clusterForTooltip.venues?.length ?? 0,
        targetLatitude: targetCoordsRef.current?.latitude ?? null,
        targetLongitude: targetCoordsRef.current?.longitude ?? null,
      });
      traceMapEvent(traceLabel, {
        clusterId: clusterForTooltip.id,
        venueCount: clusterForTooltip.venues?.length ?? 0,
        tooltipText: tooltip.text,
        source,
      });
      if (__DEV__) {
        console.log('[HotspotTiming] visible', {
          clusterId: clusterForTooltip.id,
          tooltipText: tooltip.text,
          source,
          traceLabel,
        });
      }
    };

    const showInitialHotspot = (source: 'camera_ready' | 'camera_unavailable' | 'camera_retry') => {
      showHotspot(hottest, source, 'hotspot_visible_initial');
    };

    const startHotspotCameraAnimation = (
      cameraRef: React.MutableRefObject<any>,
      source: 'camera_ready' | 'camera_retry'
    ) => {
      if (!hottestVenue) {
        return false;
      }

      captureOriginalCameraPosition();
      setIsAnimating(true);
      logAndroidHotspotTiming('camera_animation_started', {
        clusterId: hottest.id,
        venueName: hottestVenue.venue,
        targetLatitude: hottestVenue.latitude,
        targetLongitude: hottestVenue.longitude,
        source,
        animationDurationMs: HOTSPOT_CAMERA_ANIMATION_MS,
        deferredUntilRefined: DEFER_HOTSPOT_VISIBILITY_UNTIL_REFINED,
      });
      traceMapEvent('hotspot_camera_animation_started', {
        clusterId: hottest.id,
        venueName: hottestVenue.venue,
        source,
      });

      // Set flag to prevent cluster regeneration during zoom (same as tutorial)
      setHotspotProgrammaticLock(true, 'trigger_zoom_in');

      let cameraFinalized = false;

      const finalizeCameraAnimation = (completionSource: 'map_idle' | 'timer') => {
        if (cameraFinalized) {
          return;
        }

        cameraFinalized = true;
        clearCameraFinalizeTimer();
        clearHotspotCameraIdleCallback();
        logAndroidHotspotTiming('camera_animation_finalize_started', {
          source,
          completionSource,
          targetZoom: HOTSPOT_CAMERA_ZOOM_LEVEL,
        });

        const shouldDeferProgrammaticUnlock = Platform.OS === 'android';
        const releaseProgrammaticLock = (reasonSuffix = '') => {
          setHotspotProgrammaticLock(
            false,
            `trigger_zoom_in_complete_${completionSource}${reasonSuffix}`
          );
        };

        if (!shouldDeferProgrammaticUnlock) {
          releaseProgrammaticLock();
        }
        setIsAnimating(false);

        // During the programmatic camera move, camera-change handling suppresses
        // reclustering. Android computes the target zoom cluster without first
        // publishing it to the map UI so the overlay can paint before MarkerView
        // work starts.
        let currentClusters = useMapStore.getState().clusters;
        let shouldSyncClusterStoreAfterVisible = false;
        try {
          if (Platform.OS === 'android') {
            currentClusters = useMapStore.getState().getClustersForZoom(HOTSPOT_CAMERA_ZOOM_LEVEL);
            shouldSyncClusterStoreAfterVisible = true;
            logAndroidHotspotTiming('refinement_clusters_previewed', {
              currentClusterCount: currentClusters.length,
              targetZoom: HOTSPOT_CAMERA_ZOOM_LEVEL,
            });
          } else {
            useMapStore.getState().setZoomLevel(HOTSPOT_CAMERA_ZOOM_LEVEL);
            currentClusters = useMapStore.getState().clusters;
          }
        } catch (e) {
          logAndroidHotspotTiming('refinement_zoom_sync_failed', {
            error: e instanceof Error ? e.message : String(e),
          });
          currentClusters = useMapStore.getState().clusters;
        }

        // Find the cluster that contains the original hottest venue by name
        // This ensures we highlight the correct cluster even after splitting at higher zoom
        let zoomedCluster: Cluster | null = null;

        if (hottestVenueNameRef.current && currentClusters.length > 0) {
          const targetVenueName = hottestVenueNameRef.current;

          // Find the cluster containing the original hottest venue
          for (const c of currentClusters) {
            const hasVenue = c.venues?.some(v => v.venue === targetVenueName);
            if (hasVenue) {
              zoomedCluster = c;
              hotspotDebugLog(`[Hotspot] Found cluster containing "${targetVenueName}" with ${c.venues?.length} venues`);
              break;
            }
          }

          // Fallback: if venue not found (shouldn't happen), use distance-based search
          if (!zoomedCluster && targetCoordsRef.current) {
            hotspotDebugLog(`[Hotspot] Warning: Could not find cluster containing "${targetVenueName}", falling back to distance search`);
            const targetLon = targetCoordsRef.current.longitude;
            const targetLat = targetCoordsRef.current.latitude;
            let minDist = Infinity;
            for (const c of currentClusters) {
              const venue = c.venues?.[0];
              if (venue) {
                const dist = Math.sqrt(
                  Math.pow(venue.longitude - targetLon, 2) +
                  Math.pow(venue.latitude - targetLat, 2)
                );
                if (dist < minDist) {
                  minDist = dist;
                  zoomedCluster = c;
                }
              }
            }
          }
        }

        // Generate tooltip from the zoomed-in cluster (or fall back to original)
        const clusterForTooltip = zoomedCluster || hottest;
        logAndroidHotspotTiming('refinement_cluster_resolved', {
          source,
          completionSource,
          currentClusterCount: currentClusters.length,
          zoomedClusterFound: !!zoomedCluster,
          targetVenueName: hottestVenueNameRef.current ?? 'none',
          clusterId: clusterForTooltip.id,
          venueCount: clusterForTooltip.venues?.length ?? 0,
        });
        const { text, subtext } = generateTooltipText(clusterForTooltip);
        setCapturedTooltipText(text);
        setCapturedTooltipSubtext(subtext);

        // DEBUG LOG 1: Log the actual tooltip text
        hotspotDebugLog('[Hotspot] ===== Tooltip Text =====');
        hotspotDebugLog(`[Hotspot] Tooltip: "${text}" / "${subtext}"`);

        // DEBUG LOG 3: Log the cluster after zooming in
        hotspotDebugLog('[Hotspot] ===== Cluster after zoom (used for tooltip) =====');
        hotspotDebugLog(`[Hotspot] Zoomed cluster: timeStatus=${clusterForTooltip.timeStatus}, events=${clusterForTooltip.eventCount}, venues=${clusterForTooltip.venues?.length}`);
        clusterForTooltip.venues?.forEach((v, idx) => {
          hotspotDebugLog(`[Hotspot]   Venue ${idx + 1}: ${v.venue} (${v.events?.length || 0} events)`);
          (v.events || []).forEach((evt: any) => {
            hotspotDebugLog(`[Hotspot]      - "${evt.title}" (${evt.category})`);
          });
        });

        // Update targetCluster to the zoomed one for correct timeStatus coloring
        if (zoomedCluster) {
          setTargetCluster(zoomedCluster);

          // Update targetCoordsRef to the cluster's centroid position
          // This ensures the highlight circle is positioned over the cluster marker,
          // not the original venue coordinates (clusters use centroid of their venues)
          if (zoomedCluster.venues && zoomedCluster.venues.length > 0) {
            let sumLat = 0;
            let sumLon = 0;
            for (const v of zoomedCluster.venues) {
              sumLat += v.latitude;
              sumLon += v.longitude;
            }
            const centroidLat = sumLat / zoomedCluster.venues.length;
            const centroidLon = sumLon / zoomedCluster.venues.length;

            targetCoordsRef.current = {
              latitude: centroidLat,
              longitude: centroidLon,
            };
            logAndroidHotspotTiming('refinement_target_coords_updated', {
              clusterId: zoomedCluster.id,
              centroidLatitude: centroidLat,
              centroidLongitude: centroidLon,
              venueCount: zoomedCluster.venues.length,
            });

            if (Platform.OS === 'android' && cameraRef.current) {
              cameraRef.current.setCamera({
                centerCoordinate: [centroidLon, centroidLat],
                zoomLevel: HOTSPOT_CAMERA_ZOOM_LEVEL,
                animationDuration: 0,
              });
              logAndroidHotspotTiming('camera_recentered_to_refined_cluster', {
                clusterId: zoomedCluster.id,
                centroidLatitude: centroidLat,
                centroidLongitude: centroidLon,
              });
            }

            hotspotDebugLog(`[Hotspot] Updated targetCoords to cluster centroid: lat=${centroidLat.toFixed(6)}, lon=${centroidLon.toFixed(6)}`);
          }
        }
        traceMapEvent('hotspot_refined_after_zoom', {
          clusterId: clusterForTooltip.id,
          venueCount: clusterForTooltip.venues?.length ?? 0,
          tooltipText: text,
          completionSource,
        });

        if (DEFER_HOTSPOT_VISIBILITY_UNTIL_REFINED) {
          showHotspot(clusterForTooltip, source, 'hotspot_visible_refined');
        }

        if (shouldSyncClusterStoreAfterVisible) {
          pendingClusterStoreSyncRef.current = true;
          pendingClusterUnlockReasonRef.current =
            `trigger_zoom_in_complete_${completionSource}_overlay_ready_sync`;
          if (deferredClusterSyncTimerRef.current) {
            clearTimeout(deferredClusterSyncTimerRef.current);
          }
          deferredClusterSyncTimerRef.current = setTimeout(() => {
            deferredClusterSyncTimerRef.current = null;
            flushPendingClusterStoreSync('backup_timer');
          }, ANDROID_CLUSTER_STORE_SYNC_BACKUP_MS);
        } else if (shouldDeferProgrammaticUnlock) {
          releaseProgrammaticLock('_fallback');
        }
      };

      const cameraAnimationStartedAt = Date.now();
      const idleCallback = () => {
        const elapsed = Date.now() - cameraAnimationStartedAt;
        if (elapsed < HOTSPOT_MIN_CAMERA_IDLE_MS) {
          logAndroidHotspotTiming('camera_idle_ignored_too_early', {
            elapsedMs: elapsed,
            minIdleMs: HOTSPOT_MIN_CAMERA_IDLE_MS,
          });
          return;
        }
        finalizeCameraAnimation('map_idle');
      };

      hotspotCameraIdleCallbackRef.current = idleCallback;
      (global as any).mapHotspotCameraIdleCallback = idleCallback;

      cameraRef.current.setCamera({
        centerCoordinate: [hottestVenue.longitude, hottestVenue.latitude],
        zoomLevel: HOTSPOT_CAMERA_ZOOM_LEVEL, // Same zoom as tutorial for consistency
        animationDuration: HOTSPOT_CAMERA_ANIMATION_MS,
      });

      // Wait for the zoomed-cluster refinement so the ring does not flash at
      // the pre-zoom venue coordinate before snapping to the final marker.
      if (!DEFER_HOTSPOT_VISIBILITY_UNTIL_REFINED) {
        showInitialHotspot(source);
      } else {
        logAndroidHotspotTiming('visibility_deferred_until_refined', {
          source,
        });
      }

      // Fallback for platforms/builds where Mapbox does not emit a usable idle
      // callback. On the Samsung tablet this timer can slip badly, so map-idle
      // is the primary path.
      cameraFinalizeTimerRef.current = setTimeout(() => {
        logAndroidHotspotTiming('refinement_timer_fired', {
          source,
        });
        finalizeCameraAnimation('timer');
      }, HOTSPOT_CAMERA_ANIMATION_MS + 100);
      return true;
    };

    const retryCameraAnimation = (attempt: number) => {
      const retryCameraRef = (global as any).mapCameraRef;
      if (retryCameraRef?.current) {
        cameraRefRetryCountRef.current = 0;
        clearCameraRetryTimer();
        clearHotspotCameraReadyCallback();
        logAndroidHotspotTiming('camera_ref_retry_ready', {
          attempt,
        });
        startHotspotCameraAnimation(retryCameraRef, 'camera_retry');
        return;
      }

      if (attempt > 20) {
        logAndroidHotspotTiming('camera_ref_retry_abandoned', {
          attempts: attempt - 1,
        });
        if (__DEV__) {
          console.log('[HotspotTiming] camera ref unavailable; keeping initial hotspot without camera');
        }
        traceMapEvent('hotspot_camera_retry_abandoned', {
          clusterId: hottest.id,
          attempts: attempt - 1,
        });
        return;
      }

      if (__DEV__) {
        console.log('[HotspotTiming] camera ref unavailable; retrying zoom', {
          attempt,
        });
      }
      cameraRetryTimerRef.current = setTimeout(() => {
        cameraRetryTimerRef.current = null;
        retryCameraAnimation(attempt + 1);
      }, 250);
    };

    // Get camera ref from global (same pattern as tutorial). Keep the visible
    // hotspot hidden until the camera is ready so Android cannot flash the ring
    // at the unrefined venue coordinate.
    const cameraRef = (global as any).mapCameraRef;
    if (!cameraRef?.current) {
      logAndroidHotspotTiming('camera_ref_unavailable_initial');
      const readyCallback = () => {
        logAndroidHotspotTiming('camera_ref_ready_callback_invoked');
        retryCameraAnimation(1);
      };
      hotspotCameraReadyCallbackRef.current = readyCallback;
      (global as any).mapHotspotCameraReadyCallback = readyCallback;
      retryCameraAnimation(1);
      return;
    }

    cameraRefRetryCountRef.current = 0;
    startHotspotCameraAnimation(cameraRef, 'camera_ready');
  }, [
    clearCameraFinalizeTimer,
    clearCameraRetryTimer,
    clearHotspotCameraIdleCallback,
    clearHotspotCameraReadyCallback,
    flushPendingClusterStoreSync,
    clusters,
    favoriteVenues,
    logAndroidHotspotTiming,
    setHotspotProgrammaticLock,
    userInterests,
    userLocation,
  ]);

  /**
   * Disable hotspot permanently (user clicked "Don't show again")
   */
  const disablePermanently = useCallback(async () => {
    // Update local state immediately
    setShowDailyHotspot(false);

    // Persist to Firestore if user is authenticated
    if (user?.uid) {
      try {
        await updateShowDailyHotspot(user.uid, false);
      } catch (e) {
        console.warn('[Hotspot] Failed to persist setting:', e);
      }
    }

    // Dismiss the current hotspot
    dismiss();

    // Track analytics
    amplitudeTrack('hotspot_disabled', {
      source: 'tooltip',
    });
  }, [user, setShowDailyHotspot, dismiss]);

  /**
   * Handle tap on the tooltip (opens cluster callout like normal cluster tap)
   */
  const onClusterTap = useCallback(() => {
    traceMapEvent('hotspot_tooltip_tapped', {
      targetClusterId: targetCluster?.id ?? 'none',
    });

    // Clear auto-dismiss
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }

    setIsVisible(false);

    // Open the cluster callout by selecting it in the store
    // Need to call selectVenues, selectVenue, and selectCluster (same as handleClusterPress in map.tsx)
    if (targetCluster && targetCluster.venues && targetCluster.venues.length > 0) {
      const { selectCluster, selectVenues, selectVenue } = useMapStore.getState();

      // Sort venues by additive relevance score (matches handleMarkerPress)
      // Score = favoriteVenue(500) + interest(100) + time(10/5/1)
      const sortedVenues = sortVenuesByRelevance(targetCluster.venues, favoriteVenues, userInterests);

      // DEBUG LOG 4: Log which venue is selected when cluster opens (via tooltip tap)
      hotspotDebugLog('[Hotspot] ===== Cluster opened via tooltip tap =====');
      hotspotDebugLog(`[Hotspot] Target cluster: timeStatus=${targetCluster.timeStatus}, venues=${targetCluster.venues.length}`);
      const selectedHotness = getVenueHotness(sortedVenues[0]);
      hotspotDebugLog(`[Hotspot] Hottest venue (will be selected): ${sortedVenues[0]?.venue} (now=${selectedHotness.nowCount}, today=${selectedHotness.todayCount}, total=${selectedHotness.total})`);
      sortedVenues.forEach((v, idx) => {
        const vHot = getVenueHotness(v);
        hotspotDebugLog(`[Hotspot]   Venue ${idx + 1}: ${v.venue} (now=${vHot.nowCount}, today=${vHot.todayCount}, total=${vHot.total})`);
      });

      // Select venues with hottest first
      selectVenues(sortedVenues);

      // Select the hottest venue as primary
      selectVenue(sortedVenues[0]);

      // Select the cluster itself for multi-venue clusters
      if (targetCluster.clusterType === 'multi') {
        selectCluster(targetCluster);
      } else {
        selectCluster(null);
      }

      traceMapEvent('hotspot_tooltip_selected_cluster', {
        targetClusterId: targetCluster.id,
        venueCount: sortedVenues.length,
        selectedClusterId: targetCluster.clusterType === 'multi' ? targetCluster.id : 'none',
        primaryVenue: sortedVenues[0]?.venue || 'unknown',
      });

    }

    // Don't zoom back - let them explore the cluster

    // Track analytics
    amplitudeTrack('hotspot_cluster_tapped', {
      cluster_id: targetCluster?.id,
    });
  }, [targetCluster]);

  // Trigger hotspot when conditions are met
  useEffect(() => {
    if (
      shouldShowHotspot &&
      clusters.length > 0 &&
      !hasTriggeredRef.current &&
      !triggerTimerRef.current
    ) {
      // Keep this timer stable once scheduled so normal cluster re-renders/camera
      // ticks do not keep canceling the daily hotspot on slower Android devices.
      traceMapEvent('hotspot_trigger_scheduled', {
        clusterCount: clusters.length,
        delayMs: HOTSPOT_TRIGGER_DELAY_MS,
      });
      logAndroidHotspotTiming('trigger_scheduled', {
        clusterCount: clusters.length,
        delayMs: HOTSPOT_TRIGGER_DELAY_MS,
      });
      if (__DEV__) {
        console.log('[HotspotTiming] trigger scheduled', {
          clusterCount: clusters.length,
          delayMs: HOTSPOT_TRIGGER_DELAY_MS,
        });
      }

      const fireTrigger = () => {
        logAndroidHotspotTiming('trigger_timer_fired');
        if (__DEV__) {
          console.log('[HotspotTiming] trigger timer fired');
        }
        triggerHotspot();
      };

      if (HOTSPOT_TRIGGER_DELAY_MS === 0) {
        fireTrigger();
      } else {
        triggerTimerRef.current = setTimeout(() => {
          triggerTimerRef.current = null;
          fireTrigger();
        }, HOTSPOT_TRIGGER_DELAY_MS);
      }
    }

    if ((!shouldShowHotspot || clusters.length === 0 || hasTriggeredRef.current) && triggerTimerRef.current) {
      clearTimeout(triggerTimerRef.current);
      triggerTimerRef.current = null;
    }
  }, [shouldShowHotspot, clusters.length, logAndroidHotspotTiming, triggerHotspot]);

  // Watch for cluster selection on the map (user tapped a cluster directly)
  // When this happens, hide the hotspot tooltip without zooming back
  const selectedVenues = useMapStore((state) => state.selectedVenues);
  useEffect(() => {
    // If hotspot is visible and user selected venues (tapped a cluster), hide the tooltip
    if (isVisible && selectedVenues && selectedVenues.length > 0) {
      traceMapEvent('hotspot_hidden_for_cluster_selection', {
        selectedVenueCount: selectedVenues.length,
      });

      // Clear auto-dismiss timeout
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
        dismissTimeoutRef.current = null;
      }

      setIsVisible(false);
      // Don't zoom back - user is exploring the cluster they tapped
    }
  }, [selectedVenues, isVisible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (triggerTimerRef.current) {
        clearTimeout(triggerTimerRef.current);
        triggerTimerRef.current = null;
      }
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
      }
      if (deferredClusterSyncTimerRef.current) {
        clearTimeout(deferredClusterSyncTimerRef.current);
        deferredClusterSyncTimerRef.current = null;
      }
      pendingClusterStoreSyncRef.current = false;
      pendingClusterUnlockReasonRef.current = null;
      ignoreProgrammaticCameraRef.current = false;
    };
  }, []);

  return {
    shouldShow: isVisible,
    targetCluster,
    tooltipText,
    tooltipSubtext,
    isAnimating,
    targetCoordinates: targetCoordsRef.current,
    dismiss,
    disablePermanently,
    onClusterTap,
    onOverlayPositionReady,
  };
}
