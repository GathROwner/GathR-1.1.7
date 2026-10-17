import { useCallback, useRef, useState } from 'react';
import type { ViewToken } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

/** Start the brief count cue when a grouped card enters the viewport, not when FlatList pre-renders it. */
export function useVisibleVenueGroups() {
  const [keys, setKeys] = useState<Set<string>>(() => new Set());
  const focused = useIsFocused();
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 5, minimumViewTime: 150 }).current;
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const next = new Set<string>(viewableItems.flatMap(({ item }) => item.group ? [item.group.key] : []));
    setKeys(previous => previous.size === next.size && [...next].every(key => previous.has(key)) ? previous : next);
  }, []);
  return { keys, focused, viewabilityConfig, onViewableItemsChanged };
}
