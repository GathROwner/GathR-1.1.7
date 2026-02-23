import { useEffect, useState, useRef } from 'react';
import { NativeAd } from 'react-native-google-mobile-ads';

export type NativeAdData = {
  ad: NativeAd | null;
  loading: boolean;
};

export type AdDebugInfo = string[];

// Ad unit IDs for different tabs
const getAdUnitId = (tabType: 'events' | 'specials') => {
  return tabType === 'events'
    ? 'ca-app-pub-9606287073864764/7793096624' // Events Tab ID
    : 'ca-app-pub-9606287073864764/6692005621'; // Specials Tab ID
};

// Enhanced keyword sets for events/restaurant discovery app
const EVENTS_KEYWORDS = [
  'local events',
  'things to do',
  'concerts',
  'live music',
  'festivals',
  'community events',
  'weekend activities',
  'date night',
  'family activities',
  'entertainment',
  'nightlife',
  'social gatherings',
];

const SPECIALS_KEYWORDS = [
  'restaurant deals',
  'food specials',
  'happy hour',
  'local restaurants',
  'dining',
  'bar specials',
  'lunch deals',
  'dinner specials',
  'brunch',
  'food delivery',
  'takeout',
  'drink specials',
];

// Shared location-based keywords
const LOCATION_KEYWORDS = [
  'local',
  'nearby',
  'neighborhood',
];

// Helper function to create unique ad identifier
const getAdId = (ad: NativeAd): string => {
  const headline = ad.headline || '';
  const advertiser = ad.advertiser || '';
  const body = ad.body || '';
  return `${headline}-${advertiser}-${body}`.toLowerCase().trim();
};

