import type { Event } from '../../types/events';
import { DEFAULT_FILTER_CRITERIA, TimeFilterType, type FilterCriteria } from '../../types/filter';
import { createLegacyTimingContract, getEventScheduleStartLocalScalar } from '../eventTiming';
import { doesEventMatchInterestCarouselActiveCategory } from '../interestCarouselFilterUtils';
import { getInterestCarouselEvents } from '../interestCarouselOrder';
import { CITY_EVENTS_CATEGORY } from '../locationScope';

const makeEvent = (id: string, overrides: Partial<Event> = {}): Event => ({
  id, type: 'event', category: 'Gatherings & Parties', title: id, description: '',
  venue: 'Test Venue', address: '', startDate: '2026-09-28', endDate: '2026-09-28',
  startTime: '10:00', endTime: '18:00', ticketPrice: '', profileUrl: '', imageUrl: '',
  SharedPostThumbnail: '', latitude: 46.25, longitude: -63.13,
  ticketLinkPosts: '', ticketLinkEvents: '', ...overrides,
});

const criteria = (timeFilter = TimeFilterType.UPCOMING): FilterCriteria => ({
  ...DEFAULT_FILTER_CRITERIA,
  eventFilters: { timeFilter, category: 'Gatherings & Parties', categoryFilterSource: 'interest-pills' },
  specialFilters: { timeFilter: TimeFilterType.UPCOMING, category: 'Food Special' },
});
const ids = (events: Event[]) => events.map((event) => event.id);

