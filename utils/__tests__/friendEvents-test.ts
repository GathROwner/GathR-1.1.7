import type { FriendEventLocationProjection, FriendEventProjection } from '../../types/social';
import {
  friendEventToMapEvent,
  hasExactFriendEventCoordinates,
  isFriendEventCurrent,
} from '../friendEvents';

function projection(overrides: Partial<FriendEventProjection> = {}): FriendEventProjection {
  const now = Date.now();
  return {
    eventId: 'event-1',
    hostUid: 'host',
    host: { uid: 'host', displayName: 'Host Friend', photoURL: '', socialHandle: 'host' },
    viewerUid: 'viewer',
    viewerRole: 'guest',
    title: 'Private party',
    description: 'Details',
    category: 'Gatherings & Parties',
    startAt: now + 60_000,
    endAt: now + 3_600_000,
    status: 'published',
    visibility: 'selected_friends',
    guestInviteMode: 'host_only',
    guestListVisible: true,
    coverImageUrl: '',
    externalUrl: '',
    locationType: 'custom_address',
    locationLabel: 'Craig’s place',
    locationAddress: '',
    addressRevealed: false,
    venueId: '',
    latitude: null,
    longitude: null,
    approximateLatitude: 46.24,
    approximateLongitude: -63.13,
    onlineUrl: '',
    viewerCount: 1,
    responseCounts: { going: 1, maybe: 0, cant_go: 0 },
    guests: [],
    ownRsvp: 'invited',
    cancellationReason: '',
    updateHistory: [],
    revision: 'revision-1',
    ...overrides,
  };
}

describe('friend event map normalization', () => {
  it('uses an authorized approximate point while the exact home address is hidden', () => {
    const event = friendEventToMapEvent(projection(), null);
    expect(event).toMatchObject({
      source: 'friend_event',
      latitude: 46.24,
      longitude: -63.13,
      address: 'Address shared later',
      locationPrecision: 'approximate',
    });
  });

  it('uses the exact location projection after reveal without exposing it beforehand', () => {
    const exact: FriendEventLocationProjection = {
      eventId: 'event-1',
      hostUid: 'host',
      address: '12 Example Lane',
      placeName: 'Craig’s place',
      latitude: 46.2382,
      longitude: -63.1311,
    };
    expect(friendEventToMapEvent(projection({ addressRevealed: true }), exact)).toMatchObject({
      address: '12 Example Lane',
      latitude: 46.2382,
      longitude: -63.1311,
      locationPrecision: 'exact',
    });
  });

  it('never treats approximate map coordinates as permission for exact-location actions', () => {
    expect(hasExactFriendEventCoordinates(projection(), null)).toBe(false);
    expect(hasExactFriendEventCoordinates(
      projection(),
      {
        eventId: 'event-1',
        hostUid: 'host',
        address: '12 Example Lane',
        placeName: 'Craig’s place',
        latitude: 46.2382,
        longitude: -63.1311,
      }
    )).toBe(true);
    expect(hasExactFriendEventCoordinates(
      projection({ latitude: 46.2382, longitude: -63.1311 }),
      null
    )).toBe(true);
  });

  it('never maps canceled, ended, online, or TBD events without physical coordinates', () => {
    expect(friendEventToMapEvent(projection({ status: 'canceled' }), null)).toBeNull();
    expect(friendEventToMapEvent(projection({ status: 'ended' }), null)).toBeNull();
    expect(friendEventToMapEvent(projection({ locationType: 'online', approximateLatitude: null, approximateLongitude: null }), null)).toBeNull();
    expect(friendEventToMapEvent(projection({ locationType: 'tbd', approximateLatitude: null, approximateLongitude: null }), null)).toBeNull();
  });

  it('treats an event as current only while its authorized projection is active', () => {
    expect(isFriendEventCurrent(projection(), Date.now())).toBe(true);
    expect(isFriendEventCurrent(projection({ status: 'ended' }), Date.now())).toBe(false);
    expect(isFriendEventCurrent(projection({ endAt: Date.now() - 1 }), Date.now())).toBe(false);
  });
});
