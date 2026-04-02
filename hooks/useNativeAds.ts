import { useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
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
  const claimAds = useAdPoolStore((s) => s.claimAds);
  const releaseAds = useAdPoolStore((s) => s.releaseAds);
  const isLoading = useAdPoolStore((s) => s.isLoading[tabType]);
  const poolAds = useAdPoolStore((s) => (tabType === 'events' ? s.eventsAds : s.specialsAds));
  const ownerIdRef = useRef(`native-ads-${Math.random().toString(36).slice(2, 10)}`);
  const lastPoolSignatureRef = useRef('');
  const lastSelectionSignatureRef = useRef('');
  const isFocused = useIsFocused();
  const [nativeAdsData, setNativeAdsData] = useState<NativeAdData[]>(
    Array(count)
      .fill(0)
      .map(() => ({ ad: null, loading: false }))
  );

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
      ownerId: ownerIdRef.current,
      isFocused,
      poolSize: poolAds.length,
      isLoading,
    });
    if (!isFocused || count <= 0) {
      releaseAds(tabType, ownerIdRef.current);
      return;
    }
    if (poolAds.length === 0) {
      logMessage(`Pool empty - loading ads`);
      loadAds(tabType);
    } else {
      logMessage(`Pool has ${poolAds.length} ads - checking freshness`);
      refreshIfStale(tabType);
    }
  }, [count, isFocused, loadAds, poolAds.length, refreshIfStale, releaseAds, tabType]);

  useEffect(() => {
    const ownerId = ownerIdRef.current;
    return () => {
      releaseAds(tabType, ownerId);
      logStructured('hook_release', {
        tabType,
        ownerId,
      });
    };
  }, [releaseAds, tabType]);

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
    const ownerId = ownerIdRef.current;

    const updateIfChanged = (next: NativeAdData[]) => {
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
    };

    if (!isFocused || count <= 0) {
      releaseAds(tabType, ownerId);
      logMessage(`Inactive - released ads for owner=${ownerId}`);
      updateIfChanged(
        Array(count)
          .fill(0)
          .map(() => ({ ad: null, loading: false }))
      );
      return;
    }

    if (isLoading && poolAds.length === 0) {
      logMessage(`Loading state - returning ${count} loading placeholders for owner=${ownerId}`);
      updateIfChanged(
        Array(count)
          .fill(0)
          .map(() => ({ ad: null, loading: true }))
      );
      return;
    }

    if (poolAds.length === 0) {
      logMessage(`No ads available - returning ${count} empty slots for owner=${ownerId}`);
      updateIfChanged(
        Array(count)
          .fill(0)
          .map(() => ({ ad: null, loading: false }))
      );
      return;
    }

    const claimed = claimAds(tabType, ownerId, count, startIndex);
    const next = claimed.map((ad) => ({ ad, loading: false }));
    logMessage(
      `Claimed ${claimed.filter(Boolean).length}/${count} ads from pool of ${poolAds.length} (startIndex=${startIndex}, owner=${ownerId})`
    );
    updateIfChanged(next);
  }, [claimAds, count, isFocused, isLoading, poolAds, releaseAds, startIndex, tabType]);

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
