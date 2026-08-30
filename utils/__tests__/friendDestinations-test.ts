import type { Cluster, Event, Venue } from '../../types/events';
import { TimeFilterType, type FilterCriteria } from '../../types/filter';
import type { FriendActivityProjection } from '../../types/social';
import {
  buildFriendDestinations,
  formatFriendDestinationTime,
  formatFriendsHere,
} from '../friendDestinations';

const now = new Date(2026, 7, 30, 18, 0, 0).getTime();

const criteria = (overrides: Partial<FilterCriteria> = {}): FilterCriteria => ({
  showEvents: true,
  showSpecials: true,
  eventFilters: { timeFilter: TimeFilterType.NOW, savedOnly: false },
  specialFilters: { timeFilter: TimeFilterType.NOW, savedOnly: false },
  ...overrides,
});

const event = (id: string, venueId: string, startsInMinutes: number): Event => {
  const start = new Date(now + startsInMinutes * 60_000);
  const end = new Date(start.getTime() + 2 * 60 * 60_000);
  const date = (value: Date) => [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-');
  const time = (value: Date) => `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  return {
    id,
    type: 'event',
    category: 'Gatherings',
    title: id,
    description: '',
    venueId,
    venue: `Venue ${venueId}`,
    address: '1 Test Street',
    startDate: date(start),
    endDate: date(end),
    startTime: time(start),
    endTime: time(end),
    ticketPrice: '',
    profileUrl: '',
    imageUrl: '',
    SharedPostThumbnail: '',
    latitude: 46.23,
    longitude: -63.12,
    ticketLinkPosts: '',
    ticketLinkEvents: '',
  };
};

const activity = (uid: string, venueId: string): FriendActivityProjection => ({
  uid,
  ownerUid: uid,
  displayName: uid,
  photoURL: '',
  socialHandle: uid,
  venueId,
  venueLocationKey: `venue:${venueId}`,
  venueName: `Venue ${venueId}`,
  message: '',
  createdAt: now - 60_000,
  expiresAt: now + 60 * 60_000,
  revision: `${uid}-${venueId}`,
});

const cluster = (item: Event): Cluster => {
  const venue: Venue = {
    locationKey: `venue:${item.venueId}`,
    venue: item.venue,
    address: item.address,
    latitude: item.latitude,
    longitude: item.longitude,
    events: [item],
  };
  return {
    id: `cluster:${item.venueId}`,
    clusterType: 'single',
    venues: [venue],
    timeStatus: 'today',
    interestLevel: 'medium',
    isBroadcasting: false,
    eventCount: 1,
    specialCount: 0,
    categories: [item.category],
  };
};

describe('friend destination carousel model', () => {
  it('includes an active check-in linked to an event starting in 45 minutes despite a Now filter', () => {
    const upcoming = event('Starts in 45 minutes', 'one', 45);
    const result = buildFriendDestinations({
      activities: [activity('Jen B', 'one')],
      onScreenEvents: [upcoming],
      clusters: [cluster(upcoming)],
      filterCriteria: criteria(),
      nowMs: now,
    });
    expect(result).toHaveLength(1);
    expect(result[0].event?.id).toBe(upcoming.id);
    expect(formatFriendDestinationTime(result[0].event, now)).toBe('Starts in 45 min');
  });

  it('groups multiple friends into one destination card', () => {
    const upcoming = event('Party', 'one', 45);
    const result = buildFriendDestinations({
      activities: [activity('Jen B', 'one'), activity('Mike S', 'one')],
      onScreenEvents: [upcoming],
      clusters: [cluster(upcoming)],
      filterCriteria: criteria(),
      nowMs: now,
    });
    expect(result).toHaveLength(1);
    expect(result[0].friendCount).toBe(2);
    expect(formatFriendsHere(result[0].friends)).toBe('Jen & Mike are here');
  });

  it('does not infer attendance when multiple current or soon events share a venue', () => {
    const first = event('First', 'one', 30);
    const second = event('Second', 'one', 45);
    const result = buildFriendDestinations({
      activities: [activity('Jen B', 'one')],
      onScreenEvents: [first, second],
      clusters: [cluster(first)],
      filterCriteria: criteria(),
      nowMs: now,
    });
    expect(result[0].event).toBeNull();
    expect(result[0].kind).toBe('venue');
  });

  it('respects category filters while continuing to ignore time filters', () => {
    const upcoming = event('Party', 'one', 45);
    const result = buildFriendDestinations({
      activities: [activity('Jen B', 'one')],
      onScreenEvents: [upcoming],
      clusters: [cluster(upcoming)],
      filterCriteria: criteria({
        eventFilters: {
          timeFilter: TimeFilterType.NOW,
          category: 'Live Music',
          savedOnly: false,
        },
      }),
      nowMs: now,
    });
    expect(result).toEqual([]);
  });

  it('respects the event type visibility filter', () => {
    const upcoming = event('Party', 'one', 45);
    expect(buildFriendDestinations({
      activities: [activity('Jen B', 'one')],
      onScreenEvents: [upcoming],
      clusters: [cluster(upcoming)],
      filterCriteria: criteria({ showEvents: false, showSpecials: true }),
      nowMs: now,
    })).toEqual([]);
  });

  it('uses the on-screen event set as the screen-boundary gate', () => {
    const offScreen = event('Off screen', 'one', 45);
    const result = buildFriendDestinations({
      activities: [activity('Jen B', 'one')],
      onScreenEvents: [],
      clusters: [cluster(offScreen)],
      filterCriteria: criteria(),
      nowMs: now,
    });
    expect(result).toEqual([]);
  });

  it('only includes a private event when it is authorized and backed by a friend check-in', () => {
    const invitation = {
      ...event('Private party', 'one', 30),
      source: 'friend_event' as const,
      friendEvent: {
        eventId: 'party',
        hostUid: 'host',
        hostName: 'Host',
        viewerRole: 'guest' as const,
        ownRsvp: 'invited' as const,
        visibility: 'selected_friends' as const,
        addressRevealed: true,
      },
    };
    expect(buildFriendDestinations({
      activities: [],
      onScreenEvents: [invitation],
      clusters: [cluster(invitation)],
      filterCriteria: criteria(),
      nowMs: now,
    })).toEqual([]);
    expect(buildFriendDestinations({
      activities: [activity('Jen B', 'one')],
      onScreenEvents: [invitation],
      clusters: [cluster(invitation)],
      filterCriteria: criteria(),
      nowMs: now,
    })[0].kind).toBe('private_invitation');
  });

  it('truncates the friend-name summary after the first three people', () => {
    expect(formatFriendsHere([
      activity('Jen B', 'one'),
      activity('Mike S', 'one'),
      activity('Sarah P', 'one'),
      activity('Alex T', 'one'),
      activity('Taylor R', 'one'),
    ])).toBe('Jen, Mike, Sarah +2');
  });
});
