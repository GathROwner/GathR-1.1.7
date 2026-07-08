// store/userPrefsStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firestore } from '../config/firebaseConfig';
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { getLocalDateKey } from '../utils/localDateKey';

type UserPrefsState = {
  interests: string[];
  savedEvents: string[];
  favoriteVenues: string[];
  likedEvents: string[];
  interestedEvents: string[];
  lastLoadedAt?: number;
  // Hotspot feature
  showDailyHotspot: boolean;
  hotspotLastShownDate: string | null;
  hotspotDateKeyMode?: 'local';
  // Trending auto-open feature
  showTrendingOnOpen: boolean;
  trendingLastAutoShownAt: number | null;
  setAll: (p: Partial<UserPrefsState>) => void;
  clear: () => void;
  setShowDailyHotspot: (value: boolean) => void;
  markHotspotShownToday: () => void;
  setShowTrendingOnOpen: (value: boolean) => void;
  markTrendingAutoShown: () => void;
};

export const useUserPrefsStore = create<UserPrefsState>()(
  persist(
    (set) => ({
      interests: [],
      savedEvents: [],
      favoriteVenues: [],
      likedEvents: [],
      interestedEvents: [],
      lastLoadedAt: undefined,
      showDailyHotspot: false,
      hotspotLastShownDate: null,
      hotspotDateKeyMode: undefined,
      showTrendingOnOpen: true,
      trendingLastAutoShownAt: null,
      setAll: (p) => set(p),
      clear: () =>
        set((state) => ({
          interests: [],
          savedEvents: [],
          favoriteVenues: [],
          likedEvents: [],
          interestedEvents: [],
          lastLoadedAt: undefined,
          showDailyHotspot: false,
          // This is app/day-scoped, not user-specific. Preserve it so guest refreshes
          // do not rerun the daily hotspot after it has already been shown.
          hotspotLastShownDate: state.hotspotLastShownDate,
          hotspotDateKeyMode: state.hotspotDateKeyMode,
          showTrendingOnOpen: true,
          // Device-scoped like hotspotLastShownDate: preserve so sign-out does
          // not immediately re-trigger the trending auto-open.
          trendingLastAutoShownAt: state.trendingLastAutoShownAt,
        })),
      setShowDailyHotspot: (value: boolean) => set({ showDailyHotspot: value }),
      markHotspotShownToday: () => set({
        hotspotLastShownDate: getLocalDateKey(),
        hotspotDateKeyMode: 'local',
      }),
      setShowTrendingOnOpen: (value: boolean) => set({ showTrendingOnOpen: value }),
      markTrendingAutoShown: () => set({ trendingLastAutoShownAt: Date.now() }),
    }),
    {
      name: 'user-prefs-cache',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: (persistedState, version) => {
        const state = { ...(persistedState as Partial<UserPrefsState>) };
        if (version < 1) {
          // Releases before v1 persisted the old default of true. Reset that
          // cache value so those installs get the off-by-default behavior.
          // Must stay version-gated: re-running it for v1+ users would wipe a
          // deliberate opt-in.
          state.showDailyHotspot = false;
        }
        if (version < 2) {
          state.showTrendingOnOpen = true;
          state.trendingLastAutoShownAt = null;
        }
        return state;
      },
    }
  )
);

// Synchronous getters for fast paths (e.g., cluster click)
export const getUserInterestsSync = () => useUserPrefsStore.getState().interests;
export const getSavedEventsSync   = () => useUserPrefsStore.getState().savedEvents;
export const getFavoriteVenuesSync = () => useUserPrefsStore.getState().favoriteVenues;
export const getLikedEventsSync = () => useUserPrefsStore.getState().likedEvents;
export const getInterestedEventsSync = () => useUserPrefsStore.getState().interestedEvents;
export const getShowDailyHotspotSync = () => useUserPrefsStore.getState().showDailyHotspot;
export const getHotspotLastShownDateSync = () => useUserPrefsStore.getState().hotspotLastShownDate;
export const getShowTrendingOnOpenSync = () => useUserPrefsStore.getState().showTrendingOnOpen;
export const getTrendingLastAutoShownAtSync = () => useUserPrefsStore.getState().trendingLastAutoShownAt;

let unsubscribe: (() => void) | null = null;

export async function startUserPrefsListener(userId: string) {
  // 1) Warm the cache once (fast return if already loaded)
  const ref = doc(firestore, 'users', userId);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() || {};
      useUserPrefsStore.getState().setAll({
        interests: data.userInterests || [],
        savedEvents: data.savedEvents || [],
        favoriteVenues: data.favoriteVenues || [],
        likedEvents: data.likedEvents || [],
        interestedEvents: data.interestedEvents || [],
        showDailyHotspot: data.showDailyHotspot ?? false,
        showTrendingOnOpen: data.showTrendingOnOpen ?? true,
        lastLoadedAt: Date.now(),
      });
    }
  } catch {/* swallow; realtime will still attach */}

  // 2) Keep it fresh with a single realtime listener
  unsubscribe?.();
  unsubscribe = onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      const data = snap.data() || {};
      useUserPrefsStore.getState().setAll({
        interests: data.userInterests || [],
        savedEvents: data.savedEvents || [],
        favoriteVenues: data.favoriteVenues || [],
        likedEvents: data.likedEvents || [],
        interestedEvents: data.interestedEvents || [],
        showDailyHotspot: data.showDailyHotspot ?? false,
        showTrendingOnOpen: data.showTrendingOnOpen ?? true,
        lastLoadedAt: Date.now(),
      });
    }
  });
}

export function stopUserPrefsListener() {
  unsubscribe?.();
  unsubscribe = null;
  useUserPrefsStore.getState().clear();
}

// Optional helpers for when the user updates settings in-app:
export async function updateUserInterests(userId: string, interests: string[]) {
  const ref = doc(firestore, 'users', userId);
  await updateDoc(ref, { userInterests: interests });
}
export async function updateSavedEvents(userId: string, savedEvents: string[]) {
  const ref = doc(firestore, 'users', userId);
  await updateDoc(ref, { savedEvents });
}
export async function updateFavoriteVenues(userId: string, favoriteVenues: string[]) {
  const ref = doc(firestore, 'users', userId);
  await updateDoc(ref, { favoriteVenues });
}
export async function updateShowDailyHotspot(userId: string, showDailyHotspot: boolean) {
  const ref = doc(firestore, 'users', userId);
  await updateDoc(ref, { showDailyHotspot });
}
export async function updateShowTrendingOnOpen(userId: string, showTrendingOnOpen: boolean) {
  const ref = doc(firestore, 'users', userId);
  await updateDoc(ref, { showTrendingOnOpen });
}
