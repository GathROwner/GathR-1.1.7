import React from 'react';
import { Alert, Image, StyleSheet } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import ContextualCheckInControl, {
  buildNearbyCheckInRoute,
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
  recordCheckInEligibilitySample: jest.fn(),
}));

describe('ContextualCheckInControl', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockPush.mockClear();
  });

  it('keeps check-in discoverable before a nearby venue becomes eligible', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
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

    expect(alert).toHaveBeenCalledWith(
      'Check in when you arrive',
      expect.stringContaining('about 90 seconds')
    );
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
      venueId: 'hunters',
      venueName: "Hunter's Ale House",
      address: '185 Kent St',
      latitude: 46.235,
      longitude: -63.129,
      imageUrl: 'https://example.com/hunters.jpg',
    };
    const cityCinema: VenueCandidate = {
      venueId: 'city-cinema',
      venueName: 'City Cinema',
      address: '64 King St',
      latitude: 46.2351,
      longitude: -63.129,
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
});