describe('interest carousel Upcoming ordering', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-24T15:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('puts Sep 25 before Sep 28 after interest filtering, independent of fetch order', () => {
    const later = makeEvent('sep28');
    const earlier = makeEvent('sep25', { startDate: '2026-09-25', endDate: '2026-09-25' });
    const unrelated = makeEvent('music', { category: 'Live Music', startDate: '2026-09-26' });
    const source = [later, unrelated, earlier];
    // This was the complete pre-fix carousel projection: filter preserves fetch order.
    expect(ids(source.filter((event) => doesEventMatchInterestCarouselActiveCategory(event, criteria()))))
      .toEqual(['sep28', 'sep25']);
    expect(ids(getInterestCarouselEvents(source, criteria()))).toEqual(['sep25', 'sep28']);
    expect(ids(source)).toEqual(['sep28', 'music', 'sep25']);
  });

  it('orders actual clock values within a day, including noon, AM/PM, and seconds', () => {
    const events = [
      makeEvent('evening', { startTime: '7:00 PM', endTime: '11:00 PM' }),
      makeEvent('afternoon', { startTime: '13:30:00' }),
      makeEvent('noon', { startTime: 'noon' }),
      makeEvent('morning', { startTime: '9:30 AM' }),
    ];
    expect(ids(getInterestCarouselEvents(events, criteria())))
      .toEqual(['morning', 'noon', 'afternoon', 'evening']);
  });

  it('uses the resolved v2 occurrence instead of stale legacy dates or recurrence end', () => {
    const recurring = makeEvent('recurring', {
      isRecurring: true, recurrenceUntilDate: '2026-12-31',
      timing: createLegacyTimingContract({
        startDate: '2026-09-25', startTime: 'noon', endDate: '2026-09-25', endTime: '14:00',
      }),
    });
    const single = makeEvent('single', { startDate: '2026-09-26', endDate: '2026-09-26' });
    expect(ids(getInterestCarouselEvents([single, recurring], criteria()))).toEqual(['recurring', 'single']);
  });

  it('resolves instant-only starts through the existing event timezone semantics', () => {
    const timing = createLegacyTimingContract({ startDate: '', startTime: '', endDate: '', endTime: '' });
    timing.schedule.start = { status: 'observed', at: '2026-09-25T01:00:00Z', timeZone: 'America/Halifax' };
    const instantOnly = makeEvent('instant', { startDate: '', startTime: '', timing });
    const local = makeEvent('local', { startDate: '2026-09-24', startTime: '10:00 PM' });
    expect(getEventScheduleStartLocalScalar(instantOnly)).toBe(getEventScheduleStartLocalScalar(local));
  });

  it('uses identity to keep ties stable across reversed fetch order and venue changes', () => {
    const events = [makeEvent('c'), makeEvent('a'), makeEvent('b')];
    expect(ids(getInterestCarouselEvents(events, criteria()))).toEqual(['a', 'b', 'c']);
    expect(ids(getInterestCarouselEvents([...events].reverse().map((event) => ({ ...event, venue: 'Other Venue' })), criteria())))
      .toEqual(['a', 'b', 'c']);
  });

  it('keeps the existing date-only start fallback for unknown times and all-day dates', () => {
    const unknownTime = makeEvent('date-only', { startTime: '', endTime: '' });
    const allDay = makeEvent('all-day', {
      startDate: '2026-09-25', endDate: '2026-09-25', startTime: '', endTime: '',
    });
    allDay.timing = createLegacyTimingContract(allDay, { scheduleKind: 'all_day', endStatus: 'all_day' });
    expect(ids(getInterestCarouselEvents([makeEvent('timed'), unknownTime, allDay], criteria())))
      .toEqual(['all-day', 'date-only', 'timed']);
  });

  it('does not make unresolved dates qualify when existing filters exclude them', () => {
    const unknown = makeEvent('unknown', { startDate: '', endDate: '', startTime: '', endTime: '' });
    expect(Number.isNaN(getEventScheduleStartLocalScalar(unknown))).toBe(true);
    expect(doesEventMatchInterestCarouselActiveCategory(unknown, criteria())).toBe(false);
    expect(ids(getInterestCarouselEvents([unknown, makeEvent('known')], criteria()))).toEqual(['known']);
  });

  it('retains time, category, search, visibility, and ended-event membership', () => {
    const events = [
      makeEvent('later'),
      makeEvent('wrong-category', { category: 'Live Music' }),
      makeEvent('ended', { startDate: '2026-09-20', endDate: '2026-09-20' }),
      makeEvent('today', { startDate: '2026-09-24', endDate: '2026-09-24' }),
      makeEvent('earlier', { startDate: '2026-09-25', endDate: '2026-09-25' }),
    ];
    const filters = criteria();
    const selected = events.filter((event) => doesEventMatchInterestCarouselActiveCategory(event, filters));
    expect(ids(selected)).toEqual(['later', 'earlier']);
    expect(new Set(getInterestCarouselEvents(events, filters))).toEqual(new Set(selected));
    expect(getInterestCarouselEvents(events, { ...filters, showEvents: false })).toEqual([]);
    expect(ids(getInterestCarouselEvents(events, {
      ...filters, eventFilters: { ...filters.eventFilters, search: 'later' },
    }))).toEqual(['later']);
  });

  it.each([TimeFilterType.NOW, TimeFilterType.TODAY, TimeFilterType.TOMORROW, TimeFilterType.ALL])(
    'preserves the original filtered order for %s', (timeFilter) => {
      const date = timeFilter === TimeFilterType.TOMORROW ? '2026-09-25' : '2026-09-24';
      const events = [
        makeEvent('later', { startDate: date, endDate: date, startTime: '11:00' }),
        makeEvent('earlier', { startDate: date, endDate: date, startTime: '10:00' }),
      ];
      const filters = criteria(timeFilter);
      expect(ids(getInterestCarouselEvents(events, filters))).toEqual(['later', 'earlier']);
    }
  );

  it.each(['Family Friendly', CITY_EVENTS_CATEGORY])('retains Special slots in a mixed %s carousel', (category) => {
    const events = [makeEvent('late'), makeEvent('special', { type: 'special', category: 'Food Special' }),
      makeEvent('early', { startDate: '2026-09-25', endDate: '2026-09-25' })]
      .map((event) => ({ ...event, familyFriendlyScore: 90, locationScope: 'city' as const }));
    const filters = criteria();
    filters.eventFilters.category = category;
    filters.specialFilters.category = category;
    expect(ids(getInterestCarouselEvents(events, filters))).toEqual(['early', 'special', 'late']);
    const specialsOnly = getInterestCarouselEvents(events, { ...filters, showEvents: false });
    expect(specialsOnly).toEqual([events[1]]);
  });

  it('never reorders Specials, even when their own time filter is Upcoming', () => {
    const events = [makeEvent('late-special', { type: 'special', category: 'Food Special' }),
      makeEvent('early-special', { type: 'special', category: 'Food Special', startDate: '2026-09-25' })];
    expect(getInterestCarouselEvents(events, criteria())).toEqual(events);
  });
});
