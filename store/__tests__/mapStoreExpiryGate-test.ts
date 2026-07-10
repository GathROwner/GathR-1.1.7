/**
 * Verifies the store-level expiry gates: setAllEvents (covers cold-start
 * hydration from the persisted cache), doesEventMatchTypeFilters (covers
 * tabs/map/clusters under every time filter), pruneExpiredEvents (the
 * 60s ticker), and engine parity between dateUtils and the fast path.
 */

jest.mock('../../config/firebaseConfig', () => ({
  auth: {},
  firestore: {},
  app: {},
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
}));
jest.mock('expo-location', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
// supercluster ships untransformed ESM; pruneExpiredEvents triggers
// generateClusters, so the stub must behave like an (empty) index.
jest.mock('supercluster', () => ({
  __esModule: true,
  default: class SuperclusterMock {
    load() {
      return this;
    }
    getClusters() {
      return [];
    }
    getLeaves() {
      return [];
    }
  },
}));

import {
  createEventTimeContext,
  doesEventMatchTypeFilters,
  getEventTimeStatusFast,
  useMapStore,
} from '../mapStore';
import { getEventTimeStatus } from '../../utils/dateUtils';
import { TimeFilterType, TypeFilterCriteria } from '../../types/filter';
import type { Cluster, Event, Venue } from '../../types/events';

let nextId = 0;
const makeEvent = (overrides: Partial<Event>): Event =>
  ({
    id: `evt-${nextId++}`,
    type: 'event',
    category: 'Live Music',
    title: `Event ${nextId}`,
    description: '',
    venue: 'Some Venue',
    address: '123 Main St',
    startDate: '2026-07-11',
    endDate: '2026-07-11',
    startTime: '7:00 PM',
    endTime: '10:00 PM',
    latitude: 46.23,
    longitude: -63.12,
    usersResponded: '0',
    ...overrides,
  } as Event);

const typeFilters = (timeFilter: TimeFilterType): TypeFilterCriteria => ({
  timeFilter,
  category: undefined,
  search: undefined,
  savedOnly: false,
});

// Freeze "now" at 2026-07-10 15:00 local for every test.
const NOW = new Date(2026, 6, 10, 15, 0, 0);

const endedYesterday = () =>
  makeEvent({ startDate: '2026-07-09', endDate: '2026-07-09', endTime: '11:00 PM' });
const endedEarlierToday = () =>
  makeEvent({
    startDate: '2026-07-10',
    endDate: '2026-07-10',
    startTime: '9:00 AM',
    endTime: '11:00 AM',
  });
const liveTonight = () =>
  makeEvent({ startDate: '2026-07-10', endDate: '2026-07-10', endTime: '11:00 PM' });
const nextWeek = () =>
  makeEvent({ startDate: '2026-07-15', endDate: '2026-07-15' });

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('setAllEvents expiry gate (cold-start / persisted-cache path)', () => {
  it('drops ended events (yesterday and earlier today) and keeps live ones', () => {
    const stale = endedYesterday();
    const morning = endedEarlierToday();
    const live = liveTonight();
    const future = nextWeek();

    useMapStore.getState().setAllEvents([stale, morning, live, future]);

    const ids = useMapStore.getState().allEvents.map((e) => e.id);
    expect(ids).toEqual([live.id, future.id]);
  });
});

describe('doesEventMatchTypeFilters past gate', () => {
  it.each([
    TimeFilterType.ALL,
    TimeFilterType.NOW,
    TimeFilterType.TODAY,
    TimeFilterType.TOMORROW,
    TimeFilterType.UPCOMING,
  ])('excludes an event that ended yesterday under %s', (timeFilter) => {
    const context = createEventTimeContext(NOW);
    expect(doesEventMatchTypeFilters(endedYesterday(), typeFilters(timeFilter), context)).toBe(
      false
    );
  });

  it('excludes an event that ended earlier today under TODAY and ALL', () => {
    const context = createEventTimeContext(NOW);
    const event = endedEarlierToday();
    expect(doesEventMatchTypeFilters(event, typeFilters(TimeFilterType.TODAY), context)).toBe(
      false
    );
    expect(doesEventMatchTypeFilters(event, typeFilters(TimeFilterType.ALL), context)).toBe(false);
  });

  it('still matches a live today event under TODAY', () => {
    const context = createEventTimeContext(NOW);
    expect(doesEventMatchTypeFilters(liveTonight(), typeFilters(TimeFilterType.TODAY), context)).toBe(
      true
    );
  });

  it('UPCOMING matches future events but not past ones', () => {
    const context = createEventTimeContext(NOW);
    expect(doesEventMatchTypeFilters(nextWeek(), typeFilters(TimeFilterType.UPCOMING), context)).toBe(
      true
    );
    expect(
      doesEventMatchTypeFilters(endedYesterday(), typeFilters(TimeFilterType.UPCOMING), context)
    ).toBe(false);
  });
});

describe('pruneExpiredEvents ticker action', () => {
  it('removes expired events from every event array', () => {
    const stale = endedYesterday();
    const live = liveTonight();

    useMapStore.setState({
      allEvents: [stale, live],
      events: [stale, live],
      viewportEvents: [stale, live],
      outsideViewportEvents: [stale],
      onScreenEvents: [stale, live],
      filteredEvents: [live],
    });

    useMapStore.getState().pruneExpiredEvents();

    const state = useMapStore.getState();
    expect(state.allEvents.map((e) => e.id)).toEqual([live.id]);
    expect(state.events.map((e) => e.id)).toEqual([live.id]);
    expect(state.viewportEvents.map((e) => e.id)).toEqual([live.id]);
    expect(state.outsideViewportEvents).toEqual([]);
    expect(state.onScreenEvents.map((e) => e.id)).toEqual([live.id]);
    expect(state.filteredEvents.map((e) => e.id)).toEqual([live.id]);
  });

  it('keeps array identities (no re-render) when nothing expired', () => {
    const live = liveTonight();
    const future = nextWeek();
    const arrays = {
      allEvents: [live, future],
      events: [live],
      viewportEvents: [live],
      outsideViewportEvents: [future],
      onScreenEvents: [live],
      filteredEvents: [live],
    };
    useMapStore.setState(arrays);

    useMapStore.getState().pruneExpiredEvents();

    const state = useMapStore.getState();
    expect(state.allEvents).toBe(arrays.allEvents);
    expect(state.viewportEvents).toBe(arrays.viewportEvents);
    expect(state.filteredEvents).toBe(arrays.filteredEvents);
  });

  it('removes expired events from selected callout and lightbox state', () => {
    const stale = endedYesterday();
    const live = liveTonight();
    const venue: Venue = {
      locationKey: 'venue-1',
      venue: 'Some Venue',
      address: '123 Main St',
      latitude: 46.23,
      longitude: -63.12,
      events: [stale, live],
    };
    const cluster: Cluster = {
      id: 'cluster-1',
      clusterType: 'single',
      venues: [venue],
      timeStatus: 'today',
      interestLevel: 'medium',
      isBroadcasting: false,
      eventCount: 2,
      specialCount: 0,
      categories: ['Live Music'],
      containsCityLevelEvent: false,
    };

    useMapStore.setState({
      selectedVenue: venue,
      selectedVenues: [venue],
      selectedCluster: cluster,
      selectedImageData: {
        imageUrl: stale.imageUrl,
        event: stale,
        venue,
        cluster,
        events: [stale, live],
        currentIndex: 0,
      },
    });

    useMapStore.getState().pruneExpiredEvents();

    const state = useMapStore.getState();
    expect(state.selectedVenue?.events.map((event) => event.id)).toEqual([live.id]);
    expect(state.selectedVenues[0]?.events.map((event) => event.id)).toEqual([live.id]);
    expect(state.selectedCluster?.venues[0]?.events.map((event) => event.id)).toEqual([live.id]);
    expect(state.selectedCluster?.eventCount).toBe(1);
    expect(state.selectedImageData).toBeNull();
  });
});

describe('engine parity: getEventTimeStatus (dateUtils) vs getEventTimeStatusFast (mapStore)', () => {
  const fixtures: Array<[string, Event]> = [
    ['ended yesterday', endedYesterday()],
    ['ended earlier today', endedEarlierToday()],
    ['live later today', liveTonight()],
    ['future next week', nextWeek()],
    [
      // Real backend format: times carry seconds ("2:00:00 PM").
      'happening right now',
      makeEvent({
        startDate: '2026-07-10',
        endDate: '2026-07-10',
        startTime: '2:00:00 PM',
        endTime: '5:00:00 PM',
      }),
    ],
    [
      // Seconds-less 12h times parse correctly too now that parseDateTime
      // isValid-checks each format (see utils/__tests__/dateUtils-test.ts).
      'happening right now (seconds-less times)',
      makeEvent({
        startDate: '2026-07-10',
        endDate: '2026-07-10',
        startTime: '2:00 PM',
        endTime: '5:00 PM',
      }),
    ],
    [
      'multi-day spanning today',
      makeEvent({
        startDate: '2026-07-08',
        endDate: '2026-07-12',
        startTime: '10:00:00 AM',
        endTime: '5:00:00 PM',
      }),
    ],
  ];

  it.each(fixtures)('agrees on %s', (_label, event) => {
    const context = createEventTimeContext(NOW);
    expect(getEventTimeStatusFast(event, context)).toBe(getEventTimeStatus(event));
  });

  it.each(fixtures)('agrees on past-vs-live for %s regardless of time format', (_label, event) => {
    const context = createEventTimeContext(NOW);
    const fastIsPast = getEventTimeStatusFast(event, context) === 'past';
    const slowIsPast = getEventTimeStatus(event) === 'past';
    expect(fastIsPast).toBe(slowIsPast);
  });
});
