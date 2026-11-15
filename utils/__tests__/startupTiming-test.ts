type Timing = typeof import('../startupTiming');
const originalFlag = process.env.EXPO_PUBLIC_MAP_LATENCY_TRACE;
let clock = 100;
const load = (enabled = true): Timing => {
  jest.resetModules();
  process.env.EXPO_PUBLIC_MAP_LATENCY_TRACE = enabled ? '1' : '0';
  jest.spyOn(globalThis.performance, 'now').mockImplementation(() => clock);
  return require('../startupTiming') as Timing;
};
afterEach(() => {
  jest.restoreAllMocks(); jest.useRealTimers();
  if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_MAP_LATENCY_TRACE;
  else process.env.EXPO_PUBLIC_MAP_LATENCY_TRACE = originalFlag;
});
it('records the first real fetch even long after module loading, without starting manual tracing', () => {
  const timing = load(); clock += 600000;
  const fetch = timing.beginStartupFetch()!;
  clock += 1200; fetch('public_fetch_finished', { items: 400 });
  clock += 300; fetch('private_fetch_finished', { items: 0 });
  fetch('feed_fetch_finished', { items: 400 });
  expect(timing.beginStartupFetch()).toBeUndefined();
  expect(timing.formatStartupTimingExport()).toContain('"elapsedMs":601500');
  expect((require('../mapTrace') as typeof import('../mapTrace')).MAP_TRACE_ENABLED).toBe(false);
});
it('survives manual Clear and capture expiry and is included in Share afterward', () => {
  jest.useFakeTimers();
  const timing = load();
  timing.recordStartupMilestone('clusters_computed', { clusters: 6 });
  const trace = require('../mapTrace') as typeof import('../mapTrace');
  expect(trace.formatMapTraceExport()).toContain('clusters_computed');
  trace.startMapTrace(); trace.clearMapTrace();
  jest.advanceTimersByTime(180000);
  expect(trace.MAP_TRACE_ENABLED).toBe(false);
  expect(trace.formatMapTraceExport()).toContain('clusters_computed');
});
it('deduplicates frame callbacks and bounds even an excessive page sequence', () => {
  const timing = load();
  for (let i = 0; i < 1000; i++) timing.recordStartupMilestone('map_frame_with_clusters_proxy', { clusters: 6 });
  expect(timing.formatStartupTimingExport().match(/"stage":"map_frame_with_clusters_proxy"/g)).toHaveLength(1);
  const fetch = timing.beginStartupFetch()!;
  for (let i = 0; i < 1000; i++) fetch('public_page_received', { page: i });
  expect(timing.formatStartupTimingExport().split('\n').filter(line => line.startsWith('{'))).toHaveLength(64);
});
it('stops a completed fetch recorder and stays dormant outside diagnostic bundles', () => {
  const timing = load(); const fetch = timing.beginStartupFetch()!;
  fetch('feed_fetch_failed'); fetch('public_page_received', { page: 1 });
  expect(timing.formatStartupTimingExport()).not.toContain('public_page_received');
  const disabled = load(false);
  disabled.recordStartupMilestone('auth_ready');
  expect(disabled.beginStartupFetch()).toBeUndefined();
  expect(disabled.formatStartupTimingExport()).toBe('');
});
