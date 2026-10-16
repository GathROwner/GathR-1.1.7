import { useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Event } from '../types/events';
import { useMapStore } from '../store/mapStore';
import { EVENTS_MINIMAL, EVENT_DETAILS_SCHEMA_VERSION } from '../lib/queryKeys';
import { normalizeFirestoreEvent } from '../lib/api/firestoreEvents';
import { readEventAreaData, isExplicitTrue } from '../utils/eventAreaData';
import { readVersion2EventTiming } from '../utils/eventTiming';
import { normalizeRecurrenceFlag } from '../utils/eventRecurrence';
import { toFirestoreEventId } from '../utils/firestoreEventIds';
import { buildAreaMembershipIndex, type MembershipRecord } from '../utils/areaMembership';
import type { AreaActivityEntry, ActivityStore } from '../utils/areaActivityCache';

export const areaMembershipRootKey = (id: string | number) => ['area-membership-root', 'v1', EVENT_DETAILS_SCHEMA_VERSION, toFirestoreEventId(id)] as const;
const currentFeed = (key: readonly unknown[]) => JSON.stringify(key) === JSON.stringify(EVENTS_MINIMAL);
const currentDetails = (key: readonly unknown[]) => key[0] === 'event-details' && key[1] === EVENT_DETAILS_SCHEMA_VERSION;
const currentRoot = (key: readonly unknown[]) => (key[0] === 'area-membership-root' && key[1] === 'v1'
  || key[0] === 'area-linked-event' && key[1] === 'cache-first-v1') && key[2] === EVENT_DETAILS_SCHEMA_VERSION;
const time = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(Date.now(), value)) : 0;
const negative = (event: Event) => Boolean(event.isCancelled || event.isExpired || ['cancelled', 'canceled', 'deleted', 'expired'].includes(String(event.status || '').toLowerCase()));
type RootAuthority = { event: Event | null; checkedAt: number; rank: number };

/** Current-version cache authority only. Retained tombstones outlive query GC in this client session. */
export function readAreaMembershipIndex(client: QueryClient, store: ActivityStore, tombstones = new Map<string, number>(), retained = new Map<string, RootAuthority>()) {
  const candidates = new Map<string, (MembershipRecord & { rank: number })[]>();
  const add = (raw: any, checkedAt: number, rank: number) => {
    if (!raw || raw.id == null) return;
    const event: Event = raw.type === 'event' || raw.type === 'special' ? { ...raw,
      areaData: readEventAreaData(raw), description: raw.fullDescription || raw.metadata?.fullDescription || raw.description || '',
      locationScope: raw.locationScope ?? raw.metadata?.locationScope,
      status: raw.status ?? raw.metadata?.status,
      originalEventId: raw.originalEventId ?? raw.metadata?.originalEventId,
      isCancelled: [raw.isCancelled, raw.cancelled, raw.canceled, raw.metadata?.isCancelled, raw.metadata?.cancelled, raw.metadata?.canceled].some(isExplicitTrue),
      isExpired: [raw.isExpired, raw.metadata?.isExpired].some(isExplicitTrue),
      timing: readVersion2EventTiming(raw), isRecurring: normalizeRecurrenceFlag(raw.isRecurring ?? raw.metadata?.isRecurring),
      isRecurringInstance: normalizeRecurrenceFlag(raw.isRecurringInstance ?? raw.metadata?.isRecurringInstance) } : normalizeFirestoreEvent(raw);
    const id = toFirestoreEventId(event.id);
    candidates.set(id, [...(candidates.get(id) || []), { event, checkedAt, rank }]);
  };
  const feed = client.getQueryData<{ combinedData: Event[]; fetchedAt: number }>(EVENTS_MINIMAL);
  const feedTime = time(feed?.fetchedAt), storeTime = time(store.lastFetchedAt);
  const feedIds = new Set((feed?.combinedData || []).map(event => toFirestoreEventId(event.id)));
  // A complete current feed is authoritative over unversioned store copies.
  // Never stamp an old viewport object with the newer feed's fetchedAt.
  if (!feed) {
    const unversioned = (event: Event, rank: number) => {
      const prior = retained.get(toFirestoreEventId(event.id));
      if (!prior || prior.rank === 1 || prior.rank === 2) add(event, storeTime, rank);
    };
    store.allEvents.forEach(event => unversioned(event, 1)); store.events.forEach(event => unversioned(event, 2));
  }
  feed?.combinedData.forEach(event => add(event, feedTime, 0));
  for (const query of client.getQueryCache().findAll()) {
    if (currentDetails(query.queryKey) && Array.isArray(query.state.data)) {
      query.state.data.forEach(event => add(event, time(query.state.dataUpdatedAt), 3));
    } else if (currentRoot(query.queryKey)) {
      const entry = query.state.data as AreaActivityEntry | undefined;
      const id = toFirestoreEventId(query.queryKey[3] as string);
      if (entry?.status === 'unavailable') tombstones.set(id, Math.max(tombstones.get(id) || 0, time(entry.checkedAt)));
      if (entry?.status === 'found') add(entry.event, time(entry.checkedAt), 4);
    }
  }
  // Keep only known root authority across cache GC; never let a stale viewport revive removed links.
  for (const [id, prior] of retained) {
    if (prior.event) add(prior.event, prior.checkedAt, prior.rank);
    else if (!candidates.has(id)) candidates.set(id, []);
  }
  const records = new Map<string, MembershipRecord>(), unavailable = new Set<string>();
  for (const [id, choices] of candidates) {
    const tombstone = tombstones.get(id);
    const eligible = tombstone === undefined ? choices : choices.filter(choice => choice.rank >= 3 && choice.checkedAt > tombstone);
    eligible.sort((a, b) => b.checkedAt - a.checkedAt || Number(negative(b.event)) - Number(negative(a.event)) || b.rank - a.rank);
    const best = eligible[0];
    // fetchMinimalEvents is the full paginated public snapshot, not a viewport/date subset.
    const priorAbsence = retained.get(id);
    const omitted = feed && feedTime > 0 && (!best || best.checkedAt <= feedTime) && !feedIds.has(id);
    if (!best || omitted || priorAbsence?.event === null && best.checkedAt <= priorAbsence.checkedAt) {
      unavailable.add(id);
      if (omitted && (retained.has(id) || choices.some(choice => choice.event.locationScope === 'area')))
        retained.set(id, { event: null, checkedAt: feedTime, rank: 0 });
      continue;
    }
    records.set(id, best);
    if (best.event.locationScope === 'area' || retained.has(id)) retained.set(id, best);
  }
  for (const id of tombstones.keys()) if (!records.has(id)) unavailable.add(id);
  const unavailableAt = new Map([...unavailable].map(id => [id, Math.max(feedTime, tombstones.get(id) || 0,
    retained.get(id)?.checkedAt || 0, ...(candidates.get(id) || []).map(candidate => candidate.checkedAt))]));
  return { ...buildAreaMembershipIndex(records, unavailable), unavailableAt };
}

