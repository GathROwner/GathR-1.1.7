import { buildExternalFriendPlaceGroups } from '../ExternalFriendCheckInMarkers';

jest.mock('@rnmapbox/maps', () => ({
  __esModule: true,
  default: { MarkerView: () => null },
}));

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));

describe('external friend check-in markers', () => {
  it('groups active external check-ins without turning them into event venues', () => {
    const now = Date.now();
    const groups = buildExternalFriendPlaceGroups([
      {
        ownerUid: 'friend-a',
        uid: 'friend-a',
        displayName: 'Jen B',
        photoURL: '',
        socialHandle: 'jen',
        locationType: 'external_place',
        venueLocationKey: 'external:abc',
        venueName: 'The Oak Downtown',
        placeAddress: '161 Kent St',
        placeCategory: 'Pub',
        latitude: 46.235,
        longitude: -63.129,
        message: 'At the bar',
        expiresAt: now + 60_000,
        revision: 'one',
      },
      {
        ownerUid: 'friend-b',
        uid: 'friend-b',
        displayName: 'Emma Brooks',
        photoURL: '',
        socialHandle: 'emma',
        locationType: 'external_place',
        venueLocationKey: 'external:abc',
        venueName: 'The Oak Downtown',
        placeAddress: '161 Kent St',
        placeCategory: 'Pub',
        latitude: 46.235,
        longitude: -63.129,
        message: '',
        expiresAt: now + 60_000,
        revision: 'two',
      },
      {
        ownerUid: 'friend-c',
        uid: 'friend-c',
        displayName: 'Expired',
        photoURL: '',
        socialHandle: 'expired',
        locationType: 'external_place',
        venueLocationKey: 'external:old',
        venueName: 'Old Place',
        placeAddress: '1 Old St',
        placeCategory: 'Place',
        latitude: 46.2,
        longitude: -63.1,
        message: '',
        expiresAt: now - 1,
        revision: 'old',
      },
    ], now);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual(expect.objectContaining({
      locationKey: 'external:abc',
      locationType: 'external_place',
      locationPrecision: 'exact',
      venueName: 'The Oak Downtown',
      address: '161 Kent St',
      category: 'Pub',
      latitude: 46.235,
      longitude: -63.129,
    }));
    expect(groups[0].friends.map((friend) => friend.displayName)).toEqual(['Emma Brooks', 'Jen B']);
  });

  it('keeps a private approximate projection distinct and address-free', () => {
    const now = Date.now();
    const groups = buildExternalFriendPlaceGroups([{
      ownerUid: 'friend-a',
      uid: 'friend-a',
      displayName: 'Craig Burgoyne',
      photoURL: '',
      socialHandle: 'craig',
      locationType: 'private_place',
      locationPrecision: 'approximate',
      venueLocationKey: 'private:abc',
      venueName: 'Home',
      placeCategory: 'Private location',
      latitude: 46.25,
      longitude: -63.14,
      message: 'Watching the game',
      expiresAt: now + 60_000,
      revision: 'private-one',
    }], now);

    expect(groups).toEqual([expect.objectContaining({
      locationKey: 'private:abc',
      locationType: 'private_place',
      locationPrecision: 'approximate',
      venueName: 'Home',
      address: '',
      category: 'Private location',
    })]);
  });
});
