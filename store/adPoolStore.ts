import { create } from 'zustand';
import { NativeAd } from 'react-native-google-mobile-ads';

// Ad unit IDs
const AD_UNIT_IDS = {
  events: 'ca-app-pub-9606287073864764/7793096624',
  specials: 'ca-app-pub-9606287073864764/6692005621',
};

// Keywords for contextual targeting
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

const LOCATION_KEYWORDS = ['local', 'nearby', 'neighborhood'];

// Configuration
const MIN_LOAD_INTERVAL_MS = 30000; // 30 seconds between loads
const DEFAULT_POOL_SIZE = 15; // Load up to 15 ads per type
const INITIAL_FAST_LOAD = 3; // Load this many ads quickly first
const MAX_ATTEMPTS = 20; // More attempts than before
const STALE_AGE_MS = 5 * 60 * 1000; // 5 minutes

type AdType = 'events' | 'specials';

interface AdPoolState {
  // State
  eventsAds: NativeAd[];
  specialsAds: NativeAd[];
  lastLoadTime: { events: number; specials: number };
  isLoading: { events: boolean; specials: boolean };
  isPreloaded: { events: boolean; specials: boolean };

  // Actions
  loadAds: (type: AdType, count?: number) => Promise<void>;
  preloadAds: () => Promise<void>; // Eager startup preload
  getAdsForDisplay: (type: AdType, count: number) => NativeAd[];
  getAdAtIndex: (type: AdType, index: number) => NativeAd | null; // For venue-specific ads
  refreshIfStale: (type: AdType, maxAgeMs?: number) => Promise<void>;
  cleanup: () => void;
}

