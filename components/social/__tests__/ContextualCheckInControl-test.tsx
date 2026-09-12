import React from 'react';
import { Image, Modal, StyleSheet } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import * as Location from 'expo-location';
import { createPrivateCheckInPlaceCandidate, bindCheckInReadiness, discoverNearbyCheckInPlaces } from '../../../services/socialService';
import { resetCheckInReadinessOwner, useCheckInReadinessStore } from '../../../store/checkInReadinessStore';
import { advanceReadiness, emptyReadiness } from '../../../utils/checkInReadiness';

import ContextualCheckInControl, {
  buildNearbyCheckInRoute,
  closestNearbyPlaceId,
  VenueAvatar,
  type VenueCandidate,
} from '../ContextualCheckInControl';

const mockPush = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn().mockResolvedValue(undefined) }));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  getForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
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
  bindCheckInReadiness: jest.fn(),
  createSocialOperationId: jest.fn(() => 'operation-test-id'),
  SocialServiceError: class SocialServiceError extends Error {},
}));

describe('ContextualCheckInControl', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(2_000_000_100_000);
    resetCheckInReadinessOwner('check-in-test-user');
    useCheckInReadinessStore.setState({ preferencesLoaded: true, appActive: true, foregroundGranted: true });
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      timestamp: Date.now(), coords: { latitude: 46.235, longitude: -63.129, accuracy: 10, speed: 0 },
    });
    (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValue({ candidates: [] });
    (createPrivateCheckInPlaceCandidate as jest.Mock).mockResolvedValue({ candidate: {
      id: 'private-candidate', type: 'private_place', name: 'Home', address: '', category: 'Private location',
      latitude: 46.235, longitude: -63.129, distanceMetres: 0,
    } });
    (bindCheckInReadiness as jest.Mock).mockResolvedValue({ protocolVersion: 1, readinessSessionId: 'readiness-session',
      eligibilitySessionId: 'bound-session', locationType: 'private_place', placeCandidateId: 'private-candidate',
      exactPrivateAllowed: false, expiresAtMs: Date.now() + 60_000 });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    mockPush.mockClear();
  });

  it('keeps check-in discoverable before a nearby venue becomes eligible', () => {
    let component: renderer.ReactTestRenderer;

    act(() => {
      component = renderer.create(<ContextualCheckInControl enabled />);
    });

    const idleControl = component!.root.findByProps({ testID: 'contextual-check-in-idle' });
    expect(StyleSheet.flatten(idleControl.props.style)).toEqual(expect.objectContaining({
      bottom: 20,
      right: 4,
      width: 48,
      height: 48,
      borderRadius: 24,
    }));

    act(() => idleControl.props.onPress());

    expect(component!.root.findByType(Modal).props.visible).toBe(false);
    expect(component!.root.findByProps({ testID: 'check-in-readiness-explanation' })).toBeTruthy();
    expect(bindCheckInReadiness).not.toHaveBeenCalled();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    act(() => component!.unmount());
  });

  function makeReady(seconds: number) {
    let evidence = emptyReadiness();
    for (let elapsed = 0; elapsed <= seconds; elapsed += 10) {
      const capturedAtMs = Date.now() - (seconds - elapsed) * 1000;
      evidence = advanceReadiness(evidence, { latitude: 46.235, longitude: -63.129,
        accuracyMeters: 10, speedMetersPerSecond: 0, capturedAtMs }, capturedAtMs);
    }
    useCheckInReadinessStore.setState({ evidence, sessionId: 'readiness-session', lastPromptAtMs: Date.now(),
      receipt: { protocolVersion: 1, sessionId: 'readiness-session', sequence: seconds / 10 + 1,
        hereQualifyingMs: Math.min(30_000, seconds * 1000), placeQualifyingMs: seconds * 1000,
        expiresAtMs: Date.now() + 20_000 } });
  }

  it('binds prequalified Here evidence and opens private privacy confirmation immediately, without a second dwell', async () => {
    makeReady(30);
    let component: renderer.ReactTestRenderer;
    await act(async () => { component = renderer.create(<ContextualCheckInControl enabled />); });
    expect(mockPush).not.toHaveBeenCalled();
    await act(async () => { component!.root.findByProps({ testID: 'contextual-check-in-ready' }).props.onPress(); });
    act(() => component!.root.findByProps({ testID: 'private-place-entry' }).props.onPress());
    await act(async () => { component!.root.findByProps({ testID: 'continue-private-check-in' }).props.onPress(); });
    expect(bindCheckInReadiness).toHaveBeenCalledWith(expect.objectContaining({ readinessSessionId: 'readiness-session', placeCandidateId: 'private-candidate' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/check-in', params: {
      eligibilitySessionId: 'bound-session', readinessVersion: '1', placeCandidateId: 'private-candidate',
      placeType: 'private_place', placeName: 'Home', placeCategory: 'Private location',
    } });
    expect(useCheckInReadinessStore.getState().grant?.exactPrivateAllowed).toBe(false);
    expect(JSON.stringify(mockPush.mock.calls)).not.toMatch(/latitude|longitude|placeAddress/);
    expect(createPrivateCheckInPlaceCandidate).toHaveBeenCalledWith(expect.objectContaining({ label: 'Home' }));
    act(() => component!.unmount());
  });

  it('enables private check-in at Here readiness while public check-in waits for Place readiness', async () => {
    makeReady(30);
    (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValueOnce({ candidates: [{
      id: 'public-candidate', type: 'external_place', name: 'Nearby place', address: 'Public address',
      category: 'Pub', latitude: 46.235, longitude: -63.129, distanceMetres: 0,
    }] });
    let component: renderer.ReactTestRenderer;
    await act(async () => { component = renderer.create(<ContextualCheckInControl enabled />); });
    await act(async () => { component!.root.findByProps({ testID: 'contextual-check-in-ready' }).props.onPress(); });

    expect(component!.root.findByProps({ testID: 'private-place-entry' }).props.disabled).not.toBe(true);
    expect(component!.root.findByProps({ testID: 'continue-public-check-in' }).props.disabled).toBe(true);

    act(() => component!.root.findByProps({ testID: 'private-place-entry' }).props.onPress());
    expect(component!.root.findByProps({ testID: 'continue-private-check-in' }).props.disabled).toBe(false);
    act(() => component!.unmount());
  });

  it('keeps the projected full Here ring open until the server confirms, then updates the hint and opens immediately', async () => {
    makeReady(30);
    const receipt = useCheckInReadinessStore.getState().receipt!;
    useCheckInReadinessStore.setState({ receipt: { ...receipt, hereQualifyingMs: 20_000, placeQualifyingMs: 20_000 } });
    let component: renderer.ReactTestRenderer;
    await act(async () => { component = renderer.create(<ContextualCheckInControl enabled />); });
    const idle = component!.root.findByProps({ testID: 'contextual-check-in-idle' });
    expect(component!.root.findByProps({ testID: 'check-in-here-ring' }).props.strokeDashoffset).toBeGreaterThan(0);
    expect(component!.root.findAllByProps({ testID: 'check-in-ready-mark' })).toHaveLength(0);
    await act(async () => idle.props.onPress());
    expect(JSON.stringify(component!.toJSON())).toContain('Finishing location verification.');
    expect(JSON.stringify(component!.toJSON())).toContain('Checking');
    expect(component!.root.findByType(Modal).props.visible).toBe(false);

    await act(async () => useCheckInReadinessStore.setState({ receipt }));
    expect(component!.root.findByProps({ testID: 'check-in-here-ring' }).props).toMatchObject({
      strokeDashoffset: 0, stroke: '#6D28D9', strokeWidth: 4.5,
    });
    expect(component!.root.findByProps({ testID: 'check-in-ready-mark' })).toBeTruthy();
    expect(JSON.stringify(component!.toJSON())).toContain('Private check-in is ready.');
    expect(mockPush).not.toHaveBeenCalled();
    await act(async () => component!.root.findByProps({ testID: 'contextual-check-in-ready' }).props.onPress());
    expect(component!.root.findByType(Modal).props.visible).toBe(true);
    expect(component!.root.findByProps({ testID: 'private-place-entry' }).props.disabled).not.toBe(true);
    act(() => component!.unmount());
  });

  it('completes the blue ring independently at server-backed Place readiness and removes completion when the receipt is lost', async () => {
    makeReady(90);
    const receipt = useCheckInReadinessStore.getState().receipt!;
    useCheckInReadinessStore.setState({ receipt: { ...receipt, placeQualifyingMs: 80_000 } });
    let component: renderer.ReactTestRenderer;
    await act(async () => { component = renderer.create(<ContextualCheckInControl enabled />); });
    expect(component!.root.findByProps({ testID: 'check-in-here-ring' }).props.strokeDashoffset).toBe(0);
    expect(component!.root.findByProps({ testID: 'check-in-place-ring' }).props.strokeDashoffset).toBeGreaterThan(0);
    await act(async () => useCheckInReadinessStore.setState({ receipt }));
    expect(component!.root.findByProps({ testID: 'check-in-place-ring' }).props).toMatchObject({
      strokeDashoffset: 0, stroke: '#175CD3', strokeWidth: 4.5,
    });
    await act(async () => useCheckInReadinessStore.setState({ receipt: null }));
    expect(component!.root.findByProps({ testID: 'check-in-here-ring' }).props.strokeDashoffset).toBeGreaterThan(0);
    expect(component!.root.findByProps({ testID: 'check-in-place-ring' }).props.strokeDashoffset).toBeGreaterThan(0);
    expect(component!.root.findAllByProps({ testID: 'check-in-ready-mark' })).toHaveLength(0);
    expect(component!.root.findByProps({ testID: 'contextual-check-in-idle' })).toBeTruthy();
    act(() => component!.unmount());
  });

  it('keeps a visible gap and check-in locked until return validation finishes', async () => {
    makeReady(90);
    useCheckInReadinessStore.setState({ interruptedAtMs: Date.now() - 1_000 });
    let component: renderer.ReactTestRenderer;
    await act(async () => { component = renderer.create(<ContextualCheckInControl enabled />); });

    const control = component!.root.findByProps({ testID: 'contextual-check-in-idle' });
    expect(control.props.accessibilityLabel).toContain('Here 90 percent. Place 90 percent.');
    expect(component!.root.findAllByProps({ testID: 'check-in-ready-mark' })).toHaveLength(0);
    await act(async () => control.props.onPress());

    expect(component!.root.findByType(Modal).props.visible).toBe(false);
    expect(component!.root.findByProps({ testID: 'check-in-readiness-explanation' })).toBeTruthy();
    expect(bindCheckInReadiness).not.toHaveBeenCalled();
    act(() => component!.unmount());
  });

  it('fails closed if the bind endpoint is absent and does not manufacture eligibility', async () => {
    makeReady(30);
    (bindCheckInReadiness as jest.Mock).mockRejectedValueOnce(new Error('Verification unavailable'));
    let component: renderer.ReactTestRenderer;
    await act(async () => { component = renderer.create(<ContextualCheckInControl enabled />); });
    await act(async () => { component!.root.findByProps({ testID: 'contextual-check-in-ready' }).props.onPress(); });
    act(() => component!.root.findByProps({ testID: 'private-place-entry' }).props.onPress());
    await act(async () => { component!.root.findByProps({ testID: 'continue-private-check-in' }).props.onPress(); });
    expect(mockPush).not.toHaveBeenCalled();
    expect(useCheckInReadinessStore.getState().grant).toBeNull();
    expect(component!.root.findByType(Modal).props.visible).toBe(true);
    act(() => component!.unmount());
  });

  it.each(['gathr_venue', 'external_place'] as const)('preserves %s selection and binds before audience confirmation', async (type) => {
    makeReady(90);
    const isVenue = type === 'gathr_venue';
    (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValueOnce({ candidates: [{
      id: 'public-candidate', type, ...(isVenue ? { venueId: 'known-venue' } : {}),
      name: 'Nearby place', address: 'Public address', category: 'Pub', latitude: 46.235, longitude: -63.129, distanceMetres: 0,
    }] });
    (bindCheckInReadiness as jest.Mock).mockResolvedValueOnce({ protocolVersion: 1, readinessSessionId: 'readiness-session',
      eligibilitySessionId: 'bound-public-session', locationType: type,
      ...(isVenue ? { venueId: 'known-venue' } : { placeCandidateId: 'public-candidate' }),
      exactPrivateAllowed: false, expiresAtMs: Date.now() + 60_000 });
    let component: renderer.ReactTestRenderer;
    await act(async () => { component = renderer.create(<ContextualCheckInControl enabled />); });
    await act(async () => { component!.root.findByProps({ testID: 'contextual-check-in-ready' }).props.onPress(); });
    await act(async () => { component!.root.findByProps({ testID: 'continue-public-check-in' }).props.onPress(); });
    expect(bindCheckInReadiness).toHaveBeenCalledWith(expect.objectContaining(isVenue ? { venueId: 'known-venue' } : { placeCandidateId: 'public-candidate' }));
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/check-in', params: expect.objectContaining({ eligibilitySessionId: 'bound-public-session', readinessVersion: '1' }) }));
    act(() => component!.unmount());
  });

  it('does not open a modal or navigate when the outer ring automatically becomes ready', async () => {
    makeReady(90);
    useCheckInReadinessStore.setState({ lastPromptAtMs: 0 });
    let component: renderer.ReactTestRenderer;
    await act(async () => { component = renderer.create(<ContextualCheckInControl enabled />); });
    expect(component!.root.findByProps({ testID: 'check-in-readiness-explanation' })).toBeTruthy();
    expect(component!.root.findByType(Modal).props.visible).toBe(false);
    expect(mockPush).not.toHaveBeenCalled();
    expect(bindCheckInReadiness).not.toHaveBeenCalled();
    act(() => component!.root.findByProps({ accessibilityLabel: 'Dismiss check-in hint' }).props.onPress());
    await act(async () => component!.update(<ContextualCheckInControl enabled />));
    expect(component!.root.findAllByProps({ testID: 'check-in-readiness-explanation' })).toHaveLength(0);
    act(() => component!.unmount());
  });

  it('ignores a late bind result after the user dismisses the flow', async () => {
    makeReady(30);
    let resolveBind: (value: unknown) => void = () => undefined;
    (bindCheckInReadiness as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { resolveBind = resolve; }));
    let component: renderer.ReactTestRenderer;
    await act(async () => { component = renderer.create(<ContextualCheckInControl enabled />); });
    await act(async () => { component!.root.findByProps({ testID: 'contextual-check-in-ready' }).props.onPress(); });
    act(() => component!.root.findByProps({ testID: 'private-place-entry' }).props.onPress());
    await act(async () => { component!.root.findByProps({ testID: 'continue-private-check-in' }).props.onPress(); });
    act(() => component!.root.findByType(Modal).props.onRequestClose());
    await act(async () => resolveBind({ protocolVersion: 1, readinessSessionId: 'readiness-session', eligibilitySessionId: 'bound-session',
      locationType: 'private_place', placeCandidateId: 'private-candidate', exactPrivateAllowed: false, expiresAtMs: Date.now() + 60_000 }));
    expect(mockPush).not.toHaveBeenCalled();
    expect(useCheckInReadinessStore.getState().grant).toBeNull();
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
