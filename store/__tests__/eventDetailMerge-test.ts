/** Real store detail-fetch/merge coverage; all I/O is mocked. No map is mounted. */
jest.mock('../../config/firebaseConfig', () => ({ auth: {}, firestore: {}, app: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), getDocs: jest.fn(), query: jest.fn(), where: jest.fn(),
}));
jest.mock('expo-location', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('supercluster', () => ({
  __esModule: true,
  default: class { load() { return this; } getClusters() { return []; } getLeaves() { return []; } },
}));

let mockComparisons = 0;
let mockIdKeys = 0;
jest.mock('../../lib/api/firestoreEvents', () => {
  const actual = jest.requireActual('../../lib/api/firestoreEvents');
  return {
    ...actual,
    fetchFirestoreEventDetailsBatch: jest.fn(),
    areEventIdsEquivalent: (...args: unknown[]) => { mockComparisons++; return actual.areEventIdsEquivalent(...args); },
    toFirestoreEventId: (...args: unknown[]) => { mockIdKeys++; return actual.toFirestoreEventId(...args); },
  };
});

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { performance } from 'perf_hooks';
import { useMapStore } from '../mapStore';
import { areEventIdsEquivalent, fetchFirestoreEventDetailsBatch, toAppEventId } from '../../lib/api/firestoreEvents';
import { isPrivateSharedEventId } from '../../lib/api/privateSharedEvents';
import { ENABLE_LEGACY_DETAILS_FALLBACK, LEGACY_EVENTS_API_BASE } from '../../lib/config/backend';
import { EVENT_DETAILS_SCHEMA_VERSION } from '../../lib/queryKeys';
import { createLegacyTimingContract } from '../../utils/eventTiming';
import type { Event } from '../../types/events';

type Fixture = { events: Event[]; allEvents: Event[]; raw: any[]; ids: (string | number)[]; cached?: any[]; force?: boolean };
type Collections = Pick<Fixture, 'events' | 'allEvents'>;
const initial = useMapStore.getState();
const queryGlobal = global as typeof global & { __RQ_CLIENT?: any };
const originalQueryClient = queryGlobal.__RQ_CLIENT;
const baselineSource = readFileSync(resolve(__dirname, 'fixtures/fetchEventDetails-baseline.ts.txt'), 'utf8');
const compiledBaseline = require('@babel/core').transformSync(`const fetchEventDetails = ${baselineSource};`, {
  filename: 'baseline.ts', babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-typescript'],
}).code;
// Execute the frozen, entire original function, including normalization,
// coercion, private-ID guards and cache behavior; do not hand-copy a reference algorithm.
const baselineFactory = new Function('get', 'set', 'env', `
  const { areEventIdsEquivalent, fetchFirestoreEventDetailsBatch, toAppEventId,
    isPrivateSharedEventId, ENABLE_LEGACY_DETAILS_FALLBACK, LEGACY_EVENTS_API_BASE,
    EVENT_DETAILS_SCHEMA_VERSION, createLegacyTimingContract, global } = env;
  const DEBUG_MAP_LOAD = false;
  ${compiledBaseline}
  return fetchEventDetails;
`);

const event = (id: string | number, overrides: Partial<Event> = {}): Event => ({
  id, type: 'event', title: `Event ${id}`, category: 'Live Music', description: 'Short description',
  venueId: 'venue-1', venue: 'Example venue', address: '1 Main St',
  startDate: '2040-10-13', endDate: '2040-10-13', startTime: '7:00 PM', endTime: '9:00 PM',
  latitude: 46.235, longitude: -63.129, ticketLinkPosts: 'old-post', ticketLinkEvents: 'old-event',
  ticketLink: 'old-link', ticketsBuyUrl: 'old-buy', actionLinks: [{ url: 'old-action', role: 'event_info', label: 'Info' }],
  imageUrl: 'old-poster', mediaUrls: ['old-poster', 'old-gallery'], profileUrl: 'old-avatar', ticketPrice: '$10',
  ...overrides,
} as Event);

async function run(fixture: Fixture, baseline = false) {
  (fetchFirestoreEventDetailsBatch as jest.Mock).mockResolvedValue(fixture.raw);
  const qc = fixture.cached ? {
    getQueryData: jest.fn(() => fixture.cached), fetchQuery: jest.fn(async () => fixture.raw), setQueryData: jest.fn(),
  } : null;
  queryGlobal.__RQ_CLIENT = qc;
  let state: Collections = { events: fixture.events, allEvents: fixture.allEvents };
  const fetchDetails = baseline ? baselineFactory(() => state, (next: Collections) => { state = { ...state, ...next }; }, {
    areEventIdsEquivalent, fetchFirestoreEventDetailsBatch, toAppEventId, isPrivateSharedEventId,
    ENABLE_LEGACY_DETAILS_FALLBACK, LEGACY_EVENTS_API_BASE, EVENT_DETAILS_SCHEMA_VERSION, createLegacyTimingContract, global,
  }) : useMapStore.getState().fetchEventDetails;
  if (!baseline) useMapStore.setState(state);
  await fetchDetails(fixture.ids, { forceRefresh: fixture.force });
  await Promise.resolve();
  await Promise.resolve();
  if (!baseline) state = { events: useMapStore.getState().events, allEvents: useMapStore.getState().allEvents };
  return { ...state, qc };
}

describe('event detail merge parity', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    useMapStore.setState(initial, true);
    queryGlobal.__RQ_CLIENT = originalQueryClient;
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('keeps first detail match, last duplicate record, original identity/type and list positions', async () => {
    const fixture: Fixture = {
      events: [event('fb_42'), event('other'), event(42, { type: 'special', title: 'Later original duplicate' })],
      allEvents: [event('other'), event(' 42 '), event('untouched')], ids: [42, 'extra'],
      raw: [{ id: 42, title: 'First detail', fullDescription: 'Complete description' },
        { id: 'fb_42', title: 'Second detail must not win' },
        { id: 'extra', title: 'First extra' }, { id: 'fb_extra', title: 'Last extra wins' }],
    };
    const expected = await run(fixture, true);
    const actual = await run(fixture);
    expect(actual.events).toEqual(expected.events);
    expect(actual.allEvents).toEqual(expected.allEvents);
    expect(actual.events.map((item) => item.id)).toEqual([42, 'other', 'fb_extra']);
    expect(actual.events[0]).toMatchObject({ type: 'special', title: 'First detail', description: 'Complete description' });
    expect(actual.events[2].title).toBe('Last extra wins');
    expect(actual.allEvents.map((item) => item.id)).toEqual(['other', ' 42 ', 'untouched', 'fb_extra']);
    expect(actual.allEvents[2]).toBe(fixture.allEvents[2]);
  });

  it('preserves media, timing, source, recurrence, location and ticket/action fields and nullish fallbacks', async () => {
    const timing = createLegacyTimingContract({ startDate: '2040-10-13', startTime: '7:00 PM', endDate: '2040-10-13', endTime: '9:00 PM' });
    const fixture: Fixture = {
      events: [event('fb_movie')], allEvents: [event('fb_movie')], ids: ['movie'], raw: [{
        id: 'movie', fullDescription: 'Full movie description', description: 'Short movie description',
        imageUrl: 'specific-movie-poster', mediaUrls: ['specific-movie-poster', 'venue-programme'], profileUrl: 'venue-avatar',
        timing, source: 'firestore', sourceUrl: 'original-source', sourceUniqueId: 'original-source-id',
        ticketLinkPosts: null, ticketLinkEvents: undefined, ticketsBuyUrl: '', ticketLink: 'new-link', actionLinks: [],
        locationScope: 'route', mapMode: 'route', routeData: { title: 'Route fixture' },
        metadata: { isRecurring: false, recurringPattern: 'weekly', isRecurringInstance: true, originalEventId: 'original' },
        likes: 12, shares: 3, interested: 6, comments: 2, ageRestriction: '18+', venuePhone: '555-0100',
      }],
    };
    const expected = await run(fixture, true);
    const actual = await run(fixture);
    expect(actual.events).toEqual(expected.events);
    expect(actual.allEvents).toEqual(expected.allEvents);
    expect(actual.events[0]).toMatchObject({ imageUrl: 'specific-movie-poster',
      mediaUrls: ['specific-movie-poster', 'venue-programme'], timing, description: 'Full movie description',
      ticketLinkPosts: 'old-post', ticketLinkEvents: 'old-event', ticketsBuyUrl: '', actionLinks: [],
      isRecurring: false, recurringPattern: 'weekly', isRecurringInstance: true, originalEventId: 'fb_original',
    });
  });

  it('skips private and contributor-confirmed requests and preserves their untouched records', async () => {
    const privateEvent = event('shared_private', { source: 'private_shared' });
    const confirmed = event('fb_confirmed', { sharedEventProvenance: { sharedByCurrentUser: true } as any });
    const fixture: Fixture = { events: [privateEvent, confirmed, event('fb_public')],
      allEvents: [privateEvent, confirmed, event('fb_public')], ids: ['shared_private', 'fb_confirmed', 'public'],
      raw: [{ id: 'public', title: 'Public details' }] };
    const expected = await run(fixture, true);
    jest.clearAllMocks();
    const actual = await run(fixture);
    expect(fetchFirestoreEventDetailsBatch).toHaveBeenCalledWith(['fb_public']);
    expect(actual.events).toEqual(expected.events);
    expect(actual.events[0]).toBe(privateEvent);
    expect(actual.events[1]).toBe(confirmed);
  });

  it.each(['fresh', 'cached', 'force'] as const)('preserves the %s request/cache path and both collections', async (path) => {
    const fixture: Fixture = { events: [event('fb_a')], allEvents: [event('fb_a'), event('fb_b')], ids: ['a'],
      raw: [{ id: 'a', fullDescription: 'Fresh details' }],
      ...(path !== 'fresh' ? { cached: [{ id: 'a', fullDescription: 'Cached details' }] } : {}), force: path === 'force' };
    const expected = await run(fixture, true);
    const actual = await run(fixture);
    expect(actual.events).toEqual(expected.events);
    expect(actual.allEvents).toEqual(expected.allEvents);
    expect(actual.events[0].description).toBe('Fresh details');
    if (path === 'cached') {
      expect(actual.qc?.fetchQuery.mock.calls).toEqual(expected.qc?.fetchQuery.mock.calls.map(([options]: any[]) => [expect.objectContaining({
        queryKey: options.queryKey, staleTime: options.staleTime, gcTime: options.gcTime, queryFn: expect.any(Function),
      })]));
    }
    if (path === 'force') expect(actual.qc?.setQueryData.mock.calls).toEqual(expected.qc?.setQueryData.mock.calls);
  });

  it('preserves null/blank, numeric, whitespace, and nested-prefix ID semantics', async () => {
    const fixture: Fixture = { events: [event(null as any), event(undefined as any), event(''), event('fb_'),
      event(0), event(' 0 '), event('fb_fb_a'), event('fb_a')], allEvents: [], ids: ['a'],
      raw: [null, { id: null }, { id: '' }, { id: 'fb_' }, { id: 0, title: 'Zero' },
        { id: 'fb_fb_a', title: 'Nested' }, { id: 'a', title: 'Single' }, { id: 'extra', type: 'special' }] };
    const expected = await run(fixture, true);
    const actual = await run(fixture);
    expect(actual.events).toEqual(expected.events);
    expect(actual.allEvents).toEqual(expected.allEvents);
  });

  it('preserves empty/invalid responses and does not request when all IDs are private', async () => {
    const collection = [event('a')];
    await run({ events: collection, allEvents: collection, ids: ['shared_private'], raw: [] });
    expect(fetchFirestoreEventDetailsBatch).not.toHaveBeenCalled();
    for (const raw of [[], [null, { id: null }, {}]]) {
      const actual = await run({ events: collection, allEvents: collection, ids: ['a'], raw });
      expect(actual.events).toBe(collection);
      expect(actual.allEvents).toBe(collection);
    }
  });

  it('matches complete baseline results for varied duplicate-heavy inputs', async () => {
    for (let seed = 0; seed < 40; seed++) {
      const fixture: Fixture = {
        events: Array.from({ length: 35 }, (_, i) => event(i % 3 ? `fb_${(i * 7 + seed) % 29}` : (i + seed) % 29,
          { type: i % 2 ? 'special' : 'event', title: `Original ${i}` })),
        allEvents: Array.from({ length: 50 }, (_, i) => event(` ${(i * 11 + seed) % 41} `)), ids: ['1'],
        raw: Array.from({ length: 18 }, (_, i) => ({ id: i % 2 ? `fb_${(i * 3 + seed) % 47}` : (i + seed) % 47,
          title: `Detail ${i}`, description: i % 2 ? '' : `Description ${i}`, ticketLink: i % 3 ? null : '',
          mediaUrls: [`poster-${i}`, `gallery-${seed}`], metadata: { originalEventId: `${seed}`, isRecurring: i % 2 === 0 } })),
      };
      const expected = await run(fixture, true);
      const actual = await run(fixture);
      expect(actual.events).toEqual(expected.events);
      expect(actual.allEvents).toEqual(expected.allEvents);
    }
  });

  it('keeps ID matching work bounded as the two collections grow', async () => {
    for (const size of [50, 100, 200]) {
      const rows = Array.from({ length: size }, (_, i) => event(`fb_${i}`));
      const raw = Array.from({ length: 10 }, (_, i) => ({ id: `${i}`, title: `Detail ${i}` }));
      mockComparisons = 0; mockIdKeys = 0;
      await run({ events: rows, allEvents: rows, raw, ids: ['0'] });
      // A generous linear bound, not a machine-dependent timing threshold.
      // The old nested searches exceed it even on these small inputs.
      expect(mockComparisons + mockIdKeys).toBeLessThanOrEqual(10 * (2 * size + raw.length));
    }
  });

  // Optional local performance experiment. No timing threshold is used as a
  // flaky CI assertion; complete output identity is always required.
  (process.env.GATHR_DETAIL_MERGE_REPORT ? it : it.skip)('measures the entire old and current detail operation on identical synthetic inputs', async () => {
    const results = [];
    for (const [size, detailCount] of [[500, 20], [1000, 100], [3000, 300]]) {
      const rows = Array.from({ length: size }, (_, i) => event(`fb_${i}`));
      const fixture: Fixture = { events: rows, allEvents: rows, ids: ['0'], raw: Array.from({ length: detailCount }, (_, i) => ({
        id: `${i * 3}`, title: `Full event ${i}`, fullDescription: `Complete description ${i}`, mediaUrls: [`poster-${i}`],
      })) };
      const measure = async (baseline: boolean) => {
        const samples = [];
        let output: Collections = { events: [], allEvents: [] };
        let comparisons = 0; let idKeys = 0;
        for (let repeat = 0; repeat < 6; repeat++) {
          mockComparisons = 0; mockIdKeys = 0;
          const start = performance.now();
          output = await run(fixture, baseline);
          const elapsed = performance.now() - start;
          if (repeat > 0) samples.push(elapsed);
          comparisons = mockComparisons; idKeys = mockIdKeys;
        }
        samples.sort((a, b) => a - b);
        return { medianMs: samples[2], samplesMs: samples, comparisons, idKeys, output };
      };
      const before = await measure(true);
      const after = await measure(false);
      expect(after.output.events).toEqual(before.output.events);
      expect(after.output.allEvents).toEqual(before.output.allEvents);
      const { output: beforeOutput, ...beforeMetrics } = before;
      const { output: afterOutput, ...afterMetrics } = after;
      results.push({ collectionRows: size, collections: 2, details: detailCount,
        before: beforeMetrics, after: afterMetrics, fullResultsEqual: true,
        outputSha256: createHash('sha256').update(JSON.stringify(afterOutput)).digest('hex') });
    }
    writeFileSync(process.env.GATHR_DETAIL_MERGE_REPORT!, JSON.stringify({
      baselineCommit: 'dfef992', baselineSourceSha256: createHash('sha256').update(baselineSource).digest('hex'),
      scope: 'Local Node/Jest, synthetic full detail operations; not phone latency, network or FPS', results,
    }, null, 2));
  }, 120_000);
});
