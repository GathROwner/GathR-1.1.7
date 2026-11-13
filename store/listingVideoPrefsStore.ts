import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Device preference; never writes a user or event document. */
export const useListingVideoPrefs = create<{ autoplay: boolean; hydrated: boolean; ready: () => void; setAutoplay: (value: boolean) => void }>()(
  persist(set => ({ autoplay: true, hydrated: false, ready: () => set({ hydrated: true }), setAutoplay: autoplay => set({ autoplay }) }), {
    name: 'gathr-listing-video-preferences', storage: createJSONStorage(() => AsyncStorage),
    partialize: state => ({ autoplay: state.autoplay }),
    onRehydrateStorage: () => state => state?.ready(),
  }),
);
