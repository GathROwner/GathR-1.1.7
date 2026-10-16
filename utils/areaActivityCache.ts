import type { QueryClient } from '@tanstack/react-query';
import type { Event } from '../types/events';
import { normalizeFirestoreEvent } from '../lib/api/firestoreEvents';
import { EVENTS_MINIMAL, EVENT_DETAILS_SCHEMA_VERSION } from '../lib/queryKeys';
import { toFirestoreEventId } from './firestoreEventIds';
import { readVersion2EventTiming } from './eventTiming';
import { normalizeRecurrenceFlag } from './eventRecurrence';

// Match the existing minimal-feed freshness window, without extending it on cache reads.
export const AREA_ACTIVITY_FRESH_MS = 3 * 60 * 1000;
export const areaActivityKey = (id: string | number) =>
  ['area-linked-event', 'cache-first-v1', EVENT_DETAILS_SCHEMA_VERSION, toFirestoreEventId(id)] as const;
export type AreaActivityEntry = { status: 'found'; event: Event; checkedAt: number }
  | { status: 'unavailable'; checkedAt: number };
export type ActivityCandidate = { event: Event; checkedAt: number; rank: number };
export type ActivityStore = { events: Event[]; allEvents: Event[]; lastFetchedAt: number | null };
const terminal = (event: Event) => event.isCancelled || event.isExpired
  || ['cancelled', 'canceled', 'deleted', 'expired'].includes(String(event.status || '').trim().toLowerCase());
const timestamp = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(0, Math.min(Date.now(), value)) : 0;
const newest = (items: ActivityCandidate[]) => [...items].sort((a, b) => b.checkedAt - a.checkedAt || Number(Boolean(terminal(b.event))) - Number(Boolean(terminal(a.event))) || b.rank - a.rank)[0];
const currentEventQuery = (key: readonly unknown[]) => key[0] === 'event-details' && key[1] === EVENT_DETAILS_SCHEMA_VERSION;
const currentFeedQuery = (key: readonly unknown[]) => JSON.stringify(key) === JSON.stringify(EVENTS_MINIMAL);

const asEvent = (record: any): Event | null => {
  if (!record || record.id == null) return null;
  if (record.type !== 'event' && record.type !== 'special') return normalizeFirestoreEvent(record);
  const timing = readVersion2EventTiming(record);
  const recurring = normalizeRecurrenceFlag(record.isRecurring);
  const instance = normalizeRecurrenceFlag(record.isRecurringInstance);
  return timing === record.timing && recurring === record.isRecurring && instance === record.isRecurringInstance ? record : {
    ...record, ...(timing ? { timing } : {}), isRecurring: recurring, isRecurringInstance: instance,
  };
};

/** Index exact IDs only. Presence/negative records are retained even when display gates reject them. */
export function getActivityCandidates(client: QueryClient, store: ActivityStore, ids: string[]) {
  const wanted = new Set(ids.map(toFirestoreEventId));
  const result = new Map<string, ActivityCandidate[]>();
  const add = (record: unknown, checkedAt: number, rank: number) => {
    const id = toFirestoreEventId((record as Event)?.id);
    if (!wanted.has(id)) return;
    const event = asEvent(record);
    if (event) result.set(id, [...(result.get(id) || []), { event, checkedAt, rank }]);
  };
  const feed = client.getQueryState<{ combinedData: Event[]; fetchedAt?: number }>(EVENTS_MINIMAL);
  // lastFetchedAt can advance on a cache hit: prefer the actual feed fetch time.
  const feedTime = feed?.data ? timestamp(feed.data.fetchedAt) : timestamp(store.lastFetchedAt);
  store.allEvents.forEach(event => add(event, feedTime, 1));
  store.events.forEach(event => add(event, feedTime, 2));
  feed?.data?.combinedData?.forEach(event => add(event, timestamp(feed.data?.fetchedAt), 0));
  for (const query of client.getQueryCache().findAll()) {
    if (currentEventQuery(query.queryKey) && Array.isArray(query.state.data)) {
      query.state.data.forEach(event => add(event, timestamp(query.state.dataUpdatedAt), 3));
    }
  }
  return result;
}

export function resolveActivityEntry(candidates: ActivityCandidate[], cached?: AreaActivityEntry): AreaActivityEntry | undefined {
  // Only a newer successful detail can clear a confirmed-missing tombstone.
  // A feed/store fallback alone is not proof that a deleted record was restored.
  if (cached?.status === 'unavailable') {
    const restored = newest(candidates.filter(candidate => candidate.rank === 3 && candidate.checkedAt > cached.checkedAt));
    return restored ? { status: 'found', event: restored.event, checkedAt: restored.checkedAt } : cached;
  }
  const choices = cached?.status === 'found' ? [...candidates,
    { event: cached.event, checkedAt: cached.checkedAt, rank: 4 }] : candidates;
  const best = newest(choices);
  return best ? { status: 'found', event: best.event, checkedAt: best.checkedAt } : undefined;
}

/** A response started before a newer store/detail arrival must not overwrite it. */
export function changedActivityDuringLoad(before: ActivityCandidate[], after: ActivityCandidate[], startedAt: number) {
  const priorTime = Math.max(0, ...before.map(candidate => candidate.checkedAt));
  // Recreated objects with unchanged/older fetch times are not newer authority.
  return newest(after.filter(candidate => candidate.checkedAt > priorTime && candidate.checkedAt >= startedAt));
}

/** Reconcile just this ID, preserving other records and original batch/feed freshness. */
export function reconcileActivityCaches(client: QueryClient, id: string, entry: AreaActivityEntry,
  setStore: (update: (state: ActivityStore) => Partial<ActivityStore>) => void) {
  const update = (records: any[]) => records.flatMap(record => toFirestoreEventId(record?.id) !== id ? [record]
    : entry.status === 'found' ? [entry.event] : []);
  setStore(state => ({ events: update(state.events), allEvents: update(state.allEvents) }));
  for (const query of client.getQueryCache().findAll()) {
    const data = query.state.data;
    if (currentFeedQuery(query.queryKey) && data && typeof data === 'object' && 'combinedData' in data
      && Array.isArray(data.combinedData) && data.combinedData.some(row => toFirestoreEventId(row?.id) === id)) {
      client.setQueryData(query.queryKey, { ...data, combinedData: update(data.combinedData) }, { updatedAt: query.state.dataUpdatedAt });
    } else if (currentEventQuery(query.queryKey) && Array.isArray(data) && data.some(row => toFirestoreEventId(row?.id) === id)) {
      client.setQueryData(query.queryKey, update(data), { updatedAt: query.state.dataUpdatedAt });
    }
  }
}

// A small shared pool prevents a stale programme from issuing an unbounded burst.
const pools = new WeakMap<QueryClient, { active: number; queue: (() => void)[] }>();
export async function withActivityLoadSlot<T>(client: QueryClient, signal: AbortSignal, load: () => Promise<T>): Promise<T> {
  let pool = pools.get(client);
  if (!pool) { pool = { active: 0, queue: [] }; pools.set(client, pool); }
  if (pool.active >= 4) await new Promise<void>(resolve => pool!.queue.push(resolve));
  else pool.active++;
  try {
    if (signal.aborted) throw new Error('Activity request cancelled');
    return await load();
  } finally {
    const next = pool.queue.shift();
    if (next) next(); else pool.active--;
  }
}
