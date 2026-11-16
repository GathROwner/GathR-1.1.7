jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { beginPublicSnapshotRefresh, readPublicEventSnapshot, savePublicEventSnapshot } from '../../lib/publicEventSnapshot';
import { chunkedQueryStorage } from '../../utils/chunkedAsyncStorage';
import { deserializeEventQueryCache, persistNonFeedQuery } from '../../lib/eventFeedPersistence';
import { QueryClient, dehydrate } from '@tanstack/react-query';
import { EVENTS_MINIMAL } from '../../lib/queryKeys';
import type { Event } from '../../types/events';

const event = (id: string, extra: Partial<Event> = {}) => ({ id, source: 'firestore', type: 'event',
  title: id, startDate: '2026-11-16', endDate: '2026-11-16', startTime: '19:00', endTime: '23:00', ...extra } as Event);
const save = async (events: Event[]) => savePublicEventSnapshot(events, Date.now(), beginPublicSnapshotRefresh());
beforeEach(async () => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 10, 16, 12)); await AsyncStorage.clear(); });
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

it('retains a compatible public snapshot for months while removing expired occurrences at read time', async () => {
  await save([event('old'), event('future', { startDate: '2027-11-16', endDate: '2027-11-16' })]);
  const fetchedAt = Date.now();
  jest.setSystemTime(new Date(2027, 0, 16, 12));
  const restored = await readPublicEventSnapshot();
  expect(restored?.combinedData.map(e => e.id)).toEqual(['future']);
  expect(restored?.fetchedAt).toBe(fetchedAt);
});
it('keeps overnight events until their actual next-day cutoff', async () => {
  await save([event('overnight', { startTime: '23:00', endTime: '01:00' })]);
  jest.setSystemTime(new Date(2026, 10, 17, 0, 30));
  expect((await readPublicEventSnapshot())?.combinedData).toHaveLength(1);
  jest.setSystemTime(new Date(2026, 10, 17, 2));
  expect((await readPublicEventSnapshot())?.combinedData).toHaveLength(0);
});
it('does not persist private/friend rows or account-specific public contribution badges', async () => {
  await save([event('public', { sharedEventProvenance: { sharedByCurrentUser: true, privateEventId: 'secret' } }),
    event('private', { source: 'private_shared' }), event('friend', { source: 'friend_event' })]);
  const restored = await readPublicEventSnapshot();
  expect(restored?.combinedData.map(e => e.id)).toEqual(['public']);
  expect(JSON.stringify(restored)).not.toContain('secret');
  expect(restored?.combinedData[0].sharedEventProvenance).toBeUndefined();
});
it('replaces the snapshot instead of appending, including a successful empty public feed', async () => {
  await save([event('deleted'), event('changed')]);
  await save([event('changed', { title: 'Updated title' })]);
  expect((await readPublicEventSnapshot())?.combinedData.map(e => e.title)).toEqual(['Updated title']);
  await save([]);
  expect((await readPublicEventSnapshot())?.combinedData).toEqual([]);
});
it('keeps the previous committed snapshot on storage failure', async () => {
  await save([event('last-good')]);
  jest.spyOn(chunkedQueryStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
  await save([event('not-committed')]);
  expect((await readPublicEventSnapshot())?.combinedData[0].id).toBe('last-good');
});
it('rejects an older completion after a newer full download started', async () => {
  const old = beginPublicSnapshotRefresh(), newer = beginPublicSnapshotRefresh();
  await savePublicEventSnapshot([event('new')], Date.now(), newer);
  await savePublicEventSnapshot([event('old')], Date.now(), old);
  expect((await readPublicEventSnapshot())?.combinedData[0].id).toBe('new');
});
it('rejects incompatible schemas and malformed disk data without fetching or deleting data', async () => {
  await save([event('saved')]);
  const raw = JSON.parse((await chunkedQueryStorage.getItem('gathr-public-event-snapshot-v1'))!);
  await chunkedQueryStorage.setItem('gathr-public-event-snapshot-v1', JSON.stringify({ ...raw, compatibility: 'other backend or schema' }));
  expect(await readPublicEventSnapshot()).toBeNull();
  await chunkedQueryStorage.setItem('gathr-public-event-snapshot-v1', 'broken json');
  expect(await readPublicEventSnapshot()).toBeNull();
});
it('excludes mixed private feeds from new query snapshots and strips legacy mixed feeds on restore', () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  client.setQueryData(EVENTS_MINIMAL, { combinedData: [event('private', { source: 'private_shared' })], accountId: 'account-a' });
  client.setQueryData(['ordinary-detail'], { id: 'detail' });
  const persisted = dehydrate(client, { shouldDehydrateQuery: persistNonFeedQuery });
  expect(persisted.queries.map(q => q.queryKey)).toEqual([['ordinary-detail']]);
  const legacy = deserializeEventQueryCache(JSON.stringify({ clientState: dehydrate(client) }));
  expect(legacy.clientState.queries.map((q: any) => q.queryKey)).toEqual([['ordinary-detail']]);
  client.clear();
});