const readers = new WeakMap<QueryClient, ReturnType<typeof createReader>>();
function createReader(client: QueryClient) {
  const listeners = new Set<() => void>(), tombstones = new Map<string, number>(), retained = new Map<string, RootAuthority>();
  let snapshot: ReturnType<typeof readAreaMembershipIndex> | undefined;
  let stopStore: (() => void) | undefined, stopCache: (() => void) | undefined;
  const invalidate = () => { snapshot = undefined; listeners.forEach(listener => listener()); };
  const getSnapshot = () => snapshot ||= readAreaMembershipIndex(client, useMapStore.getState(), tombstones, retained);
  const getLatest = () => { if (!listeners.size) snapshot = undefined; return getSnapshot(); };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    if (listeners.size === 1) {
      snapshot = undefined;
      stopStore = useMapStore.subscribe((state, previous) => {
        if (client.getQueryData(EVENTS_MINIMAL)) return; // viewport/like copies cannot change full-feed authority
        if (state.allEvents !== previous.allEvents || state.events !== previous.events || state.lastFetchedAt !== previous.lastFetchedAt) invalidate();
      });
      stopCache = client.getQueryCache().subscribe(event => {
        if (currentFeed(event.query.queryKey) || currentDetails(event.query.queryKey) || currentRoot(event.query.queryKey)) {
          if (event.type === 'added' || event.type === 'removed' || event.type === 'updated' && event.action.type === 'success') invalidate();
        }
      });
    }
    return () => { listeners.delete(listener); if (!listeners.size) { stopStore?.(); stopCache?.(); snapshot = undefined; } };
  };
  return { getSnapshot, getLatest, subscribe };
}
export function useAreaMembershipIndex() {
  const client = useQueryClient();
  const reader = getReader(client);
  return useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot);
}
function getReader(client: QueryClient) {
  let reader = readers.get(client);
  if (!reader) { reader = createReader(client); readers.set(client, reader); }
  return reader;
}
export const getAreaMembershipSnapshot = (client: QueryClient) => getReader(client).getLatest();
