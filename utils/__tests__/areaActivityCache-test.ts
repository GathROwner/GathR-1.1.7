import { QueryClient } from '@tanstack/react-query';
import type { Event } from '../../types/events';
import { areaActivityKey, getActivityCandidates, reconcileActivityCaches, resolveActivityEntry, changedActivityDuringLoad } from '../areaActivityCache';
import { EVENTS_MINIMAL, EVENT_DETAILS_SCHEMA_VERSION } from '../../lib/queryKeys';
jest.mock('../../config/firebaseConfig', () => ({ auth: { currentUser: null }, firestore: {} }));
const event = { id: 'fb_child', type: 'event', title: 'Child', venueId: 'venue', isCancelled: false, isRecurring: false, isRecurringInstance: false } as Event;
let client: QueryClient;
beforeEach(() => { client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }); });
afterEach(() => client.clear());
it('uses a new per-ID cache generation and ignores old area programme arrays', () => {
  client.setQueryData(['area-linked-events', 'root', 'venue', 'child'], [event]);
  expect(client.getQueryData(areaActivityKey('child'))).toBeUndefined();
  expect(areaActivityKey('fb_child')).toEqual(areaActivityKey('child'));
});
it('preserves unrelated records and actual batch/feed freshness during confirmed removal', () => {
  const other = { ...event, id: 'fb_other' };
  const when = Date.now() - 60000;
  client.setQueryData(EVENTS_MINIMAL, { combinedData: [event, other], fetchedAt: when }, { updatedAt: when });
  const details = ['event-details', EVENT_DETAILS_SCHEMA_VERSION, 'fb_child,fb_other'];
  client.setQueryData(details, [event, other], { updatedAt: when });
  let store = { events: [event, other], allEvents: [event, other], lastFetchedAt: when as number | null };
  reconcileActivityCaches(client, 'child', { status: 'unavailable', checkedAt: Date.now() }, update => { store = { ...store, ...update(store) }; });
  expect(store.events).toEqual([other]); expect(store.allEvents).toEqual([other]);
  expect(client.getQueryData(EVENTS_MINIMAL)).toEqual({ combinedData: [other], fetchedAt: when });
  expect(client.getQueryData(details)).toEqual([other]); expect(client.getQueryState(details)?.dataUpdatedAt).toBe(when);
  expect(client.getQueryState(EVENTS_MINIMAL)?.dataUpdatedAt).toBe(when);
});
it('uses actual feed fetchedAt rather than a later cache-read lastFetchedAt', () => {
  const when = Date.now() - 60000;
  client.setQueryData(EVENTS_MINIMAL, { combinedData: [event], fetchedAt: when });
  const candidates = getActivityCandidates(client, { events: [event], allEvents: [event], lastFetchedAt: Date.now() }, ['child']);
  expect(candidates.get('child')?.every(value => value.checkedAt === when)).toBe(true);
});
it('orders cancellation and correction by freshness, with conservative negative ties', () => {
  const old = { event: { ...event, isCancelled: true }, checkedAt: 100, rank: 1 };
  const fresh = { event, checkedAt: 200, rank: 3 };
  expect(resolveActivityEntry([old, fresh])).toMatchObject({ event: { isCancelled: false } });
  expect(resolveActivityEntry([fresh, { ...old, checkedAt: 300 }])).toMatchObject({ event: { isCancelled: true } });
  expect(resolveActivityEntry([fresh, { ...old, checkedAt: 200 }])).toMatchObject({ event: { isCancelled: true } });
});
it('only a newer canonical detail clears a tombstone, not a stale/new feed fallback', () => {
  const missing = { status: 'unavailable' as const, checkedAt: 100 };
  const candidate = { event, checkedAt: 200, rank: 1 };
  expect(resolveActivityEntry([candidate], missing)).toBe(missing);
  expect(resolveActivityEntry([{ ...candidate, rank: 3 }], missing)).toMatchObject({ status: 'found', event });
});
it('does not equate recreated old references with newer authority during a request', () => {
  const candidate = { event, checkedAt: 100, rank: 1 };
  expect(changedActivityDuringLoad([candidate], [{ ...candidate, event: { ...event } }], 150)).toBeUndefined();
  expect(changedActivityDuringLoad([candidate], [{ ...candidate, checkedAt: 200, rank: 3 }], 150)).toBeDefined();
});
