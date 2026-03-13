import { useEffect, useMemo, useRef } from 'react';
import { useAdPoolStore } from '../store/adPoolStore';
import { NativeAd } from 'react-native-google-mobile-ads';

export type NativeAdData = {
  ad: NativeAd | null;
  loading: boolean;
};

export type AdDebugInfo = string[];

const MAX_LOGGED_ADS = 5;

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
  const lastPoolSignatureRef = useRef('');
  const lastSelectionSignatureRef = useRef('');

  const logMessage = (message: string) => {
    if (onDebugLog) {
      onDebugLog(`[ADMOB ${tabType}]: ${message}`);
    }
    // Also log to console for debugging
    console.log(`[useNativeAds ${tabType}]: ${message}`);
  };

  const logStructured = (event: string, payload: Record<string, unknown>) => {
    console.log(`[useNativeAds ${tabType}] ${event}`, payload);
  };

  // Load ads on mount if pool is empty, or refresh if stale
  useEffect(() => {
    logStructured('hook_mount_or_tab_change', {
      tabType,
      count,
      startIndex,
      poolSize: poolAds.length,
      isLoading,
    });
    if (poolAds.length === 0) {
      logMessage(`Pool empty - loading ads`);
      loadAds(tabType);
    } else {
      logMessage(`Pool has ${poolAds.length} ads - checking freshness`);
      refreshIfStale(tabType);
    }
  }, [tabType]); // Only re-run when tabType changes

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
