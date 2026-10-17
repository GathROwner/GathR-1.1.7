import { useEffect, useMemo, useReducer, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { Event, EventAreaLocation } from '../types/events';
import { fetchFirestoreEventStatus, type FirestoreEventStatus } from '../lib/api/firestoreEvents';
import { EVENTS_MINIMAL, EVENT_DETAILS_SCHEMA_VERSION } from '../lib/queryKeys';
import { useMapStore } from '../store/mapStore';
import { getAreaLinkedEventIds, getAvailableAreaLinkedEvents } from '../utils/areaEvent';
import { toFirestoreEventId } from '../utils/firestoreEventIds';
import { AREA_ACTIVITY_FRESH_MS, areaActivityKey, getActivityCandidates, resolveActivityEntry,
  changedActivityDuringLoad, reconcileActivityCaches, withActivityLoadSlot, type AreaActivityEntry } from '../utils/areaActivityCache';

export type AreaActivityLoader = (id: string, signal: AbortSignal) => Promise<FirestoreEventStatus>;

export function useAreaActivities(umbrella: Event, location?: EventAreaLocation, load: AreaActivityLoader = fetchFirestoreEventStatus) {
  const client = useQueryClient();
  const events = useMapStore(state => state.events);
  const allEvents = useMapStore(state => state.allEvents);
  const lastFetchedAt = useMapStore(state => state.lastFetchedAt);
  const [cacheVersion, cacheChanged] = useReducer(value => value + 1, 0);
  const force = useRef(false);
  const ids = useMemo(() => location ? getAreaLinkedEventIds(location) : [], [location]);
  useEffect(() => client.getQueryCache().subscribe(event => {
    const key = event.query.queryKey;
    if (event.type === 'updated' && ((key[0] === 'event-details' && key[1] === EVENT_DETAILS_SCHEMA_VERSION)
      || JSON.stringify(key) === JSON.stringify(EVENTS_MINIMAL))) cacheChanged();
  }), [client]);
  const candidates = useMemo(() => {
    void cacheVersion; // Query-cache writes are outside Zustand and need their own snapshot epoch.
    return getActivityCandidates(client, { events, allEvents, lastFetchedAt }, ids);
  },
    [client, events, allEvents, lastFetchedAt, ids, cacheVersion]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') for (const id of ids) void client.refetchQueries({ queryKey: areaActivityKey(id), exact: true, stale: true, type: 'active' });
    });
    return () => subscription.remove();
  }, [client, ids]);
  const queries = useQueries({ queries: ids.map(id => {
    const seed = resolveActivityEntry(candidates.get(id) || []);
    return {
      queryKey: areaActivityKey(id), initialData: seed, initialDataUpdatedAt: seed?.checkedAt,
      staleTime: AREA_ACTIVITY_FRESH_MS, retry: false,
      queryFn: ({ signal }: { signal: AbortSignal }) => withActivityLoadSlot(client, signal, async () => {
        const startedAt = Date.now();
        const before = getActivityCandidates(client, useMapStore.getState(), [id]).get(id) || [];
        const cached = client.getQueryData<AreaActivityEntry>(areaActivityKey(id));
        const known = resolveActivityEntry(before, cached);
        if (!force.current && known?.status === 'found' && known.checkedAt > (cached?.checkedAt || 0)
          && Date.now() - known.checkedAt < AREA_ACTIVITY_FRESH_MS) return known;
        const result = await load(id, signal);
        if (signal.aborted) throw new Error('Activity request cancelled');
        if (result.status === 'found' && toFirestoreEventId(result.event.id) !== id) throw new Error('Activity identity mismatch');
        const after = getActivityCandidates(client, useMapStore.getState(), [id]).get(id) || [];
        const arrived = changedActivityDuringLoad(before, after, startedAt);
        if (arrived) return { status: 'found' as const, event: arrived.event, checkedAt: arrived.checkedAt };
        const entry: AreaActivityEntry = { ...result, checkedAt: Date.now() };
        reconcileActivityCaches(client, id, entry, update => useMapStore.setState(update));
        return entry;
      }),
    };
  }) });
  const entries = ids.map((id, index) => resolveActivityEntry(candidates.get(id) || [], queries[index]?.data));
  const records = entries.flatMap(entry => entry?.status === 'found' ? [entry.event] : []);
  const activities = location ? getAvailableAreaLinkedEvents(umbrella, location, records) : [];
  const unresolved = entries.some(entry => !entry);
  const isFetching = queries.some(query => query.isFetching);
  const refresh = async () => {
    if (force.current) return;
    force.current = true;
    try { await Promise.allSettled(queries.map(query => query.refetch({ cancelRefetch: true }))); }
    finally { force.current = false; }
  };
  const currentActivities = () => {
    if (!location) return [];
    const latest = getActivityCandidates(client, useMapStore.getState(), ids);
    return getAvailableAreaLinkedEvents(umbrella, location, ids.flatMap(id => {
      const entry = resolveActivityEntry(latest.get(id) || [], client.getQueryData<AreaActivityEntry>(areaActivityKey(id)));
      return entry?.status === 'found' ? [entry.event] : [];
    }));
  };
  return { activities, unresolved, isFetching, hasError: queries.some(query => query.isError), refresh, currentActivities };
}
