import type { Cluster, Event, Venue } from '../../types/events';
import type { FriendActivityProjection } from '../../types/social';
import {
  annotateClustersWithFriendPresence,
  formatCheckInVisibilityCopy,
  getRecognizedVenueId,
  getVenueFriendPresence,
  isFriendActivityActive,
} from '../friendPresence';

const event = (id: string, venueId: string): Event => ({
  id,
  type: 'event',
  category: 'Live Music',
  title: id,
  description: '',
  venueId,
  venue: venueId,
  address: '1 Test St',
  startDate: '2026-08-28',
  endDate: '2026-08-28',
  startTime: '18:00',
  endTime: '20:00',
  ticketPrice: '',
  profileUrl: '',
  imageUrl: '',
  SharedPostThumbnail: '',
  latitude: 46.23,
  longitude: -63.12,
  ticketLinkPosts: '',
  ticketLinkEvents: '',
});

const venue = (venueId: string): Venue => ({
  locationKey: `venue:${venueId}`,
  venue: `Venue ${venueId}`,
  address: '1 Test St',
  latitude: 46.23,
  longitude: -63.12,
  events: [event(`event-${venueId}`, venueId)],
});

const cluster = (id: string, venues: Venue[]): Cluster => ({
  id,
  clusterType: venues.length === 1 ? 'single' : 'multi',
  venues,
  timeStatus: 'today',
  interestLevel: 'medium',
  isBroadcasting: false,
  eventCount: venues.length,
  specialCount: 0,
  categories: ['Live Music'],
});

const activity = (
  ownerUid: string,
  venueId: string,
  expiresAt: number
): FriendActivityProjection => ({
  uid: ownerUid,
  ownerUid,
  displayName: ownerUid,
  photoURL: '',
  socialHandle: ownerUid,
  venueId,
  venueLocationKey: `venue:${venueId}`,
  venueName: `Venue ${venueId}`,
  message: '',
  createdAt: expiresAt - 60_000,
  expiresAt,
  revision: `${ownerUid}-${venueId}`,
});

describe('friend presence projection', () => {
  const now = new Date('2026-08-28T12:00:00Z').getTime();

  it('filters expired activity before annotating a cluster', () => {
    expect(isFriendActivityActive(activity('alice', 'one', now - 1), now)).toBe(false);
    const original = [cluster('one', [venue('one')])];
    expect(annotateClustersWithFriendPresence(original, [activity('alice', 'one', now - 1)], now)).toBe(original);
  });

  it('adds a derived count without changing event-interest attributes', () => {
    const original = cluster('one', [venue('one')]);
    const [annotated] = annotateClustersWithFriendPresence(
      [original],
      [activity('alice', 'one', now + 60_000), activity('bob', 'one', now + 60_000)],
      now
    );
    expect(annotated.interestLevel).toBe('medium');
    expect(annotated.friendPresence?.friendCount).toBe(2);
    expect(annotated.friendPresence?.displayCount).toBe('2');
  });

  it('keeps multi-venue presence attached to the exact venue key', () => {
    const [annotated] = annotateClustersWithFriendPresence(
      [cluster('multi', [venue('one'), venue('two')])],
      [activity('alice', 'two', now + 60_000)],
      now
    );
    expect(getVenueFriendPresence(annotated, annotated.venues[0])).toBeNull();
    expect(getVenueFriendPresence(annotated, annotated.venues[1])?.friends[0].ownerUid).toBe('alice');
  });

  it('recomputes correctly when zoom bands regroup venues', () => {
    const presence = [activity('alice', 'one', now + 60_000)];
    const [wide] = annotateClustersWithFriendPresence(
      [cluster('wide', [venue('one'), venue('two')])],
      presence,
      now
    );
    const [narrow] = annotateClustersWithFriendPresence([cluster('narrow', [venue('one')])], presence, now);
    expect(wide.friendPresence?.friendCount).toBe(1);
    expect(narrow.friendPresence?.friendCount).toBe(1);
    expect(narrow.friendPresence?.venues['venue:one'].friendCount).toBe(1);
  });

  it.each([0, 1, 10, 50, 200])('keeps cluster output bounded with %i friends', (count) => {
    const friends = Array.from({ length: count }, (_, index) => (
      activity(`friend-${String(index).padStart(3, '0')}`, 'one', now + 60_000)
    ));
    const original = cluster('one', [venue('one')]);
    const [annotated] = annotateClustersWithFriendPresence([original], friends, now);

    if (count === 0) {
      expect(annotated).toBe(original);
      return;
    }
    expect(annotated.friendPresence?.friendCount).toBe(count);
    expect(annotated.friendPresence?.displayCount).toBe(count > 3 ? '3+' : String(count));
    expect(annotated.friendPresence?.previewFriends).toHaveLength(Math.min(3, count));
  });

  it('accepts only stable recognized venue identity for check-in selection', () => {
    expect(getRecognizedVenueId(venue('one'))).toBe('one');
    expect(getRecognizedVenueId({ ...venue('one'), locationKey: 'area:charlottetown' })).toBeNull();
  });

  it('writes exact audience and expiry confirmation copy', () => {
    const copy = formatCheckInVisibilityCopy(1, now + 60_000);
    expect(copy).toContain('1 friend can see this check-in until');
    expect(formatCheckInVisibilityCopy(4, now + 60_000)).toContain('4 friends');
  });
});
