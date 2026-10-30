import React from 'react';
import { writeFileSync } from 'node:fs';
import { Dimensions, Modal, Platform, StyleSheet } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import * as Location from 'expo-location';
import { createPrivateCheckInPlaceCandidate, bindCheckInReadiness, discoverNearbyCheckInPlaces, listNearbyCanonicalCheckInVenues } from '../../../services/socialService';
import { requestCheckInPreparationRetry } from '../../../services/checkInPreparation';
import { resetCheckInReadinessOwner, useCheckInReadinessStore } from '../../../store/checkInReadinessStore';
import { advanceReadiness, emptyReadiness } from '../../../utils/checkInReadiness';
import type { NearbyCheckInPlaceCandidate } from '../../../types/social';
import ContextualCheckInControl, { buildNearbyCheckInRoute, closestNearbyPlaceId, type VenueCandidate } from '../ContextualCheckInControl';

const mockPush = jest.fn();
const mockIsFocused = jest.fn(() => true);
const mockAllEvents: never[] = [];
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => mockIsFocused() }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('expo-location', () => ({ requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'check-in-test-user' } }) }));
jest.mock('../../../store', () => ({ useMapStore: (selector: (state: { allEvents: never[] }) => unknown) => selector({ allEvents: mockAllEvents }) }));
jest.mock('../../../store/socialStore', () => ({ useSocialStore: (selector: (state: { ownCheckIn: null }) => unknown) => selector({ ownCheckIn: null }) }));
jest.mock('../../../types/social', () => ({ SOCIAL_FEATURE_ENABLED: true, SOCIAL_RELEASE_TWO_ENABLED: true }));
jest.mock('../../../services/checkInPreparation', () => ({ requestCheckInPreparationRetry: jest.fn() }));
jest.mock('../../../services/socialService', () => ({
  createPrivateCheckInPlaceCandidate: jest.fn(), discoverNearbyCheckInPlaces: jest.fn(), listNearbyCanonicalCheckInVenues: jest.fn(),
  bindCheckInReadiness: jest.fn(), createSocialOperationId: jest.fn(() => 'operation-test-id'), SocialServiceError: class extends Error {},
}));