// Helper to get unique ad ID based on content
const getAdId = (ad: NativeAd): string => {
  return `${ad.headline || ''}-${ad.advertiser || ''}-${ad.body || ''}`.toLowerCase().trim();
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

export const useAdPoolStore = create<AdPoolState>((set, get) => ({
  eventsAds: [],
  specialsAds: [],
  lastLoadTime: { events: 0, specials: 0 },
  isLoading: { events: false, specials: false },
  isPreloaded: { events: false, specials: false },

  loadAds: async (type: AdType, count: number = DEFAULT_POOL_SIZE) => {
    const state = get();
    const currentAds = type === 'events' ? state.eventsAds : state.specialsAds;

    // Rate limiting - don't reload too quickly
    const timeSinceLastLoad = Date.now() - state.lastLoadTime[type];
    if (timeSinceLastLoad < MIN_LOAD_INTERVAL_MS && currentAds.length > 0) {
      console.log(`[AdPool] Skipping ${type} load - last load was ${Math.round(timeSinceLastLoad / 1000)}s ago`);
      return;
    }

    // Don't start another load if already loading
    if (state.isLoading[type]) {
      console.log(`[AdPool] Already loading ${type} ads`);
      return;
    }

    set((s) => ({ isLoading: { ...s.isLoading, [type]: true } }));
    console.log(`[AdPool] Loading ${count} ${type} ads...`);

    const loadedAds: NativeAd[] = [];
    const localUsedIds = new Set<string>();
    const adUnitId = AD_UNIT_IDS[type];
    const keywords = type === 'events' ? EVENTS_KEYWORDS : SPECIALS_KEYWORDS;
    const keywordPool = [...keywords, ...LOCATION_KEYWORDS];

    let attemptCount = 0;
    let consecutiveDuplicates = 0;
    let consecutiveErrors = 0;

    while (loadedAds.length < count && attemptCount < MAX_ATTEMPTS) {
      attemptCount++;

      try {
        // Delay between requests (increases with failures)
        if (attemptCount > 1) {
          const delay = 200 + Math.min(consecutiveDuplicates * 100, 500);
          await new Promise((r) => setTimeout(r, delay));
        }

        const shuffledKeywords = shuffleArray(keywordPool).slice(0, 6);
        const nativeAd = await NativeAd.createForAdRequest(adUnitId, {
          requestNonPersonalizedAdsOnly: false,
          keywords: shuffledKeywords,
          requestAgent: 'GathR-EventDiscovery-v1.1',
          contentUrl: `https://gathrapp.ca/${type}`,
        });

        const adId = getAdId(nativeAd);
        if (localUsedIds.has(adId)) {
          consecutiveDuplicates++;
          console.log(`[AdPool] ⚠️ Duplicate ad "${nativeAd.headline}" (${consecutiveDuplicates} consecutive)`);
          try {
            nativeAd.destroy();
          } catch (e) {
            // Ignore cleanup errors
          }
          if (consecutiveDuplicates >= 6) {
            console.log(`[AdPool] 🛑 ${consecutiveDuplicates} consecutive duplicates - stopping`);
            break;
          }
          continue;
        }

        // Reset counters on success
        consecutiveDuplicates = 0;
        consecutiveErrors = 0;
        localUsedIds.add(adId);
        loadedAds.push(nativeAd);
        console.log(`[AdPool] ✅ ${type} ad ${loadedAds.length}/${count}: "${nativeAd.headline}"`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        consecutiveErrors++;
        console.log(`[AdPool] ❌ Attempt ${attemptCount} failed: ${msg}`);

        if (msg.includes('Too many recently failed requests')) {
          console.log(`[AdPool] 🛑 Rate limited - stopping with ${loadedAds.length} ads`);
          break;
        }
        if (consecutiveErrors >= 4) {
          console.log(`[AdPool] 🛑 ${consecutiveErrors} consecutive errors - stopping`);
          break;
        }
      }
    }

    // Cleanup old ads before replacing
    const oldAds = type === 'events' ? get().eventsAds : get().specialsAds;
    oldAds.forEach((ad) => {
      try {
        ad.destroy();
      } catch (e) {
        // Ignore cleanup errors
      }
    });

    // Update state with new ads
    if (type === 'events') {
      set({
        eventsAds: loadedAds,
        lastLoadTime: { ...get().lastLoadTime, events: Date.now() },
        isLoading: { ...get().isLoading, events: false },
      });
    } else {
      set({
        specialsAds: loadedAds,
        lastLoadTime: { ...get().lastLoadTime, specials: Date.now() },
        isLoading: { ...get().isLoading, specials: false },
      });
    }

    console.log(`[AdPool] 🎯 Loaded ${loadedAds.length} ${type} ads in ${attemptCount} attempts`);
    set((s) => ({ isPreloaded: { ...s.isPreloaded, [type]: true } }));
  },

  // Eager preload on app startup - loads both pools with two-phase approach
  preloadAds: async () => {
    const state = get();
    console.log('[AdPool] 🚀 Starting eager preload on app startup...');

    // Phase 1: Load a few ads quickly for immediate display (in parallel for both types)
    const loadFastBatch = async (type: AdType) => {
      if (state.isPreloaded[type] || state.isLoading[type]) {
        console.log(`[AdPool] ${type} already preloaded or loading, skipping`);
        return;
      }

      set((s) => ({ isLoading: { ...s.isLoading, [type]: true } }));
      console.log(`[AdPool] Phase 1: Loading ${INITIAL_FAST_LOAD} ${type} ads quickly...`);

      const loadedAds: NativeAd[] = [];
      const localUsedIds = new Set<string>();
      const adUnitId = AD_UNIT_IDS[type];
      const keywords = type === 'events' ? EVENTS_KEYWORDS : SPECIALS_KEYWORDS;
      const keywordPool = [...keywords, ...LOCATION_KEYWORDS];

      let attemptCount = 0;
      const maxFastAttempts = INITIAL_FAST_LOAD + 3; // A few extra attempts for the fast batch

      while (loadedAds.length < INITIAL_FAST_LOAD && attemptCount < maxFastAttempts) {
        attemptCount++;

        try {
          const shuffledKeywords = shuffleArray(keywordPool).slice(0, 6);
          const nativeAd = await NativeAd.createForAdRequest(adUnitId, {
            requestNonPersonalizedAdsOnly: false,
            keywords: shuffledKeywords,
            requestAgent: 'GathR-EventDiscovery-v1.1',
            contentUrl: `https://gathrapp.ca/${type}`,
          });

          const adId = getAdId(nativeAd);
          if (localUsedIds.has(adId)) {
            try { nativeAd.destroy(); } catch {}
            continue;
          }

          localUsedIds.add(adId);
          loadedAds.push(nativeAd);
          console.log(`[AdPool] Phase 1 ✅ ${type} ad ${loadedAds.length}/${INITIAL_FAST_LOAD}: "${nativeAd.headline}"`);
        } catch (error) {
          // Don't log errors in fast phase, just continue
        }
      }

      // Update state with fast batch
      if (type === 'events') {
        set({
          eventsAds: loadedAds,
          lastLoadTime: { ...get().lastLoadTime, events: Date.now() },
        });
      } else {
        set({
          specialsAds: loadedAds,
          lastLoadTime: { ...get().lastLoadTime, specials: Date.now() },
        });
      }

      console.log(`[AdPool] Phase 1 complete: ${loadedAds.length} ${type} ads ready for display`);

      // Phase 2: Continue loading more ads in background
      setTimeout(async () => {
        const currentAds = type === 'events' ? get().eventsAds : get().specialsAds;
        const currentIds = new Set(currentAds.map(getAdId));
        const remaining = DEFAULT_POOL_SIZE - currentAds.length;

        if (remaining <= 0) {
          set((s) => ({
            isLoading: { ...s.isLoading, [type]: false },
            isPreloaded: { ...s.isPreloaded, [type]: true },
          }));
          return;
        }

        console.log(`[AdPool] Phase 2: Loading ${remaining} more ${type} ads in background...`);

        const moreAds: NativeAd[] = [];
        let bgAttemptCount = 0;
        let consecutiveDuplicates = 0;
        let consecutiveErrors = 0;

        while (moreAds.length < remaining && bgAttemptCount < MAX_ATTEMPTS) {
          bgAttemptCount++;

          try {
            if (bgAttemptCount > 1) {
              const delay = 200 + Math.min(consecutiveDuplicates * 100, 500);
              await new Promise((r) => setTimeout(r, delay));
            }

            const shuffledKeywords = shuffleArray(keywordPool).slice(0, 6);
            const nativeAd = await NativeAd.createForAdRequest(adUnitId, {
              requestNonPersonalizedAdsOnly: false,
              keywords: shuffledKeywords,
              requestAgent: 'GathR-EventDiscovery-v1.1',
              contentUrl: `https://gathrapp.ca/${type}`,
            });

            const adId = getAdId(nativeAd);
            if (currentIds.has(adId)) {
              consecutiveDuplicates++;
              try { nativeAd.destroy(); } catch {}
              if (consecutiveDuplicates >= 6) break;
              continue;
            }

            consecutiveDuplicates = 0;
            consecutiveErrors = 0;
            currentIds.add(adId);
            moreAds.push(nativeAd);
            console.log(`[AdPool] Phase 2 ✅ ${type} ad ${currentAds.length + moreAds.length}/${DEFAULT_POOL_SIZE}: "${nativeAd.headline}"`);
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            consecutiveErrors++;
            if (msg.includes('Too many recently failed requests') || consecutiveErrors >= 4) {
              break;
            }
          }
        }

        // Merge with existing ads
        const finalAds = [...currentAds, ...moreAds];
        if (type === 'events') {
          set({
            eventsAds: finalAds,
            lastLoadTime: { ...get().lastLoadTime, events: Date.now() },
            isLoading: { ...get().isLoading, events: false },
            isPreloaded: { ...get().isPreloaded, events: true },
          });
        } else {
          set({
            specialsAds: finalAds,
            lastLoadTime: { ...get().lastLoadTime, specials: Date.now() },
            isLoading: { ...get().isLoading, specials: false },
            isPreloaded: { ...get().isPreloaded, specials: true },
          });
        }

        console.log(`[AdPool] Phase 2 complete: ${finalAds.length} total ${type} ads in pool`);
      }, 100); // Small delay before background loading
    };

    // Start both in parallel
    await Promise.all([loadFastBatch('events'), loadFastBatch('specials')]);
  },

  getAdsForDisplay: (type: AdType, count: number) => {
    const ads = type === 'events' ? get().eventsAds : get().specialsAds;
    if (ads.length === 0) return [];

    // Return ads with cycling if needed
    const result: NativeAd[] = [];
    for (let i = 0; i < count; i++) {
      result.push(ads[i % ads.length]);
    }
    return result;
  },

  // Get a specific ad by index - useful for showing different ads per venue tab
  getAdAtIndex: (type: AdType, index: number) => {
    const ads = type === 'events' ? get().eventsAds : get().specialsAds;
    if (ads.length === 0) return null;
    // Cycle through available ads using modulo
    return ads[index % ads.length];
  },

  refreshIfStale: async (type: AdType, maxAgeMs: number = STALE_AGE_MS) => {
    const state = get();
    const currentAds = type === 'events' ? state.eventsAds : state.specialsAds;
    const age = Date.now() - state.lastLoadTime[type];

    if (age > maxAgeMs || currentAds.length === 0) {
      console.log(`[AdPool] ${type} ads are stale (${Math.round(age / 1000)}s old) - refreshing`);
      await get().loadAds(type, DEFAULT_POOL_SIZE);
    }
  },

  cleanup: () => {
    const state = get();
    [...state.eventsAds, ...state.specialsAds].forEach((ad) => {
      try {
        ad.destroy();
      } catch (e) {
        // Ignore cleanup errors
      }
    });
    set({
      eventsAds: [],
      specialsAds: [],
      lastLoadTime: { events: 0, specials: 0 },
    });
    console.log('[AdPool] Cleaned up all ads');
  },
}));
