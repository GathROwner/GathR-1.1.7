import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAdPoolStore } from '../store/adPoolStore';
import { NativeAd } from 'react-native-google-mobile-ads';

export type NativeAdData = {
  ad: NativeAd | null;
  loading: boolean;
};

export type AdDebugInfo = string[];

// Disable verbose logging in production - console.log is slow in React Native
const DEBUG_ADS = false;
const MAX_LOGGED_ADS = 5;
const ANDROID_FOCUSED_AD_WORK_DELAY_MS = 8000;
const ANDROID_FOCUSED_AD_LOAD_COUNT = 4;
const ANDROID_AD_REFRESH_MAX_AGE_MS = 20 * 60 * 1000;

const summarizeAd = (ad: NativeAd | null) => {
  if (!ad) {
    return {
      id: 'null',
      headline: '',
      advertiser: '',
      hasBody: false,
      bodyLength: 0,
      hasCTA: false,
      hasIcon: false,
      hasMediaContent: false,
      aspectRatio: null as number | null,
      store: '',
      price: '',
      starRating: null as number | null,
    };
  }

  return {
    id: `${ad.headline || ''}-${ad.advertiser || ''}-${ad.body || ''}`.toLowerCase().trim(),
    headline: ad.headline || '',
    advertiser: ad.advertiser || '',
    hasBody: Boolean(ad.body),
    bodyLength: ad.body?.length ?? 0,
    hasCTA: Boolean(ad.callToAction),
    hasIcon: Boolean(ad.icon?.url),
    hasMediaContent: Boolean(ad.mediaContent),
    aspectRatio:
      typeof ad.mediaContent?.aspectRatio === 'number' ? ad.mediaContent.aspectRatio : null,
    store: ad.store || '',
    price: ad.price || '',
    starRating: typeof ad.starRating === 'number' ? ad.starRating : null,
  };
};

/**
 * Hook to get native ads from the centralized ad pool.
 *
 * This hook now uses a shared ad pool (adPoolStore) instead of loading ads independently.
 * Benefits:
 * - Each ad type uses one centralized pool (no duplicate loaders per screen)
 * - Rate limiting is handled centrally (30s cooldown between loads)
 * - Ads persist across tab switches and callout opens
 * - Small pools keep requests close to placements users can realistically view
 *
 * @param count - Number of distinct ad instances needed for display
 * @param tabType - 'events' or 'specials' to determine which ad pool to use
 * @param startIndex - Optional offset to start from in the ad pool (useful for showing different ads per venue tab)
 * @param onDebugLog - Optional callback for debug logging (kept for backwards compatibility)
 * @returns Array of NativeAdData objects
 */