describe('prepared check-in control', () => {
  let component: renderer.ReactTestRenderer | undefined;
  const root = () => component!.root;
  const byId = (testID: string) => root().findByProps({ testID });
  const copy = () => JSON.stringify(component!.toJSON());
  const press = async (testID: string) => { await act(async () => byId(testID).props.onPress()); };
  const mount = async () => { await act(async () => { component = renderer.create(<ContextualCheckInControl enabled />); }); };
  const open = async () => { await mount(); await press('contextual-check-in-ready'); };
  const row = (name: string) => root().find((node) => node.props.accessibilityRole === 'radio' && String(node.props.accessibilityLabel).startsWith(`${name},`));
  const place = (id: string, name: string, type: 'gathr_venue' | 'external_place' = 'gathr_venue'): NearbyCheckInPlaceCandidate => ({
    id, type, ...(type === 'gathr_venue' ? { venueId: id } : {}), name, address: '1 Main St', category: 'Public place',
    latitude: 46.235, longitude: -63.129, distanceMetres: 12,
  });
  const canonical = [place('holy-whale', 'Holy Whale'), place('nearby-cafe', 'Nearby cafe')];
  const external = [place('osm-candidate', 'Other public place', 'external_place')];

  function seed(seconds = 90, externalStatus: 'ready' | 'loading' | 'error' = 'ready') {
    let evidence = emptyReadiness();
    for (let elapsed = 0; elapsed <= seconds; elapsed += 10) {
      const capturedAtMs = Date.now() - (seconds - elapsed) * 1000;
      evidence = advanceReadiness(evidence, { latitude: 46.235, longitude: -63.129, accuracyMeters: 10, speedMetersPerSecond: 0, capturedAtMs }, capturedAtMs);
    }
    const arrival = { sessionId: 'readiness-session', latitude: 46.235, longitude: -63.129, accuracyMeters: 10,
      capturedAtMs: Date.now(), expiresAtMs: Date.now() + 180_000, here: true, place: seconds >= 90 };
    useCheckInReadinessStore.setState({ evidence, sessionId: arrival.sessionId, arrival,
      preferencesLoaded: true, appActive: true, foregroundGranted: true, lastPromptAtMs: Date.now(),
      receipt: { protocolVersion: 1, sessionId: arrival.sessionId, sequence: 10,
        hereQualifyingMs: 30_000, placeQualifyingMs: seconds >= 90 ? 90_000 : 0, expiresAtMs: Date.now() + 20_000 },
      preparation: { sessionId: arrival.sessionId, latitude: arrival.latitude, longitude: arrival.longitude, expiresAtMs: Date.now() + 300_000,
        canonical: { status: 'ready', candidates: canonical, error: '', retryAtMs: 0 },
        external: { status: externalStatus, candidates: externalStatus === 'ready' ? external : [],
          error: externalStatus === 'error' ? 'OpenStreetMap is unavailable. Nearby GathR venues are ready.' : '', retryAtMs: Date.now() + 30_000 },
      },
    });
  }
  beforeEach(() => {
    jest.useFakeTimers(); jest.setSystemTime(2_000_000_100_000); jest.clearAllMocks();
    mockIsFocused.mockReturnValue(true); resetCheckInReadinessOwner('check-in-test-user');
    useCheckInReadinessStore.setState({ preferencesLoaded: true, appActive: true, foregroundGranted: true });
    (createPrivateCheckInPlaceCandidate as jest.Mock).mockResolvedValue({ candidate: {
      id: 'private-candidate', type: 'private_place', name: 'Home', address: '', category: 'Private location',
      latitude: 46.235, longitude: -63.129, distanceMetres: 0,
    } });
  });
  afterEach(() => { act(() => component?.unmount()); component = undefined; jest.useRealTimers(); jest.restoreAllMocks(); });

  it('keeps early check-in discoverable without requesting permissions or making lookup calls', async () => {
    await mount(); await press('contextual-check-in-idle');
    expect(root().findByType(Modal).props.visible).toBe(false);
    expect(byId('check-in-readiness-explanation')).toBeTruthy();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(discoverNearbyCheckInPlaces).not.toHaveBeenCalled(); expect(listNearbyCanonicalCheckInVenues).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not complete a locally elapsed ring without a server-qualified arrival', async () => {
    seed(); useCheckInReadinessStore.setState({ arrival: null, receipt: null }); await mount();
    expect(byId('contextual-check-in-idle')).toBeTruthy();
    expect(byId('check-in-place-ring').props.strokeDashoffset).toBeGreaterThan(0);
  });

  it('opens prepared canonical and external choices with no lookup or verification wait', async () => {
    seed(); await open(); expect(row('Holy Whale').props.disabled).toBe(false);
    expect(byId('find-somewhere-else').props.disabled).toBe(false); expect(byId('check-in-place-ring').props.strokeDashoffset).toBe(0);
    await press('find-somewhere-else'); expect(row('Other public place').props.disabled).toBe(false);
    expect(byId('public-place-location-status').props.children).toBe('Ready'); expect(copy()).not.toContain('settle again');
    expect(discoverNearbyCheckInPlaces).not.toHaveBeenCalled(); expect(listNearbyCanonicalCheckInVenues).not.toHaveBeenCalled();
    expect(bindCheckInReadiness).not.toHaveBeenCalled(); expect(useCheckInReadinessStore.getState().attempt?.arrival.sessionId).toBe('readiness-session');
    if (process.env.GATHR_QA_OUTPUT_DIR) writeFileSync(`${process.env.GATHR_QA_OUTPUT_DIR}/checkin-ready-render.json`, JSON.stringify(component!.toJSON(), null, 2));
  });

  it('keeps Here private check-in usable while public preparation is running', async () => {
    seed(30, 'loading'); await open(); expect(byId('private-place-entry').props.disabled).toBe(false);
    expect(byId('find-somewhere-else').props.disabled).toBe(true);
    await press('private-place-entry'); await press('continue-private-check-in');
    expect(createPrivateCheckInPlaceCandidate).toHaveBeenCalledWith(expect.objectContaining({ label: 'Home', readinessSessionId: 'readiness-session' }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/check-in', params: {
      readinessVersion: '1', readinessSessionId: 'readiness-session', placeCandidateId: 'private-candidate',
      placeType: 'private_place', placeName: 'Home', placeCategory: 'Private location',
    } });
    expect(JSON.stringify(mockPush.mock.calls)).not.toMatch(/latitude|longitude|placeAddress/); expect(bindCheckInReadiness).not.toHaveBeenCalled();
  });

  it('surfaces provider failure without a full public ring and preserves usable canonical choices', async () => {
    seed(90, 'error'); await open(); expect(row('Holy Whale').props.disabled).toBe(false);
    expect(byId('check-in-place-ring').props.strokeDashoffset).toBeGreaterThan(0);
    await press('find-somewhere-else'); expect(copy()).toContain('OpenStreetMap is unavailable');
    expect(byId('public-place-location-status').props.children).toBe('Unavailable'); await press('retry-nearby-public-places');
    expect(requestCheckInPreparationRetry).toHaveBeenCalledWith('external');
    if (process.env.GATHR_QA_OUTPUT_DIR) writeFileSync(`${process.env.GATHR_QA_OUTPUT_DIR}/checkin-external-failure-render.json`, JSON.stringify(component!.toJSON(), null, 2));
  });

  it('keeps canonical selection usable when external preparation fails', async () => {
    seed(90, 'error'); await open(); await press('continue-public-check-in');
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ venueId: 'holy-whale' }) }));
  });

  it('shows preparing rather than ready while public lists are loading after dwell', async () => {
    seed(90, 'loading'); await open(); expect(byId('find-somewhere-else').props.disabled).toBe(true);
    expect(byId('check-in-place-ring').props.strokeDashoffset).toBeGreaterThan(0); expect(copy()).toContain('Preparing nearby places');
    expect(row('Holy Whale').props.disabled).toBe(false);
  });

  it('offers explicit canonical retry and leaves independently prepared external places usable', async () => {
    seed(); const state = useCheckInReadinessStore.getState();
    useCheckInReadinessStore.setState({ preparation: { ...state.preparation,
      canonical: { status: 'error', candidates: [], error: 'GathR venues could not be prepared.', retryAtMs: Date.now() + 30_000 } } });
    await open(); await press('retry-nearby-gathr-venues'); expect(requestCheckInPreparationRetry).toHaveBeenCalledWith('canonical');
    await press('find-somewhere-else'); expect(row('Other public place').props.disabled).toBe(false);
    await press('continue-public-check-in'); expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ placeCandidateId: 'osm-candidate' }) }));
  });

  it('retains selection when a raw receipt disappears across an app switch', async () => {
    seed(); await open(); act(() => row('Nearby cafe').props.onPress());
    act(() => useCheckInReadinessStore.setState({ appActive: false, interruptedAtMs: Date.now(), receipt: null }));
    expect(row('Nearby cafe').props.accessibilityState.selected).toBe(true);
    act(() => useCheckInReadinessStore.setState({ appActive: true })); await press('continue-public-check-in');
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ venueId: 'nearby-cafe' }) }));
    expect(discoverNearbyCheckInPlaces).not.toHaveBeenCalled();
  });

  it('ignores a repeated continue tap before the route transition finishes', async () => {
    seed(); await open(); const button = byId('continue-public-check-in');
    await act(async () => { button.props.onPress(); button.props.onPress(); });
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('ignores a private candidate response after the user canceled that flow', async () => {
    let finish: (value: unknown) => void = () => undefined;
    (createPrivateCheckInPlaceCandidate as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    seed(30); await open(); await press('private-place-entry'); await press('continue-private-check-in');
    act(() => root().findByType(Modal).props.onRequestClose());
    await act(async () => { finish({ candidate: { id: 'private-candidate', type: 'private_place', name: 'Home', latitude: 46.235, longitude: -63.129 } }); });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('retains rows and selection through expiry but disables stale confirmation', async () => {
    seed(); await open(); act(() => row('Nearby cafe').props.onPress()); await act(async () => { jest.advanceTimersByTime(181_000); });
    expect(row('Nearby cafe').props.accessibilityState.selected).toBe(true); expect(row('Nearby cafe').props.disabled).toBe(true);
    expect(root().findAllByProps({ testID: 'continue-public-check-in' })).toHaveLength(0); expect(copy()).toContain('choices are saved'); expect(mockPush).not.toHaveBeenCalled();
  });

  it('uses successful empty external preparation without a second search', async () => {
    seed(); const state = useCheckInReadinessStore.getState();
    useCheckInReadinessStore.setState({ preparation: { ...state.preparation, external: { ...state.preparation.external, candidates: [] } } });
    await open(); await press('find-somewhere-else'); expect(byId('public-place-location-status').props.children).toBe('Ready');
    expect(copy()).toContain('No other public places'); expect(discoverNearbyCheckInPlaces).not.toHaveBeenCalled();
  });

  it('cancels only the captured attempt and reopens prepared choices without another lookup', async () => {
    seed(); await open(); act(() => root().findByType(Modal).props.onRequestClose());
    expect(useCheckInReadinessStore.getState().attempt).toBeNull(); expect(useCheckInReadinessStore.getState().arrival).not.toBeNull();
    await press('contextual-check-in-ready'); expect(row('Holy Whale')).toBeTruthy(); expect(discoverNearbyCheckInPlaces).not.toHaveBeenCalled();
  });

  it('shows the sanitized App Check failure identifier in the existing readiness notice', async () => {
    seed(90);
    const current = useCheckInReadinessStore.getState();
    const error = 'GathR could not verify this app installation. Try again shortly. [AC-INIT-NETWORK]';
    useCheckInReadinessStore.setState({ arrival: null, receipt: null, serviceError: true,
      preparation: { ...current.preparation,
        canonical: { status: 'error', candidates: [], error, retryAtMs: Date.now() + 60_000 },
        external: { status: 'error', candidates: [], error, retryAtMs: Date.now() + 60_000 },
      },
    });
    await mount(); await press('contextual-check-in-idle');
    expect(copy()).toContain('[AC-INIT-NETWORK]');
    expect(copy()).toContain('Preparing');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('preserves Android taskbar inset and private setup layout', async () => {
    jest.replaceProperty(Platform, 'OS', 'android'); jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 800, height: 1280, scale: 1, fontScale: 1 });
    seed(30); await open(); expect(StyleSheet.flatten(root().findByProps({ accessibilityViewIsModal: true }).props.style).paddingBottom).toBe(52);
    await press('private-place-entry'); expect(byId('continue-private-check-in').props.disabled).toBe(false);
  });

  it('chooses the closest candidate and serializes only safe route display fields', () => {
    const a: VenueCandidate = { id: 'a', type: 'gathr_venue', venueId: 'a', venueName: 'A', address: '', category: '', latitude: 1, longitude: 2, distanceMetres: 12, imageUrl: '' };
    const b = { ...a, id: 'b', venueId: 'b', distanceMetres: 4 }; expect(closestNearbyPlaceId([a, b])).toBe('b');
    expect(buildNearbyCheckInRoute(a, 'session-id', [a,b]).params).toEqual({ venueId: 'a', readinessSessionId: 'session-id', eligibleVenueIds: 'a,b' });
    expect(JSON.stringify(buildNearbyCheckInRoute(a, 'session-id', [a,b]))).not.toMatch(/latitude|longitude/);
  });
});
