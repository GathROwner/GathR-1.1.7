// store/userPrefsStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { firestore } from '../config/firebaseConfig';
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';

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
  setAll: (p: Partial<UserPrefsState>) => void;
  clear: () => void;
  setShowDailyHotspot: (value: boolean) => void;
  markHotspotShownToday: () => void;
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
      showDailyHotspot: true,
      hotspotLastShownDate: null,
      setAll: (p) => set(p),
      clear: () =>
        set({
          interests: [],
          savedEvents: [],
          favoriteVenues: [],
          likedEvents: [],
          interestedEvents: [],
          lastLoadedAt: undefined,
          showDailyHotspot: true,
          hotspotLastShownDate: null,
        }),
      setShowDailyHotspot: (value: boolean) => set({ showDailyHotspot: value }),
      markHotspotShownToday: () => set({ hotspotLastShownDate: new Date().toISOString().split('T')[0] }),
    }),
    { name: 'user-prefs-cache', storage: createJSONStorage(() => AsyncStorage) }
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
        showDailyHotspot: data.showDailyHotspot ?? true,
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
        showDailyHotspot: data.showDailyHotspot ?? true,
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