export default function useNativeAds(
  count: number = 3,
  tabType: 'events' | 'specials' = 'events',
  startIndex: number = 0,
  onDebugLog?: (message: string) => void
): NativeAdData[] {
  // Get pool store actions and state
  const loadAds = useAdPoolStore((s) => s.loadAds);
  const refreshIfStale = useAdPoolStore((s) => s.refreshIfStale);
  const claimAds = useAdPoolStore((s) => s.claimAds);
  const releaseAds = useAdPoolStore((s) => s.releaseAds);
  const isLoading = useAdPoolStore((s) => s.isLoading[tabType]);
  const poolAds = useAdPoolStore((s) => (tabType === 'events' ? s.eventsAds : s.specialsAds));
  const ownerIdRef = useRef(`native-ads-${Math.random().toString(36).slice(2, 10)}`);
  const lastPoolSignatureRef = useRef('');
  const lastSelectionSignatureRef = useRef('');
  const isFocusedRef = useRef(false);
  const focusedAdWorkCancelRef = useRef<(() => void) | null>(null);
  const [nativeAdsData, setNativeAdsData] = useState<NativeAdData[]>(
    Array(count)
      .fill(0)
      .map(() => ({ ad: null, loading: false }))
  );

  const logMessage = useCallback((message: string) => {
    if (onDebugLog) {
      onDebugLog(`[ADMOB ${tabType}]: ${message}`);
    }
    // Only log to console when debugging - console.log is slow in React Native
    if (DEBUG_ADS) {
      console.log(`[useNativeAds ${tabType}]: ${message}`);
    }
  }, [onDebugLog, tabType]);

  const logStructured = useCallback((event: string, payload: Record<string, unknown>) => {
    if (DEBUG_ADS) {
      console.log(`[useNativeAds ${tabType}] ${event}`, payload);
    }
  }, [tabType]);

  const latestStateRef = useRef({
    count,
    tabType,
    startIndex,
    isLoading,
    poolAds,
    loadAds,
    refreshIfStale,
    claimAds,
    releaseAds,
  });

  latestStateRef.current = {
    count,
    tabType,
    startIndex,
    isLoading,
    poolAds,
    loadAds,
    refreshIfStale,
    claimAds,
    releaseAds,
  };

  const updateIfChanged = useCallback((next: NativeAdData[]) => {
    setNativeAdsData((prev) => {
      const sameLength = prev.length === next.length;
      const sameEntries =
        sameLength &&
        prev.every((entry, index) => {
          const nextEntry = next[index];
          return entry.loading === nextEntry.loading && entry.ad === nextEntry.ad;
        });
      return sameEntries ? prev : next;
    });
  }, []);

  const makeEmptySlots = useCallback(
    (slotCount: number, loading: boolean = false) =>
      Array(slotCount)
        .fill(0)
        .map(() => ({ ad: null, loading })),
    []
  );

  const cancelFocusedAdWork = useCallback(() => {
    if (focusedAdWorkCancelRef.current) {
      focusedAdWorkCancelRef.current();
      focusedAdWorkCancelRef.current = null;
    }
  }, []);

  const scheduleFocusedAdWork = useCallback((reason: string) => {
    cancelFocusedAdWork();

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const handle = InteractionManager.runAfterInteractions(() => {
      const delayMs = Platform.OS === 'android' ? ANDROID_FOCUSED_AD_WORK_DELAY_MS : 0;
      timeoutId = setTimeout(() => {
        timeoutId = null;
        if (cancelled || !isFocusedRef.current) {
          return;
        }

        const state = latestStateRef.current;
        const ownerId = ownerIdRef.current;

        logStructured('focused_ad_work_started', {
          reason,
          tabType: state.tabType,
          count: state.count,
          startIndex: state.startIndex,
          ownerId,
          poolSize: state.poolAds.length,
          isLoading: state.isLoading,
        });

        if (state.count <= 0) {
          state.releaseAds(state.tabType, ownerId);
          updateIfChanged([]);
          return;
        }

        if (state.poolAds.length === 0) {
          if (state.isLoading) {
            logMessage(`Loading state - returning ${state.count} loading placeholders for owner=${ownerId}`);
            updateIfChanged(makeEmptySlots(state.count, true));
            return;
          }

          logMessage(`Pool empty - loading ads`);
          const focusedLoadCount = Platform.OS === 'android'
            // Fill the maximum number of slots on the focused surface.
            ? Math.max(state.count, ANDROID_FOCUSED_AD_LOAD_COUNT)
            : undefined;
          state.loadAds(state.tabType, focusedLoadCount);
          updateIfChanged(makeEmptySlots(state.count, false));
          return;
        }

        logMessage(`Pool has ${state.poolAds.length} ads - checking freshness`);
        state.refreshIfStale(
          state.tabType,
          Platform.OS === 'android' ? ANDROID_AD_REFRESH_MAX_AGE_MS : undefined
        );

        const claimed = state.claimAds(state.tabType, ownerId, state.count, state.startIndex);
        const next = claimed.map((ad) => ({ ad, loading: false }));
        logMessage(
          `Claimed ${claimed.filter(Boolean).length}/${state.count} ads from pool of ${state.poolAds.length} (startIndex=${state.startIndex}, owner=${ownerId})`
        );
        updateIfChanged(next);
      }, delayMs);
    });

    focusedAdWorkCancelRef.current = () => {
      cancelled = true;
      handle.cancel();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [cancelFocusedAdWork, logMessage, logStructured, makeEmptySlots, updateIfChanged]);

  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      scheduleFocusedAdWork('focus');

      return () => {
        isFocusedRef.current = false;
        cancelFocusedAdWork();
        const state = latestStateRef.current;
        state.releaseAds(state.tabType, ownerIdRef.current);
        updateIfChanged(makeEmptySlots(state.count, false));
      };
    }, [cancelFocusedAdWork, makeEmptySlots, scheduleFocusedAdWork, updateIfChanged])
  );

  // Pool updates refresh ads while focused. Blur releases the native instances
  // so an off-screen tab cannot block the next visible surface from claiming them.
  useEffect(() => {
    logStructured('hook_state_changed', {
      tabType,
      count,
      startIndex,
      ownerId: ownerIdRef.current,
      isFocused: isFocusedRef.current,
      poolSize: poolAds.length,
      isLoading,
    });

    if (isFocusedRef.current && count > 0) {
      scheduleFocusedAdWork('pool_or_count_change');
    }
  }, [count, isLoading, logStructured, poolAds, scheduleFocusedAdWork, startIndex, tabType]);

  useEffect(() => {
    if (count > 0) {
      return;
    }

    cancelFocusedAdWork();
    releaseAds(tabType, ownerIdRef.current);
    updateIfChanged([]);
  }, [cancelFocusedAdWork, count, releaseAds, tabType, updateIfChanged]);

  useEffect(() => {
    const ownerId = ownerIdRef.current;
    return () => {
      cancelFocusedAdWork();
      releaseAds(tabType, ownerId);
      logStructured('hook_release', {
        tabType,
        ownerId,
      });
    };
  }, [cancelFocusedAdWork, logStructured, releaseAds, tabType]);

  useEffect(() => {
    const sample = poolAds.slice(0, MAX_LOGGED_ADS).map(summarizeAd);
    const signature = JSON.stringify({
      poolSize: poolAds.length,
      isLoading,
      sampleIds: sample.map((ad) => ad.id),
    });

    if (lastPoolSignatureRef.current === signature) {
      return;
    }

    lastPoolSignatureRef.current = signature;
    logStructured('pool_snapshot', {
      tabType,
      requestedCount: count,
      startIndex,
      poolSize: poolAds.length,
      isLoading,
      sampleSize: sample.length,
      sample,
    });
  }, [count, isLoading, poolAds, startIndex, tabType]);

  useEffect(() => {
    const selection = nativeAdsData.map((entry, index) => ({
      slot: index,
      loading: entry.loading,
      ad: summarizeAd(entry.ad),
    }));
    const signature = JSON.stringify({
      count,
      startIndex,
      selection: selection.map((entry) => ({
        slot: entry.slot,
        loading: entry.loading,
        id: entry.ad.id,
      })),
    });

    if (lastSelectionSignatureRef.current === signature) {
      return;
    }

    lastSelectionSignatureRef.current = signature;
    logStructured('selection_snapshot', {
      tabType,
      requestedCount: count,
      startIndex,
      poolSize: poolAds.length,
      isLoading,
      selection,
    });
  }, [count, isLoading, nativeAdsData, poolAds.length, startIndex, tabType]);

  return nativeAdsData;
}