// Fisher-Yates shuffle for keyword randomization
const shuffleArray = <T>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export default function useNativeAds(
  count: number = 3,
  tabType: 'events' | 'specials' = 'events',
  onDebugLog?: (message: string) => void
): NativeAdData[] {
  const [nativeAdsData, setNativeAdsData] = useState<NativeAdData[]>([]);
  const adUnitId = getAdUnitId(tabType);

  // Ref to prevent state updates after unmount
  const isMountedRef = useRef(true);

  const logMessage = (message: string) => {
    if (onDebugLog) {
      onDebugLog(`[ADMOB ${tabType}]: ${message}`);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;

    logMessage(`Initializing ${count} unique native ads with unit ID: ${adUnitId}`);

    // Initialize with loading state
    setNativeAdsData(
      Array(count)
        .fill(0)
        .map(() => ({
          ad: null,
          loading: true,
        }))
    );

    const nativeAds: NativeAd[] = [];
    const usedAdIds = new Set<string>();
    let loadedCount = 0;
    let maxAttempts = Math.min(count * 2, 12); // Reduced from 15 for faster completion
    let attemptCount = 0;
    let consecutiveDuplicates = 0;

    // Build contextual keyword pool based on tab type
    const baseKeywords = tabType === 'events' ? EVENTS_KEYWORDS : SPECIALS_KEYWORDS;
    const keywordPool = [...baseKeywords, ...LOCATION_KEYWORDS];

    const loadAds = async () => {
      while (loadedCount < count && attemptCount < maxAttempts && isMountedRef.current) {
        attemptCount++;

        try {
          logMessage(`Attempt ${attemptCount}: Loading ad ${loadedCount + 1}/${count}`);

          // Add delay between requests (reduced from original)
          if (attemptCount > 1) {
            const baseDelay = 200; // Reduced from 300ms
            const extraDelay = Math.min(consecutiveDuplicates * 150, 500); // Reduced max from 1000ms
            const totalDelay = baseDelay + extraDelay;

            logMessage(`Waiting ${totalDelay}ms before next request`);
            await new Promise((resolve) => setTimeout(resolve, totalDelay));
          }

          // Shuffle keywords for variety
          const shuffledKeywords = shuffleArray(keywordPool).slice(0, 6);

          const adRequest = {
            requestNonPersonalizedAdsOnly: false,
            keywords: shuffledKeywords,
            requestAgent: 'GathR-EventDiscovery-v1.1',
            // Content URL helps Google understand app context
            contentUrl: `https://gathrapp.ca/${tabType}`,
          };

          logMessage(`Creating ad request ${attemptCount} with keywords: ${shuffledKeywords.slice(0, 3).join(', ')}...`);

          const nativeAd = await NativeAd.createForAdRequest(adUnitId, adRequest);

          // Check if component was unmounted during async operation
          if (!isMountedRef.current) {
            try {
              nativeAd.destroy();
            } catch (e) {
              // Ignore cleanup errors
            }
            return;
          }

          // Check if this ad is unique
          const adId = getAdId(nativeAd);

          if (usedAdIds.has(adId)) {
            consecutiveDuplicates++;
            logMessage(`⚠️ Attempt ${attemptCount}: Duplicate ad detected "${nativeAd.headline}" - skipping (${consecutiveDuplicates} consecutive)`);

            // Exit early if too many consecutive duplicates (reduced from 5)
            if (consecutiveDuplicates >= 4) {
              logMessage(`🛑 Stopping after ${consecutiveDuplicates} consecutive duplicates - limited ad inventory`);
              try {
                nativeAd.destroy();
              } catch (error) {
                logMessage(`Error destroying duplicate ad: ${error}`);
              }
              break;
            }

            // Destroy the duplicate ad
            try {
              nativeAd.destroy();
            } catch (error) {
              logMessage(`Error destroying duplicate ad: ${error}`);
            }

            continue;
          }

          // Unique ad found - reset counter
          consecutiveDuplicates = 0;
          usedAdIds.add(adId);
          nativeAds.push(nativeAd);

          logMessage(`✅ Unique ad ${loadedCount + 1} loaded: "${nativeAd.headline}" by ${nativeAd.advertiser || 'Unknown'}`);

          // Update state with the loaded ad
          if (isMountedRef.current) {
            setNativeAdsData((prev) => {
              const updated = [...prev];
              updated[loadedCount] = { ad: nativeAd, loading: false };
              return updated;
            });
          }

          loadedCount++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logMessage(`❌ Attempt ${attemptCount} failed: ${errorMessage}`);

          // Check for rate limiting and exit early
          if (errorMessage.includes('Too many recently failed requests')) {
            logMessage(`🛑 Hit AdMob rate limit - using available ads`);
            break;
          }

          // Check for "No ad to show"
          if (errorMessage.includes('No ad to show')) {
            consecutiveDuplicates++;
            if (consecutiveDuplicates >= 3) {
              logMessage(`🛑 Multiple "No ad to show" errors - limited inventory`);
              break;
            }
          }
        }
      }

      // Fill remaining slots by reusing existing ads if we have any
      if (loadedCount < count && nativeAds.length > 0 && isMountedRef.current) {
        const remainingSlots = count - loadedCount;
        logMessage(`📋 Found ${loadedCount} unique ads, reusing for ${remainingSlots} remaining slots`);

        setNativeAdsData((prev) => {
          const updated = [...prev];
          for (let i = loadedCount; i < count; i++) {
            const reuseIndex = i % nativeAds.length;
            updated[i] = { ad: nativeAds[reuseIndex], loading: false };
            logMessage(`♻️ Reusing ad ${reuseIndex + 1} for slot ${i + 1}`);
          }
          return updated;
        });
      } else if (loadedCount < count && isMountedRef.current) {
        // No ads available at all
        logMessage(`❌ No ads available, marking ${count - loadedCount} slots as empty`);
        setNativeAdsData((prev) => {
          const updated = [...prev];
          for (let i = loadedCount; i < count; i++) {
            updated[i] = { ad: null, loading: false };
          }
          return updated;
        });
      }

      // Final summary
      if (isMountedRef.current) {
        const finalAdCount = Math.min(count, Math.max(loadedCount, nativeAds.length > 0 ? count : 0));
        logMessage(`🎯 Final: ${loadedCount} unique ads in ${attemptCount} attempts, ${finalAdCount}/${count} slots filled`);
      }
    };

    loadAds();

    // Cleanup function
    return () => {
      isMountedRef.current = false;
      logMessage(`Cleaning up ${nativeAds.length} ads`);
      nativeAds.forEach((nativeAd, index) => {
        try {
          nativeAd.destroy();
        } catch (error) {
          logMessage(`Error destroying ad ${index + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });
    };
  }, [count, adUnitId]);

  return nativeAdsData;
}
