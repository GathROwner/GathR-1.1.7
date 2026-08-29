jest.mock('../../services/socialService', () => ({
  subscribeToSocialData: jest.fn(() => jest.fn()),
}));

import {
  filterAuthoritativeFriendActivity,
  pruneExpiredSocialData,
  stopSocialListeners,
  useSocialStore,
} from '../socialStore';

describe('social store privacy lifecycle', () => {
  afterEach(() => stopSocialListeners());

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
    useSocialStore.setState({ uid: 'viewer', error: 'old error', loading: true });
    stopSocialListeners();
    expect(useSocialStore.getState().uid).toBeNull();
    expect(useSocialStore.getState().error).toBeNull();
    expect(useSocialStore.getState().friends).toEqual([]);
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
});
