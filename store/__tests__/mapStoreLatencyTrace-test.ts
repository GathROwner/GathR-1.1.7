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
jest.mock('supercluster', () => ({
  __esModule: true,
  default: class SuperclusterMock {
    private points: unknown[] = [];

    load(points: unknown[]) {
      this.points = points;
      return this;
    }

    getClusters() {
      return this.points;
    }

    getLeaves() {
      return this.points;
    }
  },
}));

import type { Event } from '../../types/events';
import { DEFAULT_FILTER_CRITERIA } from '../../types/filter';
import { createLegacyTimingContract } from '../../utils/eventTiming';
import type { MapScheduleStateCaller } from '../../utils/mapTrace';

process.env.EXPO_PUBLIC_MAP_LATENCY_TRACE = '1';
process.env.EXPO_PUBLIC_MAP_LATENCY_VARIANT = 'baseline';

const trace = require('../../utils/mapTrace') as typeof import('../../utils/mapTrace');
const { useMapStore } = require('../mapStore') as typeof import('../mapStore');

const makeFutureEvent = (id: string, type: 'event' | 'special'): Event => {
  const schedule = {
    startDate: '2026-09-07',
    startTime: '7:00 PM',
    endDate: '2026-09-07',
    endTime: '9:00 PM',
  };

  return {
    id,
    type,
    category: type === 'event' ? 'Live Music' : 'Happy Hour',
    title: `${type} ${id}`,
    description: '',
    venue: `${type} venue`,
    address: `${id} Main Street`,
    latitude: type === 'event' ? 46.23 : 46.24,
    longitude: type === 'event' ? -63.12 : -63.13,
    usersResponded: '0',
    ...schedule,
    timing: createLegacyTimingContract(schedule, { endStatus: 'observed' }),
  } as Event;
};

describe('map store latency caller attribution', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 6, 12, 0, 0));
    trace.clearMapTrace();
    useMapStore.setState({
      allEvents: [],
      events: [],
      viewportEvents: [],
      outsideViewportEvents: [],
      onScreenEvents: [],
      filteredEvents: [],
      clusters: [],
      zoomLevel: 12,
      filterCriteria: DEFAULT_FILTER_CRITERIA,
      isLoading: false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('evaluates each event once and reuses the result across clustering and pill counts', () => {
    const event = makeFutureEvent('event-one', 'event');
    const special = makeFutureEvent('special-one', 'special');
    const gestureSessionId = trace.beginMapTraceGestureSession('store_test');

    useMapStore.setState({
      events: [event, special],
      viewportEvents: [event, special],
      onScreenEvents: [event, special],
      filteredEvents: [event, special],
    });

    useMapStore.getState().generateClusters(12);
    useMapStore.getState().getTimeFilterCounts('event');
    useMapStore.getState().getCategoryFilterCounts('event');
    useMapStore.getState().getTimeFilterCounts('special');
    useMapStore.getState().getCategoryFilterCounts('special');

    const evaluationCounts = [
      'default_map_eligibility',
      'cluster_now_today',
      'events_pill_counts',
      'specials_pill_counts',
    ].map((caller) => trace.getMapScheduleStateMetricSnapshot(
      caller as MapScheduleStateCaller,
      gestureSessionId
    ).count);

    expect(evaluationCounts).toEqual([2, 0, 0, 0]);
    expect(evaluationCounts.reduce((total, count) => total + count, 0)).toBe(2);

    const clusterCommit = trace.getMapTraceState().entries.find((entry) =>
      entry.label === 'cluster_store_committed'
    );
    expect(clusterCommit?.details).toMatchObject({
      filteredEvents: 2,
      mapRenderableEvents: 2,
      clusters: 2,
      defaultMapEligibilityCalls: 2,
      clusterNowTodayCalls: 0,
    });
  });

  it('measures the version-2 expiry check and emits complete map-filtering totals', () => {
    const event = makeFutureEvent('filter-one', 'event');
    const gestureSessionId = trace.beginMapTraceGestureSession('filter_test');

    useMapStore.getState().setEvents([event]);

    expect(trace.getMapScheduleStateMetricSnapshot('map_filtering', gestureSessionId).count).toBe(1);
    const filteringEntry = trace.getMapTraceState().entries.find((entry) =>
      entry.label === 'map_filtering_completed'
    );
    expect(filteringEntry).toMatchObject({
      gestureSessionId,
      details: {
        inputEvents: 1,
        outputEvents: 0,
        scheduleCalls: 1,
        eventTimeFilter: 'today',
        specialTimeFilter: 'today',
      },
    });
    expect(Number(filteringEntry?.details?.scheduleCumulativeDurationMs)).toBeGreaterThanOrEqual(0);
  });
});
