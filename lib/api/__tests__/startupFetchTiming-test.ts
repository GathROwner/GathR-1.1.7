jest.mock('../../../config/firebaseConfig', () => ({ auth: { currentUser: null }, firestore: {} }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../privateSharedEvents', () => ({ fetchPrivateSharedEventsForCurrentUser: jest.fn() }));
const originalFetch = global.fetch;
const originalFlag = process.env.EXPO_PUBLIC_MAP_LATENCY_TRACE;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
};
const load = () => {
  jest.resetModules(); process.env.EXPO_PUBLIC_MAP_LATENCY_TRACE = '1';
  const privateApi = require('../privateSharedEvents');
  return { api: require('../events') as typeof import('../events'), privateApi,
    timing: require('../../../utils/startupTiming') as typeof import('../../../utils/startupTiming') };
};
afterEach(() => {
  global.fetch = originalFetch;
  if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_MAP_LATENCY_TRACE;
  else process.env.EXPO_PUBLIC_MAP_LATENCY_TRACE = originalFlag;
});
it('records pages independently of a slower private fetch, preserving the original wait and single flight', async () => {
  const { api, privateApi, timing } = load();
  const privateResult = deferred<never[]>();
  privateApi.fetchPrivateSharedEventsForCurrentUser.mockReturnValue(privateResult.promise);
  const fetchMock = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ events: [], nextPageToken: 'synthetic' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ events: [] }) });
  global.fetch = fetchMock;
  const pending = api.fetchMinimalEvents(); let finished = false;
  void pending.then(() => { finished = true; });
  expect(api.fetchMinimalEvents()).toBe(pending);
  for (let i = 0; i < 16; i++) await Promise.resolve();
  expect(finished).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(timing.formatStartupTimingExport()).toContain('public_fetch_finished');
  expect(timing.formatStartupTimingExport()).not.toContain('feed_fetch_finished');
  privateResult.resolve([]); await pending;
  const report = timing.formatStartupTimingExport();
  expect(report).toContain('private_fetch_finished');
  expect(report).toContain('feed_fetch_finished');
  expect(report.match(/"stage":"feed_fetch_started"/g)).toHaveLength(1);
  expect(report).not.toContain('synthetic'); // cursor never recorded
});
it('records public failure and rejects so a saved feed cannot be cleared as a successful empty sync', async () => {
  const { api, privateApi, timing } = load();
  privateApi.fetchPrivateSharedEventsForCurrentUser.mockResolvedValue([]);
  global.fetch = jest.fn().mockRejectedValue(new Error('synthetic network failure'));
  await expect(api.fetchMinimalEvents()).rejects.toThrow('synthetic network failure');
  expect(timing.formatStartupTimingExport()).toContain('public_fetch_failed');
  expect(timing.formatStartupTimingExport()).not.toContain('synthetic network failure');
});
