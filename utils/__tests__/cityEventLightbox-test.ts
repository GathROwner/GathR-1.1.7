import { buildCityEventLightboxEvents } from '../cityEventLightboxEvents';
import { TimeFilterType, type FilterCriteria } from '../../types/filter';
import type { Event } from '../../types/events';

const criteria = (overrides: Partial<FilterCriteria> = {}): FilterCriteria => {
  const base: FilterCriteria = {
    showEvents: true,
    showSpecials: true,
    eventFilters: {
      timeFilter: TimeFilterType.ALL,
      category: undefined,
      search: undefined,
      savedOnly: false,
    },
    specialFilters: {
      timeFilter: TimeFilterType.ALL,
      category: undefined,
      search: undefined,
      savedOnly: false,
    },
    search: undefined,
    type: undefined,
  };

  return {
    ...base,
    ...overrides,
    eventFilters: {
      ...base.eventFilters,
      ...(overrides.eventFilters ?? {}),
    },
    specialFilters: {
      ...base.specialFilters,
      ...(overrides.specialFilters ?? {}),
    },
  };
};

const makeEvent = (overrides: Partial<Event>): Event =>
  ({
    id: overrides.id ?? 'evt-1',
    type: 'event',
    category: 'Community',
    title: 'City Event',
    description: '',
    venue: 'Charlottetown, PEI',
    address: 'Charlottetown, PEI',
    startDate: '2026-09-13',
    endDate: '2026-09-13',
    startTime: '7:00 PM',
    endTime: '10:00 PM',
    ticketPrice: '',
    profileUrl: '',
    imageUrl: '',
    SharedPostThumbnail: '',
    latitude: 46.23,
    longitude: -63.12,
    ticketLinkPosts: '',
    ticketLinkEvents: '',
    ...overrides,
  } as Event);

describe('buildCityEventLightboxEvents', () => {
  it('keeps only city-level events that match the active base filters', () => {
    const cityEvent = makeEvent({
      id: 'city-1',
      locationScope: 'city',
      locationLabel: 'Charlottetown, PEI',
    });
    const venueEvent = makeEvent({
      id: 'venue-1',
      locationScope: 'venue',
      venue: 'Specific Venue',
    });
    const hiddenSpecial = makeEvent({
      id: 'special-1',
      type: 'special',
      locationScope: 'city',
      locationLabel: 'Charlottetown, PEI',
    });

    const events = buildCityEventLightboxEvents({
      onScreenEvents: [cityEvent, venueEvent, hiddenSpecial],
      filterCriteria: criteria({ showSpecials: false }),
    });

    expect(events).toEqual([cityEvent]);
  });

  it('dedupes repeated city events by id before opening the lightbox carousel', () => {
    const cityEvent = makeEvent({
      id: 'city-1',
      locationScope: 'area',
      locationLabel: 'Downtown Charlottetown',
    });

    const events = buildCityEventLightboxEvents({
      onScreenEvents: [cityEvent, cityEvent],
      filterCriteria: criteria(),
    });

    expect(events).toEqual([cityEvent]);
  });
});
