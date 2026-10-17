import type { FriendEventProjection } from '../../types/social';
import {
  deriveProfileRelationship,
  selectSharedFriendEvents,
} from '../socialProfileVisibility';

function event(overrides: Partial<FriendEventProjection> = {}): FriendEventProjection {
  const now = Date.now();
  return {
    eventId: 'event-1',
    hostUid: 'host',
    host: { uid: 'host', displayName: 'Host', photoURL: '', socialHandle: 'host' },
    viewerUid: 'viewer',
    viewerRole: 'guest',
    title: 'Private plan',
    description: '',
    category: 'Social',
    startAt: now + 60_000,
    endAt: now + 3_600_000,
    status: 'published',
    visibility: 'all_friends',
    guestInviteMode: 'host_only',
    guestListVisible: true,
    coverImageUrl: '',
    externalUrl: '',
    locationType: 'tbd',
    locationLabel: 'Shared later',
    locationAddress: '',
    addressRevealed: false,
    venueId: '',
    latitude: null,
    longitude: null,
    approximateLatitude: null,
    approximateLongitude: null,
    onlineUrl: '',
    viewerCount: 2,
    responseCounts: { going: 0, maybe: 0, cant_go: 0 },
    guests: [],
    ownRsvp: 'invited',
    cancellationReason: '',
    updateHistory: [],
    revision: 'v1',
    ...overrides,
  };
}

describe('social profile visibility', () => {
  it('derives relationship access from authoritative projections', () => {
    const base = {
      profileUid: 'person',
      currentUid: 'viewer',
      friends: [],
      requests: [],
      blocks: [],
    };

    expect(deriveProfileRelationship(base)).toBe('public');
    expect(deriveProfileRelationship({
      ...base,
      requests: [{ uid: 'person', direction: 'incoming' } as never],
    })).toBe('incoming');
    expect(deriveProfileRelationship({
      ...base,
      friends: [{ uid: 'person' } as never],
    })).toBe('friend');
    expect(deriveProfileRelationship({
      ...base,
      friends: [{ uid: 'person' } as never],
      blocks: [{ blockedUid: 'person' } as never],
    })).toBe('blocked');
  });

  it('shows an upcoming event hosted by the friend', () => {
    expect(selectSharedFriendEvents('friend', [event({ hostUid: 'friend' })]))
      .toHaveLength(1);
  });

  it('does not infer shared attendance from a hidden guest list', () => {
    const hiddenGuest = event({
      guestListVisible: false,
      guests: [{ uid: 'friend' } as never],
    });
    expect(selectSharedFriendEvents('friend', [hiddenGuest])).toEqual([]);
  });

  it('lets the event host use their authorized guest list', () => {
    const hostProjection = event({
      viewerRole: 'host',
      guestListVisible: false,
      guests: [{ uid: 'friend' } as never],
    });
    expect(selectSharedFriendEvents('friend', [hostProjection])).toHaveLength(1);
  });

  it('omits ended events and sorts upcoming shared plans by start time', () => {
    const now = Date.now();
    const later = event({ eventId: 'later', hostUid: 'friend', startAt: now + 20_000, endAt: now + 30_000 });
    const sooner = event({ eventId: 'sooner', hostUid: 'friend', startAt: now + 10_000, endAt: now + 30_000 });
    const ended = event({ eventId: 'ended', hostUid: 'friend', endAt: now - 1 });

    expect(selectSharedFriendEvents('friend', [later, ended, sooner], now).map((item) => item.eventId))
      .toEqual(['sooner', 'later']);
  });
});
