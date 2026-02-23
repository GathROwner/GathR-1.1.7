import { useEffect, useMemo } from 'react';
import { useAdPoolStore } from '../store/adPoolStore';
import { NativeAd } from 'react-native-google-mobile-ads';

export type NativeAdData = {
  ad: NativeAd | null;
  loading: boolean;
};

export type AdDebugInfo = string[];

/**
 * Hook to get native ads from the centralized ad pool.
 *
 * This hook now uses a shared ad pool (adPoolStore) instead of loading ads independently.
 * Benefits:
 * - All screens share the same pool of ads (no duplicate loading)
 * - Rate limiting is handled centrally (30s cooldown between loads)
 * - Ads persist across tab switches and callout opens
 * - Better ad variety since pool loads more ads upfront (15 vs 5-6)
 *
 * @param count - Number of ads needed for display (will cycle if pool is smaller)
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
  const isLoading = useAdPoolStore((s) => s.isLoading[tabType]);
  const poolAds = useAdPoolStore((s) => (tabType === 'events' ? s.eventsAds : s.specialsAds));

  const logMessage = (message: string) => {
    if (onDebugLog) {
      onDebugLog(`[ADMOB ${tabType}]: ${message}`);
    }
    // Also log to console for debugging
    console.log(`[useNativeAds ${tabType}]: ${message}`);
  };

  // Load ads on mount if pool is empty, or refresh if stale
  useEffect(() => {
    if (poolAds.length === 0) {
      logMessage(`Pool empty - loading ads`);
      loadAds(tabType);
    } else {
      logMessage(`Pool has ${poolAds.length} ads - checking freshness`);
      refreshIfStale(tabType);
    }
  }, [tabType]); // Only re-run when tabType changes

  // Convert pool ads to NativeAdData format
  // Memoize to prevent unnecessary re-renders
  const nativeAdsData = useMemo<NativeAdData[]>(() => {
    // If loading and no ads yet, return loading state
    if (isLoading && poolAds.length === 0) {
      logMessage(`Loading state - returning ${count} loading placeholders`);
      return Array(count)
        .fill(0)
        .map(() => ({ ad: null, loading: true }));
    }

    // If no ads available (even after loading), return empty slots
    if (poolAds.length === 0) {
      logMessage(`No ads available - returning ${count} empty slots`);
      return Array(count)
        .fill(0)
        .map(() => ({ ad: null, loading: false }));
    }

    // Get ads from pool (with cycling if needed), starting from startIndex
    // This allows different venue tabs to show different ads from the pool
    const result: NativeAdData[] = [];
    for (let i = 0; i < count; i++) {
      const adIndex = (startIndex + i) % poolAds.length;
      result.push({ ad: poolAds[adIndex], loading: false });
    }
    logMessage(`Returning ${result.length} ads from pool of ${poolAds.length} (startIndex=${startIndex})`);

    return result;
  }, [poolAds, count, isLoading, tabType, startIndex]);

  return nativeAdsData;
}
