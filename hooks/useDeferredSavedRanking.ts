import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';

/** Save controls stay live; saved-first ranking changes only at a browsing boundary. */
export function useDeferredSavedRanking(
  savedIds: readonly string[],
  browsingContext: string,
  preferencesReady: boolean,
) {
  const focused = useIsFocused();
  const latestIds = useRef(savedIds);
  const [ranking, setRanking] = useState(() => ({ ids: new Set(savedIds), revision: 0 }));
  const [refreshing, setRefreshing] = useState(false);

  useLayoutEffect(() => { latestIds.current = savedIds; }, [savedIds]);

  const applySavedRanking = useCallback(() => {
    const next = new Set(latestIds.current);
    setRanking(previous => {
      return previous.ids.size === next.size && [...next].every(id => previous.ids.has(id))
        ? previous : { ids: next, revision: previous.revision + 1 };
    });
  }, []);

  // Do not depend on savedIds: saving/unsaving must not move rows mid-browse.
  // First preference hydration, account/filter changes and returning to this tab
  // establish a fresh ranking snapshot before the next paint.
  useLayoutEffect(() => {
    if (focused) applySavedRanking();
  }, [focused, browsingContext, preferencesReady, applySavedRanking]);

  const refreshSavedRanking = useCallback(() => {
    applySavedRanking();
    setRefreshing(true);
  }, [applySavedRanking]);

  useEffect(() => {
    if (!refreshing) return;
    // This refresh applies local saved-first order; it does not refetch event data.
    const frame = requestAnimationFrame(() => setRefreshing(false));
    return () => cancelAnimationFrame(frame);
  }, [refreshing]);

  return { rankingSavedIds: ranking.ids, rankingRevision: ranking.revision, refreshSavedRanking, refreshing };
}
