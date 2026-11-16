jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { persistQueryClientRestore, persistQueryClientSave, persistQueryClientSubscribe,
  type PersistedClient, type Persister } from '@tanstack/query-persist-client-core';
import { createChunkedAsyncStorage } from '../../utils/chunkedAsyncStorage';
import { EVENTS_MINIMAL } from '../../lib/queryKeys';
import { EVENTS_PERSIST_MAX_AGE_MS, EVENTS_QUERY_GC_MS, EVENTS_QUERY_STALE_MS } from '../../lib/eventCachePolicy';

const minute = 60 * 1000;
const clients: QueryClient[] = [];
const stops: (() => void)[] = [];
const makeClient = (feedGc = EVENTS_QUERY_GC_MS) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 10 * minute } } });
  // Same pre-hydration default as RootLayout: auth must not have to finish first.
  client.setQueryDefaults(EVENTS_MINIMAL, { gcTime: feedGc });
  clients.push(client);
  return client;
};
const makePersister = () => {
  const storage = createChunkedAsyncStorage(AsyncStorage, 128);
  let pending = Promise.resolve();
  const persister: Persister = {
    persistClient(value: PersistedClient) {
      pending = pending.then(() => storage.setItem('retention-test', JSON.stringify(value)));
      return pending;
    },
    async restoreClient() {
      const value = await storage.getItem('retention-test');
      return value ? JSON.parse(value) : undefined;
    },
    removeClient() {
      pending = pending.then(() => storage.removeItem('retention-test'));
      return pending;
    },
  };
  return { persister, flush: () => pending };
};
const savedFeed = { combinedData: [{ id: 'public-synthetic' }], fetchedAt: 123 };
beforeEach(async () => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-16T01:00:00Z')); await AsyncStorage.clear(); });
afterEach(() => { stops.splice(0).forEach(stop => stop()); clients.splice(0).forEach(client => client.clear()); jest.useRealTimers(); });

it.each([true, false])('reproduces inactive-feed eviction and verifies retained chunked snapshot (fixed=%s)', async fixed => {
  const client = makeClient(fixed ? EVENTS_QUERY_GC_MS : 10 * minute);
  const { persister, flush } = makePersister();
  stops.push(persistQueryClientSubscribe({ queryClient: client, persister }));
  await client.fetchQuery({ queryKey: EVENTS_MINIMAL, queryFn: async () => savedFeed });
  const updatedAt = client.getQueryState(EVENTS_MINIMAL)!.dataUpdatedAt;
  client.setQueryData(['unrelated-detail'], { id: 'detail' });
  await flush();
  expect(client.getQueryCache().find({ queryKey: EVENTS_MINIMAL })!.getObserversCount()).toBe(0);
  jest.advanceTimersByTime(11 * minute);
  // A later cache write must not turn the disk copy into an empty bootstrap.
  client.setQueryData(['other-detail'], { id: 'new-detail' });
  await flush();
  const restored = makeClient();
  await persistQueryClientRestore({ queryClient: restored, persister, maxAge: EVENTS_PERSIST_MAX_AGE_MS });
  expect(restored.getQueryData(['unrelated-detail'])).toBeUndefined();
  if (!fixed) {
    expect(restored.getQueryData(EVENTS_MINIMAL)).toBeUndefined();
    return;
  }
  expect(restored.getQueryData(EVENTS_MINIMAL)).toEqual(savedFeed);
  expect(restored.getQueryState(EVENTS_MINIMAL)!.dataUpdatedAt).toBe(updatedAt);
  // Retention must not turn old data into fresh data or suppress a real refresh.
  const refresh = jest.fn(async () => ({ combinedData: [], fetchedAt: 456 }));
  await restored.fetchQuery({ queryKey: EVENTS_MINIMAL, queryFn: refresh, staleTime: EVENTS_QUERY_STALE_MS });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(restored.getQueryData(EVENTS_MINIMAL)).toEqual({ combinedData: [], fetchedAt: 456 });
});

it('applies retention while restored queries wait for auth, without prolonging unrelated queries', async () => {
  const source = makeClient(), { persister, flush } = makePersister();
  source.setQueryData(EVENTS_MINIMAL, savedFeed);
  await persistQueryClientSave({ queryClient: source, persister }); await flush();
  const restored = makeClient();
  await persistQueryClientRestore({ queryClient: restored, persister, maxAge: EVENTS_PERSIST_MAX_AGE_MS });
  jest.advanceTimersByTime(11 * minute);
  expect(restored.getQueryData(EVENTS_MINIMAL)).toEqual(savedFeed);
});

it('still rejects a disk snapshot older than the existing twelve-hour limit', async () => {
  const source = makeClient(), { persister, flush } = makePersister();
  source.setQueryData(EVENTS_MINIMAL, savedFeed);
  await persistQueryClientSave({ queryClient: source, persister });
  jest.advanceTimersByTime(EVENTS_PERSIST_MAX_AGE_MS + 1);
  const restored = makeClient();
  await persistQueryClientRestore({ queryClient: restored, persister, maxAge: EVENTS_PERSIST_MAX_AGE_MS });
  await flush(); // the library intentionally does not await removeClient()
  expect(restored.getQueryData(EVENTS_MINIMAL)).toBeUndefined();
  expect(await persister.restoreClient()).toBeUndefined();
});
