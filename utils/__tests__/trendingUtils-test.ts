import { buildTrendingEvents, TRENDING_TARGET_COUNT } from '../trendingUtils';
import { CITY_EVENTS_CATEGORY } from '../locationScope';
import { TimeFilterType, type FilterCriteria } from '../../types/filter';
import type { Event } from '../../types/events';

const criteria = (overrides: Partial<FilterCriteria> = {}): FilterCriteria => ({
  showEvents: true,
  showSpecials: true,
  eventFilters: {
    timeFilter: TimeFilterType.ALL,
    category: undefined,
    search: undefined,
    savedOnly: false,
    ...(overrides.eventFilters ?? {}),
  },
  specialFilters: {
    timeFilter: TimeFilterType.ALL,
    category: undefined,
    search: undefined,
    savedOnly: false,
    ...(overrides.specialFilters ?? {}),
  },
  search: undefined,
  type: undefined,
});

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
    startDate: '2026-09-13',
    endDate: '2026-09-13',
    startTime: '7:00 PM',
    endTime: '10:00 PM',
    latitude: 46.23,
    longitude: -63.12,
    usersResponded: '0',
    ...overrides,
  } as Event);

const cityEvent = (overrides: Partial<Event> = {}): Event =>
  makeEvent({
    title: 'Farm Day in the City',
    category: 'Community',
    venue: 'Charlottetown, PEI',
    locationScope: 'city',
    locationLabel: 'Charlottetown, PEI',
    locationCity: 'Charlottetown',
    ...overrides,
  });

const highEngagementEvents = (count: number): Event[] =>
  Array.from({ length: count }, (_, i) =>
    makeEvent({ title: `Hot Event ${i}`, usersResponded: String(500 - i) })
  );

describe('buildTrendingEvents city-level slot', () => {
  it('includes a low-engagement city event even when trending is full', () => {
    const events = [...highEngagementEvents(TRENDING_TARGET_COUNT + 5), cityEvent()];
    const trending = buildTrendingEvents({
      onScreenEvents: events,
      filterCriteria: criteria(),
      userInterests: [],
    });
    expect(trending.some((event) => event.locationScope === 'city')).toBe(true);
  });

  it('reserves only one slot for city events', () => {
    const events = [
      ...highEngagementEvents(TRENDING_TARGET_COUNT + 5),
      cityEvent({ usersResponded: '2' }),
      cityEvent({ title: 'Street Feast', usersResponded: '1' }),
    ];
    const trending = buildTrendingEvents({
      onScreenEvents: events,
      filterCriteria: criteria(),
      userInterests: [],
    });
    const cityCount = trending.filter((event) => event.locationScope === 'city').length;
    expect(cityCount).toBe(1);
  });

  it('is unchanged when no city events are on screen', () => {
    const events = highEngagementEvents(5);
    const trending = buildTrendingEvents({
      onScreenEvents: events,
      filterCriteria: criteria(),
      userInterests: [],
    });
    expect(trending).toHaveLength(5);
    expect(trending.every((event) => !event.locationScope)).toBe(true);
  });

  it('excludes events that have already ended', () => {
    const endedEvent = makeEvent({
      title: 'Yesterday Jam',
      startDate: '2000-01-01',
      endDate: '2000-01-01',
      usersResponded: '999',
    });
    const events = [...highEngagementEvents(3), endedEvent];
    const trending = buildTrendingEvents({
      onScreenEvents: events,
      filterCriteria: criteria(),
      userInterests: [],
    });
    expect(trending).toHaveLength(3);
    expect(trending.every((event) => event.title !== 'Yesterday Jam')).toBe(true);
  });

  it('respects the active city filter sentinel (only city events remain)', () => {
    const events = [...highEngagementEvents(4), cityEvent()];
    const trending = buildTrendingEvents({
      onScreenEvents: events,
      filterCriteria: criteria({
        eventFilters: {
          timeFilter: TimeFilterType.ALL,
          category: CITY_EVENTS_CATEGORY,
          search: undefined,
          savedOnly: false,
        },
      }),
      userInterests: [],
    });
    expect(trending).toHaveLength(1);
    expect(trending[0].locationScope).toBe('city');
  });
});
