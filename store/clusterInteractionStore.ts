/**
 * Cluster Interaction Tracking Store
 *
 * Tracks when users interact with clusters to determine if they have "new" content
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ClusterInteraction {
  clusterId: string;
  lastInteractionTime: number;
  eventIds: string[];    // IDs of events that were in the cluster at interaction time
}

interface ClusterInteractionState {
  interactions: Map<string, ClusterInteraction>;
  carouselViewedEventIds: Set<string>;
  recordInteraction: (clusterId: string, eventIds: string[]) => void;
  getLastInteraction: (clusterId: string) => ClusterInteraction | undefined;
  hasNewContent: (clusterId: string, currentEventIds: string[]) => boolean;
  markCarouselEventViewed: (eventId: string | number) => void;
  markCarouselEventsViewed: (eventIds: Array<string | number>) => void;
  clearCarouselViewedEvents: () => void;
  clear: () => void;
}

export const useClusterInteractionStore = create<ClusterInteractionState>()(
  persist(
    (set, get) => ({
      interactions: new Map(),
      carouselViewedEventIds: new Set(),

      recordInteraction: (clusterId: string, eventIds: string[]) => {
        set((state) => {
          const newInteractions = new Map(state.interactions);
          newInteractions.set(clusterId, {
            clusterId,
            lastInteractionTime: Date.now(),
            eventIds: [...eventIds],
          });
          return { interactions: newInteractions };
        });
      },

      getLastInteraction: (clusterId: string) => {
        return get().interactions.get(clusterId);
      },

      hasNewContent: (clusterId: string, currentEventIds: string[]) => {
        const lastInteraction = get().interactions.get(clusterId);

        // If never interacted, no "new" content (first time seeing it)
        if (!lastInteraction) {
          return false;
        }

        // Check if there are any event IDs that weren't in the last interaction
        const previousEventIdSet = new Set(lastInteraction.eventIds);
        const hasNewEvents = currentEventIds.some(id => !previousEventIdSet.has(id));

        return hasNewEvents;
      },

      markCarouselEventViewed: (eventId: string | number) => {
        const eventIdString = eventId.toString();
        set((state) => {
          if (state.carouselViewedEventIds.has(eventIdString)) {
            return state;
          }
          const nextViewed = new Set(state.carouselViewedEventIds);
          nextViewed.add(eventIdString);
          return { carouselViewedEventIds: nextViewed };
        });
      },

      markCarouselEventsViewed: (eventIds: Array<string | number>) => {
        if (eventIds.length === 0) return;
        set((state) => {
          let changed = false;
          const nextViewed = new Set(state.carouselViewedEventIds);

          eventIds.forEach((eventId) => {
            const eventIdString = eventId.toString();
            if (!nextViewed.has(eventIdString)) {
              nextViewed.add(eventIdString);
              changed = true;
            }
          });

          if (!changed) {
            return state;
          }

          return { carouselViewedEventIds: nextViewed };
        });
      },

      clearCarouselViewedEvents: () => {
        set((state) => {
          if (state.carouselViewedEventIds.size === 0) {
            return state;
          }
          return { carouselViewedEventIds: new Set() };
        });
      },

      clear: () => {
        set({ interactions: new Map(), carouselViewedEventIds: new Set() });
      },
    }),
    {
      name: 'cluster-interactions',
      storage: createJSONStorage(() => AsyncStorage),
      // Custom serialization for Map
      partialize: (state) => ({
        interactions: Array.from(state.interactions.entries()),
      }),
      // Custom deserialization
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray((state as any).interactions)) {
          state.interactions = new Map((state as any).interactions);
        }
      },
    }
  )
);

// Synchronous getter for fast access during cluster generation
export const getHasNewContent = (clusterId: string, currentEventIds: string[]): boolean => {
  return useClusterInteractionStore.getState().hasNewContent(clusterId, currentEventIds);
};

// Record interaction helper
export const recordClusterInteraction = (clusterId: string, eventIds: string[]): void => {
  useClusterInteractionStore.getState().recordInteraction(clusterId, eventIds);
};
