import type { Cluster, Event, Venue } from '../../types/events';
import {
  doesEventMatchInterestCarouselFilter,
  filterClusterForInterestCarouselFilter,
} from '../interestCarouselFilterUtils';

const makeEvent = (overrides: Partial<Event>): Event => ({
  id: 'event-1',
  type: 'event',
  category: 'Gatherings & Parties',
  title: 'Family event',
  description: '',
  venue: 'Test Venue',
  address: '',
  startDate: '2099-08-09',
  endDate: '2099-08-09',
  startTime: '10:00',
  endTime: '18:00',
  ticketPrice: '',
  profileUrl: '',
  imageUrl: '',
  SharedPostThumbnail: '',
  latitude: 46.25,
  longitude: -63.13,
  ticketLinkPosts: '',
  ticketLinkEvents: '',
  ...overrides,
});

const familyEvent = makeEvent({ id: 'family-event', familyFriendlyScore: 85 });
const familySpecial = makeEvent({
  id: 'family-special',
  type: 'special',
  category: 'Food Special',
  familyFriendlyScore: 70,
});
const oysterHappyHour = makeEvent({
  id: 'oyster-happy-hour',
  type: 'special',
  category: 'Happy Hour',
  title: 'Oyster Happy Hour',
  venue: 'Landmark Oyster House',
  familyFriendlyScore: 15,
});

const venue = (locationKey: string, events: Event[]): Venue => ({
  locationKey,
  venue: events[0].venue,
  address: '',
  latitude: events[0].latitude,
  longitude: events[0].longitude,
  events,
});

const cluster: Cluster = {
  id: 'charlottetown-cluster',
  clusterType: 'multi',
  venues: [
    venue('family-venue', [familyEvent, oysterHappyHour]),
    venue('family-special-venue', [familySpecial]),
  ],
  timeStatus: 'future',
  interestLevel: 'medium',
  isBroadcasting: false,
  eventCount: 1,
  specialCount: 2,
  categories: ['Gatherings & Parties', 'Food Special', 'Happy Hour'],
};

const familyFilter = {
  status: 'active' as const,
  type: 'event' as const,
  category: 'Family Friendly',
};

describe('Family Friendly side-interest filtering', () => {
  it('matches qualifying records across event and special types', () => {
    expect(doesEventMatchInterestCarouselFilter(familyEvent, familyFilter)).toBe(true);
    expect(doesEventMatchInterestCarouselFilter(familySpecial, familyFilter)).toBe(true);
    expect(doesEventMatchInterestCarouselFilter(oysterHappyHour, familyFilter)).toBe(false);
  });

  it('removes unrelated records from a mixed cluster before the callout opens', () => {
    const filtered = filterClusterForInterestCarouselFilter(cluster, familyFilter);

    expect(filtered).not.toBeNull();
    expect(filtered?.venues.flatMap((item) => item.events.map((event) => event.id))).toEqual([
      'family-event',
      'family-special',
    ]);
    expect(filtered?.eventCount).toBe(1);
    expect(filtered?.specialCount).toBe(1);
    expect(filtered?.categories).toEqual(['Gatherings & Parties', 'Food Special']);
  });

  it('keeps ordinary interests type-specific', () => {
    const eventFilter = {
      status: 'active' as const,
      type: 'event' as const,
      category: 'Food Special',
    };
    expect(doesEventMatchInterestCarouselFilter(familySpecial, eventFilter)).toBe(false);
  });
});
