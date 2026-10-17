jest.mock('../../services/socialService', () => ({
  subscribeToSocialData: jest.fn(() => jest.fn()),
}));

jest.mock('../../types/social', () => ({
  ...jest.requireActual('../../types/social'),
  SOCIAL_FEATURE_ENABLED: true,
  SOCIAL_RELEASE_TWO_ENABLED: true,
}));

const mockSetFriendEvents = jest.fn();
jest.mock('../mapStore', () => ({
  useMapStore: {
    getState: () => ({ setFriendEvents: mockSetFriendEvents }),
  },
}));

import {
  filterAuthoritativeFriendActivity,
  pruneExpiredSocialData,
  startSocialListeners,
  stopSocialListeners,
  useSocialStore,
} from '../socialStore';

const mockedSubscribeToSocialData = jest.requireMock('../../services/socialService').subscribeToSocialData as jest.MockedFunction<
  typeof import('../../services/socialService').subscribeToSocialData
>;

describe('social store privacy lifecycle', () => {
  afterEach(() => {
    stopSocialListeners();
    mockedSubscribeToSocialData.mockClear();
  });

  it('removes expired friend activity and own check-in immediately', () => {
    const now = Date.now();
    useSocialStore.setState({
      uid: 'viewer',
      activity: [{
        uid: 'friend',
        ownerUid: 'friend',
        displayName: 'Friend',
        photoURL: '',
        socialHandle: 'friend',
        venueId: 'venue-1',
        venueLocationKey: 'venue:venue-1',
        venueName: 'Venue',
        message: '',
        createdAt: now - 1000,
        expiresAt: now - 1,
        revision: 'old',
      }],
      ownCheckIn: {
        ownerUid: 'viewer',
        venueId: 'venue-1',
        venueLocationKey: 'venue:venue-1',
        venueNameSnapshot: 'Venue',
        audienceMode: 'all_friends',
        selectedUids: [],
        viewerUids: ['friend'],
        viewerCount: 1,
        message: '',
        durationMinutes: 30,
        createdAt: now - 1000,
        expiresAt: now - 1,
        revision: 'old-own',
      },
    });

    pruneExpiredSocialData(now);
    expect(useSocialStore.getState().activity).toEqual([]);
    expect(useSocialStore.getState().ownCheckIn).toBeNull();
  });

  it('clears every user-scoped value on logout', () => {
    useSocialStore.setState({
      uid: 'viewer',
      error: 'old error',
      loading: true,
      friendEvents: [{ eventId: 'private-event' } as never],
      friendEventLocations: [{ eventId: 'private-event', address: 'private' } as never],
    });
    stopSocialListeners();
    expect(useSocialStore.getState().uid).toBeNull();
    expect(useSocialStore.getState().error).toBeNull();
    expect(useSocialStore.getState().friends).toEqual([]);
    expect(useSocialStore.getState().friendEvents).toEqual([]);
    expect(useSocialStore.getState().friendEventLocations).toEqual([]);
    expect(mockSetFriendEvents).toHaveBeenLastCalledWith([]);
  });

  it('fails closed for cached friend activity until the server confirms access', () => {
    const now = Date.now();
    const activity = [{
      uid: 'friend',
      ownerUid: 'friend',
      displayName: 'Friend',
      photoURL: '',
      socialHandle: 'friend',
      venueId: 'venue-1',
      venueLocationKey: 'venue:venue-1',
      venueName: 'Venue',
      message: '',
      createdAt: now - 1000,
      expiresAt: now + 60_000,
      revision: 'current',
    }];

    expect(filterAuthoritativeFriendActivity(activity, true)).toEqual([]);
    expect(filterAuthoritativeFriendActivity(activity, false)).toEqual(activity);
  });

  it('does not block friend requests when an unrelated event listener fails', () => {
    startSocialListeners('viewer');
    const callbacks = mockedSubscribeToSocialData.mock.calls[0][1];

    callbacks.onError('friendEvents', { message: 'Event access unavailable.' } as never);
    callbacks.onRequests([{
      uid: 'sender',
      direction: 'incoming',
      displayName: 'Sender',
    } as never], false);
    callbacks.onFriends([], false);
    callbacks.onBlocks([], false);

    expect(useSocialStore.getState().relationshipLoading).toBe(false);
    expect(useSocialStore.getState().relationshipFromCache).toBe(false);
    expect(useSocialStore.getState().relationshipError).toBeNull();
    expect(useSocialStore.getState().requests).toHaveLength(1);
    expect(useSocialStore.getState().error).toBe('Event access unavailable.');

    callbacks.onActivity([], false);
    expect(useSocialStore.getState().error).toBe('Event access unavailable.');
  });

  it('stops the relationship spinner and surfaces a relationship listener failure', () => {
    startSocialListeners('viewer');
    const callbacks = mockedSubscribeToSocialData.mock.calls[0][1];

    callbacks.onError('requests', { message: 'Could not load requests.' } as never);

    expect(useSocialStore.getState().relationshipLoading).toBe(false);
    expect(useSocialStore.getState().relationshipError).toBe('Could not load requests.');
  });
});
