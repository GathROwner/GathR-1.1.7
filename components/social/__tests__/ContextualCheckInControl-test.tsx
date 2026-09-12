import React from 'react';
import { Image, Modal, StyleSheet } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import ContextualCheckInControl, {
  buildNearbyCheckInRoute,
  closestNearbyPlaceId,
  VenueAvatar,
  type VenueCandidate,
} from '../ContextualCheckInControl';

const mockPush = jest.fn();

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'check-in-test-user' } }),
}));

jest.mock('../../../store', () => ({
  useMapStore: (selector: (state: { allEvents: never[] }) => unknown) => selector({ allEvents: [] }),
}));

jest.mock('../../../store/socialStore', () => ({
  useSocialStore: (selector: (state: { ownCheckIn: null }) => unknown) => selector({ ownCheckIn: null }),
}));

jest.mock('../../../types/social', () => ({
  SOCIAL_FEATURE_ENABLED: true,
  SOCIAL_RELEASE_TWO_ENABLED: true,
}));

jest.mock('../../../services/socialService', () => ({
  createPrivateCheckInPlaceCandidate: jest.fn(),
  discoverNearbyCheckInPlaces: jest.fn().mockResolvedValue({ candidates: [] }),
  recordCheckInEligibilitySample: jest.fn(),
  SocialServiceError: class SocialServiceError extends Error {},
}));

describe('ContextualCheckInControl', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockPush.mockClear();
  });

  it('keeps check-in discoverable before a nearby venue becomes eligible', () => {
    let component: renderer.ReactTestRenderer;

    act(() => {
      component = renderer.create(<ContextualCheckInControl enabled />);
    });

    const idleControl = component!.root.findByProps({ testID: 'contextual-check-in-idle' });
    expect(StyleSheet.flatten(idleControl.props.style)).toEqual(expect.objectContaining({
      bottom: 34,
      right: 10,
      width: 36,
      height: 36,
      borderRadius: 18,
    }));

    act(() => idleControl.props.onPress());

    expect(component!.root.findByType(Modal).props.visible).toBe(true);
    expect(component!.root.findByProps({ testID: 'private-place-entry' })).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    act(() => component!.unmount());
  });

  it('stays hidden while a map callout owns the interaction surface', () => {
    let component: renderer.ReactTestRenderer;

    act(() => {
      component = renderer.create(<ContextualCheckInControl enabled={false} />);
    });

    expect(component!.toJSON()).toBeNull();
    act(() => component!.unmount());
  });

  it('uses the detected venue avatar and preserves every server-approved nearby option', () => {
    const hunters: VenueCandidate = {
      id: 'venue:hunters',
      type: 'gathr_venue',
      venueId: 'hunters',
      venueName: "Hunter's Ale House",
      address: '185 Kent St',
      latitude: 46.235,
      longitude: -63.129,
      category: 'GathR venue',
      distanceMetres: 8,
      imageUrl: 'https://example.com/hunters.jpg',
    };
    const cityCinema: VenueCandidate = {
      id: 'venue:city-cinema',
      type: 'gathr_venue',
      venueId: 'city-cinema',
      venueName: 'City Cinema',
      address: '64 King St',
      latitude: 46.2351,
      longitude: -63.129,
      category: 'GathR venue',
      distanceMetres: 22,
      imageUrl: 'https://example.com/city-cinema.jpg',
    };
    let avatar: renderer.ReactTestRenderer;
    act(() => {
      avatar = renderer.create(<VenueAvatar venue={hunters} />);
    });

    expect(avatar!.root.findByType(Image).props.source).toEqual({ uri: 'https://example.com/hunters.jpg' });
    expect(buildNearbyCheckInRoute(hunters, 'dwell-session', [hunters, cityCinema])).toEqual({
      pathname: '/check-in',
      params: {
        venueId: 'hunters',
        eligibilitySessionId: 'dwell-session',
        eligibleVenueIds: 'hunters,city-cinema',
      },
    });
    act(() => avatar!.unmount());
  });

  it('passes only the opaque external candidate and display snapshot to check-in', () => {
    const oak: VenueCandidate = {
      id: 'opaque-candidate',
      type: 'external_place',
      placeCandidateId: 'opaque-candidate',
      venueName: 'The Oak Downtown',
      address: '161 Kent St',
      category: 'Pub',
      latitude: 46.235,
      longitude: -63.129,
      distanceMetres: 12,
      imageUrl: '',
    };

    expect(buildNearbyCheckInRoute(oak, 'dwell-session', [oak])).toEqual({
      pathname: '/check-in',
      params: {
        placeCandidateId: 'opaque-candidate',
        placeType: 'external_place',
        placeName: 'The Oak Downtown',
        placeAddress: '161 Kent St',
        placeCategory: 'Pub',
        eligibilitySessionId: 'dwell-session',
      },
    });
  });

  it('routes a private candidate without an address snapshot', () => {
    const home: VenueCandidate = {
      id: 'opaque-private-candidate',
      type: 'private_place',
      placeCandidateId: 'opaque-private-candidate',
      venueName: 'Home',
      address: '',
      category: 'Private location',
      latitude: 46.25,
      longitude: -63.14,
      distanceMetres: 0,
      imageUrl: '',
    };

    expect(buildNearbyCheckInRoute(home, 'private-dwell', [home])).toEqual({
      pathname: '/check-in',
      params: {
        placeCandidateId: 'opaque-private-candidate',
        placeType: 'private_place',
        placeName: 'Home',
        placeCategory: 'Private location',
        eligibilitySessionId: 'private-dwell',
      },
    });
  });

  it('defaults the picker to the closest result instead of a stale detected venue', () => {
    const hopYard = {
      id: 'venue:hopyard',
      type: 'gathr_venue',
      venueId: 'hopyard',
      venueName: 'HopYard',
      address: '151 Kent St',
      category: 'GathR venue',
      latitude: 46.236,
      longitude: -63.128,
      distanceMetres: 24,
      imageUrl: '',
    } satisfies VenueCandidate;
    const oak = {
      id: 'opaque-oak-candidate',
      type: 'external_place',
      placeCandidateId: 'opaque-oak-candidate',
      venueName: 'The Oak Downtown',
      address: '156 Great George Street',
      category: 'bar',
      latitude: 46.2364,
      longitude: -63.1276,
      distanceMetres: 0,
      imageUrl: '',
    } satisfies VenueCandidate;

    expect(closestNearbyPlaceId([hopYard, oak])).toBe(oak.id);
  });
});
