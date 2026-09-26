import { useMapStore, createEventTimeContext, doesEventMatchTypeFilters } from '../mapStore';
import type { Event } from '../../types/events';
import { DEFAULT_FILTER_CRITERIA, TimeFilterType, type UpcomingDateFilter } from '../../types/filter';
import { countUpcomingDateEvents } from '../../utils/mapEventFilters';
import { getInterestCarouselEvents } from '../../utils/interestCarouselOrder';
import { doesEventMatchInterestCarouselBaseFilters } from '../../utils/interestCarouselFilterUtils';
import { createLegacyTimingContract } from '../../utils/eventTiming';
import { getEventFilterReset } from '../../components/map/eventFilterPanelModel';

jest.mock('../../config/firebaseConfig', () => ({ auth: {}, firestore: {}, app: {} }));
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), getDocs: jest.fn(), query: jest.fn(), where: jest.fn() }));
jest.mock('expo-location', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('supercluster', () => ({
  __esModule: true,
  default: class {
    points: unknown[] = [];
    load(points: unknown[]) { this.points = points; return this; }
    getClusters() { return this.points; }
    getLeaves() { return this.points; }
  },
}));

const makeEvent = (id: string, date: string, overrides: Partial<Event> = {}): Event => {
  const value = { id, type: 'event', title: `Concert ${id}`, description: '', category: 'Live Music',
    venue: 'Shared venue', address: '123 Main Street', latitude: 46.23, longitude: -63.12,
    startDate: date, endDate: date, startTime: '19:00', endTime: '23:00', ...overrides } as Event;
  return { ...value, timing: createLegacyTimingContract(value) };
};
const ids = (events: Event[]) => events.map(event => event.id);
const custom: UpcomingDateFilter = { kind: 'custom', startDate: '2026-09-28', endDate: '2026-09-30' };

describe('one Upcoming filtering contract', () => {
  let events: Event[];
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 25, 12));
    events = [
      makeEvent('wed', '2026-09-30'), makeEvent('today', '2026-09-25'),
      makeEvent('sat', '2026-09-26'), makeEvent('oct', '2026-10-05'),
      makeEvent('span', '2026-09-27', { endDate: '2026-09-29' }),
      makeEvent('mon', '2026-09-28'), makeEvent('comedy', '2026-09-28', { category: 'Comedy', title: 'Jokes' }),
    ];
    useMapStore.setState({ allEvents: events, events, onScreenEvents: events, filteredEvents: [], clusters: [],
      viewportEvents: events, outsideViewportEvents: [], selectedVenues: [], selectedVenue: null,
      selectedCluster: null, selectedImageData: null, zoomLevel: 14,
      filterCriteria: { ...DEFAULT_FILTER_CRITERIA, showSpecials: false,
        eventFilters: { timeFilter: TimeFilterType.UPCOMING, category: 'Live Music', categoryFilterSource: 'interest-pills' } },
    });
  });
  afterEach(() => jest.useRealTimers());

  it('agrees across map, counts, side-pill facets, carousel and cluster/callout contents', () => {
    useMapStore.getState().setTypeFilters('event', { upcomingDate: custom });
    const state = useMapStore.getState();
    expect(ids(state.filteredEvents)).toEqual(['wed', 'span', 'mon']);
    expect(ids(getInterestCarouselEvents(events, state.filterCriteria))).toEqual(['span', 'mon', 'wed']);
    expect(state.getTimeFilterCounts('event').upcoming).toBe(3);
    expect(state.getCategoryFilterCounts('event')).toMatchObject({ 'Live Music': 3, Comedy: 1 });
    expect(state.filterCriteria.eventFilters.categoryFilterSource).toBe('interest-pills');
    const clusterEvents = state.clusters.flatMap(cluster => cluster.venues.flatMap(venue => venue.events));
    expect(new Set(ids(clusterEvents))).toEqual(new Set(['wed', 'span', 'mon']));
    expect(clusterEvents).not.toContain(events.find(event => event.id === 'oct'));
    expect(ids(events.filter(event => doesEventMatchInterestCarouselBaseFilters(event, state.filterCriteria))))
      .toEqual(['wed', 'span', 'mon', 'comedy']);
  });

  it('computes date choices and pending custom counts from category and search while retaining total data', () => {
    const criteria = useMapStore.getState().filterCriteria;
    expect(countUpcomingDateEvents(events, criteria, { kind: 'any' })).toBe(5);
    expect(countUpcomingDateEvents(events, criteria, { kind: 'weekend' })).toBe(2);
    expect(countUpcomingDateEvents(events, criteria, { kind: 'next7' })).toBe(4);
    expect(countUpcomingDateEvents(events, criteria, custom)).toBe(3);
    useMapStore.getState().setTypeFilters('event', { upcomingDate: custom, search: 'mon' });
    const state = useMapStore.getState();
    expect(countUpcomingDateEvents(events, state.filterCriteria, custom)).toBe(1);
    expect(state.getTimeFilterCounts('event').upcoming).toBe(1);
    expect(ids(state.filteredEvents)).toEqual(['mon']);
    expect(ids(getInterestCarouselEvents(events, state.filterCriteria))).toEqual(['mon']);
    expect(state.onScreenEvents).toHaveLength(7);
    expect(countUpcomingDateEvents(events, { ...criteria, search: 'Jokes' }, custom)).toBe(0);
    expect(countUpcomingDateEvents(events, { ...criteria, showEvents: false }, custom)).toBe(0);
  });

  it('closes an existing callout snapshot when applying a different date window', () => {
    useMapStore.getState().setTypeFilters('event', { upcomingDate: { kind: 'any' } });
    const cluster = useMapStore.getState().clusters[0];
    useMapStore.setState({ selectedCluster: cluster, selectedVenues: cluster.venues, selectedVenue: cluster.venues[0] });
    useMapStore.getState().setTypeFilters('event', { upcomingDate: custom });
    expect(useMapStore.getState().selectedCluster).toBeNull();
    expect(useMapStore.getState().selectedVenues).toEqual([]);
  });

  it('resets the panel to Today and clears the category source and custom dates', () => {
    useMapStore.getState().setTypeFilters('event', { upcomingDate: custom });
    useMapStore.getState().setTypeFilters('event', getEventFilterReset(), 'filter-pills');
    const filters = useMapStore.getState().filterCriteria.eventFilters;
    expect(filters).toMatchObject({ timeFilter: TimeFilterType.TODAY });
    expect(filters.category).toBeUndefined();
    expect(filters.categoryFilterSource).toBeUndefined();
    expect(filters.upcomingDate).toBeUndefined();
    expect(ids(useMapStore.getState().filteredEvents)).toEqual(['today']);
  });

  it.each([TimeFilterType.NOW, TimeFilterType.TODAY, TimeFilterType.TOMORROW, TimeFilterType.ALL])(
    'clears the refinement when leaving Upcoming for %s and retains standard matching', timeFilter => {
      useMapStore.getState().setTypeFilters('event', { upcomingDate: custom });
      useMapStore.getState().setTypeFilters('event', { timeFilter });
      const state = useMapStore.getState();
      expect(state.filterCriteria.eventFilters.upcomingDate).toBeUndefined();
      const context = createEventTimeContext();
      expect(ids(state.filteredEvents)).toEqual(ids(events.filter(event => doesEventMatchTypeFilters(event,
        { timeFilter, category: 'Live Music' }, context))));
      useMapStore.getState().setTypeFilters('event', { timeFilter: TimeFilterType.UPCOMING });
      expect(useMapStore.getState().filterCriteria.eventFilters.upcomingDate).toEqual({ kind: 'any' });
    }
  );

  it('keeps Upcoming as an intersection, excluding today and an already-active multi-day event', () => {
    const activeSpan = makeEvent('active', '2026-09-24', { endDate: '2026-09-29' });
    expect(countUpcomingDateEvents([activeSpan, ...events], useMapStore.getState().filterCriteria, { kind: 'next7' })).toBe(4);
    jest.setSystemTime(new Date(2026, 8, 27, 12));
    expect(countUpcomingDateEvents([makeEvent('oct3', '2026-10-03'), ...events],
      useMapStore.getState().filterCriteria, { kind: 'weekend' })).toBe(1);
  });

  it('normalizes an expired custom date at midnight and updates all projections', () => {
    useMapStore.getState().setTypeFilters('event', { upcomingDate: { kind: 'custom', startDate: '2026-09-26', endDate: '2026-09-26' } });
    expect(ids(useMapStore.getState().filteredEvents)).toEqual(['sat']);
    jest.setSystemTime(new Date(2026, 8, 26, 12));
    useMapStore.getState().pruneExpiredEvents();
    const state = useMapStore.getState();
    expect(state.filterCriteria.eventFilters.upcomingDate).toEqual({ kind: 'any' });
    expect(ids(state.filteredEvents)).toEqual(['wed', 'oct', 'span', 'mon']);
    expect(ids(getInterestCarouselEvents(state.onScreenEvents, state.filterCriteria))).toEqual(['span', 'mon', 'wed', 'oct']);
  });

  it('re-evaluates rolling windows on the next local day even if no event expires', () => {
    const nextWeek = makeEvent('next', '2026-10-03');
    useMapStore.setState({ events: [nextWeek], onScreenEvents: [nextWeek], allEvents: [nextWeek] });
    useMapStore.getState().setTypeFilters('event', { upcomingDate: { kind: 'next7' } });
    expect(useMapStore.getState().filteredEvents).toHaveLength(0);
    jest.setSystemTime(new Date(2026, 8, 26, 0, 1));
    useMapStore.getState().pruneExpiredEvents();
    expect(ids(useMapStore.getState().filteredEvents)).toEqual(['next']);
  });

  it('ignores an event-only date refinement on Specials', () => {
    const special = makeEvent('special', '2026-10-05', { type: 'special' });
    expect(doesEventMatchTypeFilters(special, { timeFilter: TimeFilterType.UPCOMING, upcomingDate: custom })).toBe(true);
  });
});
