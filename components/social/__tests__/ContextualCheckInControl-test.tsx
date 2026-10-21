import React from 'react';
import { Dimensions, Image, Modal, Platform, StyleSheet, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import * as Location from 'expo-location';
import { createPrivateCheckInPlaceCandidate, bindCheckInReadiness, discoverNearbyCheckInPlaces, listNearbyCanonicalCheckInVenues, SocialServiceError } from '../../../services/socialService';
import { resetCheckInReadinessOwner, useCheckInReadinessStore } from '../../../store/checkInReadinessStore';
import { advanceReadiness, emptyReadiness } from '../../../utils/checkInReadiness';

import ContextualCheckInControl, {
  buildNearbyCheckInRoute,
  closestNearbyPlaceId,
  VenueAvatar,
  type VenueCandidate,
} from '../ContextualCheckInControl';

const mockPush = jest.fn();
const mockIsFocused = jest.fn(() => true);
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => mockIsFocused(),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn().mockResolvedValue(undefined) }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn().mockResolvedValue(undefined) }));

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
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
  listNearbyCanonicalCheckInVenues: jest.fn().mockResolvedValue({ candidates: [] }),
  recordCheckInEligibilitySample: jest.fn(),
  bindCheckInReadiness: jest.fn(),
  createSocialOperationId: jest.fn(() => 'operation-test-id'),
  SocialServiceError: class SocialServiceError extends Error {
    code: string;
    details?: { condition?: string; retryable?: boolean };

    constructor(code: string, message: string, details?: { condition?: string; retryable?: boolean }) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
}));

describe('ContextualCheckInControl', () => {
  // The picker prepares a route. The privacy screen binds the one-use grant
  // only after confirmation (c79c2a8); it must never be consumed by this control.
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(2_000_000_100_000);
    mockIsFocused.mockReturnValue(true);
    resetCheckInReadinessOwner('check-in-test-user');
    useCheckInReadinessStore.setState({ preferencesLoaded: true, appActive: true, foregroundGranted: true });
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValue({ candidates: [], externalLookupStatus: 'complete' });
    (listNearbyCanonicalCheckInVenues as jest.Mock).mockResolvedValue({ candidates: [] });
    (createPrivateCheckInPlaceCandidate as jest.Mock).mockResolvedValue({ candidate: {
      id: 'private-candidate', type: 'private_place', name: 'Home', address: '', category: 'Private location',
      latitude: 46.235, longitude: -63.129, distanceMetres: 0,
    } });
  });
  afterEach(() => {
    // Always unmount, including failed assertions, to avoid leaking observers.
    act(() => component?.unmount());
    component = undefined;
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.resetAllMocks();
  });

  let component: renderer.ReactTestRenderer | undefined;
  const control = () => component!.root;
  const byId = (testID: string) => control().findByProps({ testID });
  const copy = () => JSON.stringify(component!.toJSON());
  const placeRow = (name: string) => control().find((node) => (
    node.props.accessibilityRole === 'radio'
    && String(node.props.accessibilityLabel).startsWith(`${name},`)
  ));
  const press = async (testID: string) => {
    await act(async () => byId(testID).props.onPress());
  };
  const mount = async (enabled = true) => {
    await act(async () => { component = renderer.create(<ContextualCheckInControl enabled={enabled} />); });
  };
  const open = async () => { await mount(); await press('contextual-check-in-ready'); };
  const search = async () => { await open(); await press('find-somewhere-else'); };
  const publicPlace = (id: string, name: string, latitude = 46.235) => ({
    id, type: 'gathr_venue', venueId: id, name, address: '1 Main St', category: 'GathR venue',
    latitude, longitude: -63.129, distanceMetres: 0,
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

  it('keeps check-in discoverable without requesting permissions or navigating before readiness', async () => {
    await mount();
    expect(StyleSheet.flatten(byId('contextual-check-in-idle').props.style)).toMatchObject({
      bottom: 42, right: 10, width: 36, height: 36, borderRadius: 18,
    });
    await press('contextual-check-in-idle');
    expect(control().findByType(Modal).props.visible).toBe(false);
    expect(byId('check-in-readiness-explanation')).toBeTruthy();
    expect(bindCheckInReadiness).not.toHaveBeenCalled();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens private privacy confirmation without binding a grant or exposing coordinates or an address', async () => {
    makeReady(30);
    await open();
    expect(mockPush).not.toHaveBeenCalled();
    await press('private-place-entry');
    await press('continue-private-check-in');
    expect(bindCheckInReadiness).not.toHaveBeenCalled();
    expect(useCheckInReadinessStore.getState().grant).toBeNull();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/check-in', params: {
      readinessSessionId: 'readiness-session', readinessVersion: '1', placeCandidateId: 'private-candidate',
      placeType: 'private_place', placeName: 'Home', placeCategory: 'Private location',
    } });
    expect(JSON.stringify(mockPush.mock.calls)).not.toMatch(/latitude|longitude|placeAddress|eligibilitySessionId/);
    expect(createPrivateCheckInPlaceCandidate).toHaveBeenCalledWith(expect.objectContaining({ label: 'Home' }));
  });

  it('keeps both place choices and private setup above an Android tablet taskbar without confirming a check-in', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 800, height: 1280, scale: 1, fontScale: 1 });
    makeReady(30);
    await open();
    const sheet = () => control().findByProps({ accessibilityViewIsModal: true });
    expect(StyleSheet.flatten(sheet().props.style).paddingBottom).toBe(52);
    await press('private-place-entry');
    expect(StyleSheet.flatten(sheet().props.style).paddingBottom).toBe(52);
    expect(copy()).toContain('Continue to privacy');
    expect(createPrivateCheckInPlaceCandidate).not.toHaveBeenCalled();
    expect(bindCheckInReadiness).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('enables private check-in at Here readiness while public search waits for Place readiness', async () => {
    makeReady(30);
    await open();
    expect(byId('private-place-entry').props.disabled).not.toBe(true);
    expect(byId('find-somewhere-else').props.disabled).toBe(true);
    expect(control().findAllByProps({ testID: 'continue-public-check-in' })).toHaveLength(0);
    await press('private-place-entry');
    expect(byId('continue-private-check-in').props.disabled).toBe(false);
    expect(discoverNearbyCheckInPlaces).not.toHaveBeenCalled();
  });

  it('preserves explicit venue selection across GPS jitter and a cached lookup, then routes that venue', async () => {
    makeReady(90);
    const taste = { ...publicPlace('taste', 'Taste of India', 46.2351), distanceMetres: 12 };
    const tim = { ...publicPlace('tim', 'Tim Hortons', 46.23504), distanceMetres: 8 };
    (listNearbyCanonicalCheckInVenues as jest.Mock).mockResolvedValue({ candidates: [taste, tim] });
    await open();
    expect(placeRow('Tim Hortons').props.accessibilityState.selected).toBe(true);
    act(() => placeRow('Taste of India').props.onPress());
    const before = useCheckInReadinessStore.getState();
    jest.setSystemTime(Date.now() + 10_000);
    act(() => useCheckInReadinessStore.setState({ evidence: advanceReadiness(before.evidence, {
      latitude: 46.23502, longitude: -63.12901, accuracyMeters: 22, speedMetersPerSecond: 0.3,
      capturedAtMs: Date.now(),
    }, Date.now()) }));
    expect(placeRow('Taste of India').props.accessibilityState.selected).toBe(true);
    expect(placeRow('Tim Hortons').props.accessibilityState.selected).toBe(false);
    act(() => control().findByType(Modal).props.onRequestClose());
    await press('contextual-check-in-ready');
    expect(listNearbyCanonicalCheckInVenues).toHaveBeenCalledTimes(1);
    act(() => placeRow('Taste of India').props.onPress());
    await press('continue-public-check-in');
    expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({
      venueId: 'taste', readinessSessionId: 'readiness-session', readinessVersion: '1',
    }) }));
    expect(bindCheckInReadiness).not.toHaveBeenCalled();
  });

  it('opens locally ready choices while waiting for server confirmation before preparing a private place', async () => {
    makeReady(30);
    const receipt = useCheckInReadinessStore.getState().receipt!;
    useCheckInReadinessStore.setState({ receipt: { ...receipt, hereQualifyingMs: 20_000, placeQualifyingMs: 20_000 } });
    await open();
    expect(byId('check-in-here-ring').props.strokeDashoffset).toBe(0);
    expect(byId('check-in-ready-mark')).toBeTruthy();
    expect(control().findByType(Modal).props.visible).toBe(true);
    await press('private-place-entry');
    await press('continue-private-check-in');
    expect(createPrivateCheckInPlaceCandidate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    await act(async () => useCheckInReadinessStore.setState({ receipt }));
    expect(createPrivateCheckInPlaceCandidate).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(bindCheckInReadiness).not.toHaveBeenCalled();
  });

  it('clears an external selection after movement and requires another explicit choice after searching again', async () => {
    makeReady(90);
    const taste = { ...publicPlace('taste', 'Taste of India'), type: 'external_place' };
    const tim = { ...publicPlace('tim', 'Tim Hortons'), type: 'external_place' };
    (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValueOnce({ candidates: [taste, tim] })
      .mockResolvedValueOnce({ candidates: [tim] });
    await search();
    act(() => placeRow('Taste of India').props.onPress());
    expect(placeRow('Taste of India').props.accessibilityState.selected).toBe(true);
    const before = useCheckInReadinessStore.getState();
    jest.setSystemTime(Date.now() + 10_000);
    act(() => useCheckInReadinessStore.setState({ evidence: advanceReadiness(before.evidence, {
      latitude: 46.236, longitude: -63.129, accuracyMeters: 10, speedMetersPerSecond: 2,
      capturedAtMs: Date.now(),
    }, Date.now()) }));
    expect(control().findAll((node) => node.props.accessibilityRole === 'radio')).toHaveLength(0);
    expect(mockPush).not.toHaveBeenCalled();
    act(() => makeReady(90));
    await press('retry-nearby-public-places');
    expect(placeRow('Tim Hortons').props.accessibilityState.selected).toBe(false);
    expect(byId('continue-public-check-in').props.disabled).toBe(true);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('keeps local Place completion separate from permission to navigate when the receipt is lost', async () => {
    makeReady(90);
    (listNearbyCanonicalCheckInVenues as jest.Mock).mockResolvedValue({ candidates: [publicPlace('known', 'Known venue')] });
    await open();
    expect(byId('check-in-place-ring').props).toMatchObject({ strokeDashoffset: 0, stroke: '#175CD3', strokeWidth: 4.5 });
    act(() => useCheckInReadinessStore.setState({ receipt: null }));
    expect(byId('check-in-place-ring').props.strokeDashoffset).toBe(0);
    await press('continue-public-check-in');
    expect(mockPush).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(12_000); });
    expect(byId('check-in-selection-error')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    expect(bindCheckInReadiness).not.toHaveBeenCalled();
  });

  it('resumes public-place discovery when confirmation arrives after the initial wait', async () => {
    makeReady(90);
    const receipt = useCheckInReadinessStore.getState().receipt!;
    useCheckInReadinessStore.setState({ receipt: { ...receipt, placeQualifyingMs: 80_000 } });
    (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValue({ candidates: [
      { ...publicPlace('external-cafe', 'Nearby cafe'), type: 'external_place' },
    ] });
    await search();
    expect(discoverNearbyCheckInPlaces).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(12_000); });
    expect(discoverNearbyCheckInPlaces).not.toHaveBeenCalled();
    expect(byId('continue-public-check-in').props.disabled).toBe(true);
    // A later, accurate stationary fix and server receipt complete the same session.
    const before = useCheckInReadinessStore.getState();
    await act(async () => useCheckInReadinessStore.setState({
      evidence: advanceReadiness(before.evidence, { latitude: 46.23501, longitude: -63.12901,
        accuracyMeters: 14, speedMetersPerSecond: 0.2, capturedAtMs: Date.now() }, Date.now()),
      receipt: { ...receipt, expiresAtMs: Date.now() + 20_000 },
    }));
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledWith(expect.objectContaining({
      capturedAtMs: Date.now(), accuracyMeters: 14,
    }));
    expect(placeRow('Nearby cafe').props.accessibilityState.selected).toBe(false);
    expect(byId('continue-public-check-in').props.disabled).toBe(true);
    expect(mockPush).not.toHaveBeenCalled();
    expect(bindCheckInReadiness).not.toHaveBeenCalled();
  });

  it('shows Confirming instead of Ready while the public-place search lacks a server receipt', async () => {
    makeReady(90);
    const receipt = useCheckInReadinessStore.getState().receipt!;
    useCheckInReadinessStore.setState({ receipt: { ...receipt, placeQualifyingMs: 80_000 } });
    await search();
    expect(byId('public-place-location-status').props.children).toBe('Confirming');
    await act(async () => { jest.advanceTimersByTime(12_000); });
    expect(byId('public-place-location-status').props.children).toBe('Confirming');
    expect(copy()).toContain('Nearby places will load automatically');
    expect(discoverNearbyCheckInPlaces).not.toHaveBeenCalled();
  });

  it('does not turn a resumed search transport failure into repeated automatic requests', async () => {
    makeReady(90);
    const receipt = useCheckInReadinessStore.getState().receipt!;
    useCheckInReadinessStore.setState({ receipt: { ...receipt, placeQualifyingMs: 80_000 } });
    (discoverNearbyCheckInPlaces as jest.Mock).mockRejectedValue(new SocialServiceError('unavailable', 'Network unavailable.'));
    await search();
    await act(async () => { jest.advanceTimersByTime(12_000); });
    await act(async () => useCheckInReadinessStore.setState({ receipt }));
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
    expect(copy()).toContain('Network unavailable.');
    await act(async () => useCheckInReadinessStore.setState({ receipt: null }));
    await act(async () => useCheckInReadinessStore.setState({ receipt }));
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
    await press('retry-nearby-public-places');
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(2);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('starts only one discovery request for two presses before React rerenders', async () => {
    makeReady(90);
    await open();
    const onPress = byId('find-somewhere-else').props.onPress;
    await act(async () => { onPress(); onPress(); });
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('cancels the confirmation wait when returning to known venues', async () => {
    makeReady(90);
    const receipt = useCheckInReadinessStore.getState().receipt!;
    useCheckInReadinessStore.setState({ receipt: { ...receipt, placeQualifyingMs: 80_000 } });
    await search();
    let back = control().find((node) => node.type === Text && node.props.children === 'Nearby GathR venues');
    while (!back.props.onPress && back.parent) back = back.parent;
    await act(async () => back.props.onPress());
    await act(async () => useCheckInReadinessStore.setState({ receipt }));
    expect(discoverNearbyCheckInPlaces).not.toHaveBeenCalled();
    await press('find-somewhere-else');
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
  });

  it('keeps an old confirmation timeout from changing a reopened search in the same session', async () => {
    makeReady(90);
    const receipt = useCheckInReadinessStore.getState().receipt!;
    useCheckInReadinessStore.setState({ receipt: { ...receipt, placeQualifyingMs: 80_000 } });
    await search();
    await act(async () => { jest.advanceTimersByTime(2_000); });
    act(() => control().findByType(Modal).props.onRequestClose());
    await press('contextual-check-in-ready');
    await press('find-somewhere-else');
    await act(async () => { jest.advanceTimersByTime(10_000); });
    expect(copy()).toMatch(/Confirming your location[.\u2026]/);
    expect(copy()).not.toMatch(/Looking for other nearby public places[.\u2026]/);
    expect(discoverNearbyCheckInPlaces).not.toHaveBeenCalled();
    await act(async () => useCheckInReadinessStore.setState({ receipt }));
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
  });

  it.each(['success', 'failure'])('ignores an old network %s after close and reopen', async (outcome) => {
    makeReady(90);
    let finishOld: (result: unknown) => void = () => undefined;
    let rejectOld: (error: Error) => void = () => undefined;
    let finishNew: (result: unknown) => void = () => undefined;
    (discoverNearbyCheckInPlaces as jest.Mock)
      .mockImplementationOnce(() => new Promise((resolve, reject) => { finishOld = resolve; rejectOld = reject; }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishNew = resolve; }));
    await search();
    act(() => control().findByType(Modal).props.onRequestClose());
    await press('contextual-check-in-ready');
    await press('find-somewhere-else');
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(2);
    await act(async () => {
      if (outcome === 'success') finishOld({ candidates: [
        { ...publicPlace('old-cafe', 'Old cafe'), type: 'external_place' },
      ] });
      else rejectOld(new Error('Old search failed.'));
    });
    expect(copy()).toMatch(/Looking for other nearby public places[.\u2026]/);
    expect(copy()).not.toContain('Old cafe');
    expect(copy()).not.toContain('Old search failed.');
    await act(async () => finishNew({ candidates: [
      { ...publicPlace('new-cafe', 'New cafe'), type: 'external_place' },
    ] }));
    expect(placeRow('New cafe').props.accessibilityState.selected).toBe(false);
    expect(mockPush).not.toHaveBeenCalled();
    expect(bindCheckInReadiness).not.toHaveBeenCalled();
  });

  it.each(['expired receipt', 'new session', 'interrupted', 'stale fix'])(
    'rejects discovered places after %s while the request is in flight', async (change) => {
      makeReady(90);
      let finish: (result: unknown) => void = () => undefined;
      (discoverNearbyCheckInPlaces as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
      await search();
      const before = useCheckInReadinessStore.getState();
      if (change === 'stale fix') await act(async () => { jest.advanceTimersByTime(21_000); });
      await act(async () => useCheckInReadinessStore.setState({
        ...(change === 'expired receipt' ? { receipt: { ...before.receipt!, expiresAtMs: Date.now() } } : {}),
        ...(change === 'new session' ? { sessionId: 'replacement-session' } : {}),
        ...(change === 'interrupted' ? { interruptedAtMs: Date.now() } : {}),
      }));
      await act(async () => finish({ candidates: [
        { ...publicPlace('stale-cafe', 'Stale cafe'), type: 'external_place' },
      ] }));
      expect(copy()).not.toContain('Stale cafe');
      expect(copy()).toMatch(/Your location (?:changed during the search|needs to settle again)/);
      expect(mockPush).not.toHaveBeenCalled();
      expect(bindCheckInReadiness).not.toHaveBeenCalled();
    }
  );

  it.each(['expired', 'wrong session', 'wrong protocol', 'rejected'])(
    'does not resume discovery with a %s confirmation receipt', async (kind) => {
      makeReady(90);
      const receipt = useCheckInReadinessStore.getState().receipt!;
      useCheckInReadinessStore.setState({ receipt: { ...receipt, placeQualifyingMs: 80_000 } });
      await search();
      await act(async () => { jest.advanceTimersByTime(12_000); });
      const invalidReceipt = kind === 'rejected' ? null : { ...receipt,
        ...(kind === 'expired' ? { expiresAtMs: Date.now() } : {}),
        ...(kind === 'wrong session' ? { sessionId: 'other-session' } : {}),
        ...(kind === 'wrong protocol' ? { protocolVersion: 2 as 1 } : {}),
      };
      await act(async () => useCheckInReadinessStore.setState({ receipt: invalidReceipt,
        serviceError: kind === 'rejected' }));
      expect(discoverNearbyCheckInPlaces).not.toHaveBeenCalled();
      expect(byId('public-place-location-status').props.children).toBe('Confirming');
      expect(mockPush).not.toHaveBeenCalled();
      expect(bindCheckInReadiness).not.toHaveBeenCalled();
      await act(async () => useCheckInReadinessStore.setState({ receipt, serviceError: false }));
      expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
    }
  );

  it.each([0, 12_000])('offers manual retry after leaving and returning during confirmation at %sms', async (delayMs) => {
    makeReady(90);
    const receipt = useCheckInReadinessStore.getState().receipt!;
    useCheckInReadinessStore.setState({ receipt: { ...receipt, placeQualifyingMs: 80_000 } });
    await search();
    if (delayMs) await act(async () => { jest.advanceTimersByTime(delayMs); });
    mockIsFocused.mockReturnValue(false);
    await act(async () => component!.update(<ContextualCheckInControl enabled />));
    mockIsFocused.mockReturnValue(true);
    await act(async () => component!.update(<ContextualCheckInControl enabled />));
    await act(async () => useCheckInReadinessStore.setState({ receipt }));
    expect(discoverNearbyCheckInPlaces).not.toHaveBeenCalled();
    expect(copy()).toContain('Public place search was paused.');
    expect(copy()).not.toContain('Nearby places will load automatically');
    await press('retry-nearby-public-places');
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
  });

  it.each(['closed', 'new session', 'stale fix', 'low accuracy', 'interrupted', 'disabled', 'unfocused'])(
    'does not resume a pending public-place search after %s', async (change) => {
      makeReady(90);
      const receipt = useCheckInReadinessStore.getState().receipt!;
      useCheckInReadinessStore.setState({ receipt: { ...receipt, placeQualifyingMs: 80_000 } });
      await search();
      await act(async () => { jest.advanceTimersByTime(12_000); });
      if (change === 'closed') act(() => control().findByType(Modal).props.onRequestClose());
      if (change === 'disabled') act(() => component!.update(<ContextualCheckInControl enabled={false} />));
      if (change === 'unfocused') {
        mockIsFocused.mockReturnValue(false);
        act(() => component!.update(<ContextualCheckInControl enabled />));
      }
      if (change === 'stale fix') await act(async () => { jest.advanceTimersByTime(9_000); });
      const before = useCheckInReadinessStore.getState();
      await act(async () => useCheckInReadinessStore.setState({
        ...(change === 'new session' ? { sessionId: 'replacement-session' } : {}),
        ...(change === 'interrupted' ? { interruptedAtMs: Date.now() } : {}),
        ...(change === 'low accuracy' ? { evidence: advanceReadiness(before.evidence, {
          latitude: 46.23501, longitude: -63.129, accuracyMeters: 40,
          speedMetersPerSecond: 0, capturedAtMs: Date.now(),
        }, Date.now()) } : {}),
        receipt: { ...receipt, sessionId: change === 'new session' ? 'replacement-session' : receipt.sessionId,
          expiresAtMs: Date.now() + 20_000 },
      }));
      expect(discoverNearbyCheckInPlaces).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    }
  );

  it('keeps check-in locked until return validation finishes', async () => {
    makeReady(90);
    useCheckInReadinessStore.setState({ interruptedAtMs: Date.now() - 1_000 });
    await mount();
    expect(byId('contextual-check-in-idle').props.accessibilityLabel).toContain('Here Confirming. Place Confirming.');
    expect(control().findAllByProps({ testID: 'check-in-ready-mark' })).toHaveLength(0);
    await press('contextual-check-in-idle');
    expect(control().findByType(Modal).props.visible).toBe(false);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('fails closed without server confirmation and does not manufacture eligibility', async () => {
    makeReady(30);
    useCheckInReadinessStore.setState({ receipt: null });
    await open();
    await press('private-place-entry');
    await press('continue-private-check-in');
    await act(async () => { jest.advanceTimersByTime(12_000); });
    expect(copy()).toContain('Location confirmation is taking longer than expected.');
    expect(createPrivateCheckInPlaceCandidate).not.toHaveBeenCalled();
    expect(bindCheckInReadiness).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(useCheckInReadinessStore.getState().grant).toBeNull();
  });

  it.each(['gathr_venue', 'external_place'] as const)('passes selected %s to privacy without consuming a grant', async (type) => {
    makeReady(90);
    const place = { ...publicPlace('public-candidate', 'Nearby place'), type };
    if (type === 'gathr_venue') {
      (listNearbyCanonicalCheckInVenues as jest.Mock).mockResolvedValue({ candidates: [place] });
      await open();
    } else {
      (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValue({ candidates: [place] });
      await search();
      // External lookup does not guess which business the user means.
      expect(byId('continue-public-check-in').props.disabled).toBe(true);
      act(() => placeRow('Nearby place').props.onPress());
    }
    expect(mockPush).not.toHaveBeenCalled();
    await press('continue-public-check-in');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/check-in', params: type === 'gathr_venue' ? {
      venueId: 'public-candidate', eligibleVenueIds: 'public-candidate', readinessSessionId: 'readiness-session',
      readinessVersion: '1', placeType: 'gathr_venue', placeName: 'Nearby place', placeAddress: '1 Main St',
    } : {
      placeCandidateId: 'public-candidate', placeType: 'external_place', placeName: 'Nearby place',
      placeAddress: '1 Main St', placeCategory: 'GathR venue', readinessSessionId: 'readiness-session', readinessVersion: '1',
    } });
    expect(bindCheckInReadiness).not.toHaveBeenCalled();
    expect(JSON.stringify(mockPush.mock.calls)).not.toMatch(/latitude|longitude|eligibilitySessionId/);
  });

  it('keeps a successful empty public lookup distinct from an outage', async () => {
    makeReady(90);
    await search();
    expect(copy()).toContain('No additional public places showed up nearby.');
    expect(copy()).not.toContain('could not be loaded');
    expect(control().findAllByProps({ testID: 'nearby-public-places-partial-notice' })).toHaveLength(0);
    expect(byId('continue-public-check-in').props.disabled).toBe(true);
  });

  it('keeps canonical venues available when external results are partially unavailable', async () => {
    makeReady(90);
    (listNearbyCanonicalCheckInVenues as jest.Mock).mockResolvedValue({ candidates: [publicPlace('known', 'Known venue')] });
    (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValue({ candidates: [], externalLookupStatus: 'partial_unavailable' });
    await open();
    expect(placeRow('Known venue').props.accessibilityState.selected).toBe(true);
    await press('find-somewhere-else');
    expect(byId('nearby-public-places-partial-notice')).toBeTruthy();
    expect(copy()).toContain('Your nearby GathR venues are still available.');
    let back = control().find((node) => node.type === Text && node.props.children === 'Nearby GathR venues');
    while (!back.props.onPress && back.parent) back = back.parent;
    await act(async () => back.props.onPress());
    expect(placeRow('Known venue').props.accessibilityState.selected).toBe(true);
  });

  it('shows specific retry copy for a typed external lookup outage', async () => {
    makeReady(90);
    (discoverNearbyCheckInPlaces as jest.Mock).mockRejectedValueOnce(new SocialServiceError('unavailable',
      'GathR social is temporarily unavailable. Try again when you are online.',
      { condition: 'nearby_public_places_external_lookup_unavailable', retryable: true }));
    await search();
    expect(copy()).toContain('Nearby public places could not be loaded. Your GathR venues are still available.');
    expect(copy()).not.toContain('when you are online');
    expect(byId('retry-nearby-public-places')).toBeTruthy();
  });

  it('retains the generic social/network message for an ordinary transport outage', async () => {
    makeReady(90);
    (discoverNearbyCheckInPlaces as jest.Mock).mockRejectedValueOnce(new SocialServiceError('unavailable',
      'GathR social is temporarily unavailable. Try again when you are online.'));
    await search();
    expect(copy()).toContain('GathR social is temporarily unavailable. Try again when you are online.');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('keeps explicit selection after confirmation times out and retries without rediscovery', async () => {
    makeReady(90);
    (listNearbyCanonicalCheckInVenues as jest.Mock).mockResolvedValue({ candidates: [publicPlace('grounds', 'Event Grounds')] });
    await open();
    act(() => useCheckInReadinessStore.setState({ receipt: null }));
    await press('continue-public-check-in');
    await act(async () => { jest.advanceTimersByTime(12_000); });
    expect(byId('check-in-selection-error')).toBeTruthy();
    expect(placeRow('Event Grounds').props.accessibilityState.selected).toBe(true);
    expect(byId('refresh-check-in-places')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    act(() => makeReady(90));
    await press('continue-public-check-in');
    expect(listNearbyCanonicalCheckInVenues).toHaveBeenCalledTimes(1);
    expect(discoverNearbyCheckInPlaces).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush.mock.calls[0][0].params.venueId).toBe('grounds');
  });

  it('does not open a modal or navigate when the outer ring automatically becomes ready', async () => {
    makeReady(90);
    useCheckInReadinessStore.setState({ lastPromptAtMs: 0 });
    await mount();
    expect(byId('check-in-readiness-explanation')).toBeTruthy();
    expect(control().findByType(Modal).props.visible).toBe(false);
    expect(mockPush).not.toHaveBeenCalled();
    expect(bindCheckInReadiness).not.toHaveBeenCalled();
    act(() => control().findByProps({ accessibilityLabel: 'Dismiss check-in hint' }).props.onPress());
    expect(control().findAllByProps({ testID: 'check-in-readiness-explanation' })).toHaveLength(0);
  });

  it('ignores a late private candidate after the user dismisses the flow', async () => {
    makeReady(30);
    let resolveCandidate!: (value: unknown) => void;
    (createPrivateCheckInPlaceCandidate as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { resolveCandidate = resolve; }));
    await open();
    await press('private-place-entry');
    await press('continue-private-check-in');
    act(() => control().findByType(Modal).props.onRequestClose());
    await act(async () => resolveCandidate({ candidate: {
      id: 'late-private', type: 'private_place', name: 'Home', latitude: 46.235, longitude: -63.129,
    } }));
    expect(mockPush).not.toHaveBeenCalled();
    expect(bindCheckInReadiness).not.toHaveBeenCalled();
    expect(useCheckInReadinessStore.getState().grant).toBeNull();
  });

  it('stays hidden while a map callout owns the interaction surface', async () => {
    await mount(false);
    expect(component!.toJSON()).toBeNull();
  });

  it('does not show an arrival hint while another screen is focused', async () => {
    makeReady(90);
    useCheckInReadinessStore.setState({ lastPromptAtMs: 0 });
    mockIsFocused.mockReturnValue(false);
    await mount();
    expect(control().findAllByProps({ testID: 'check-in-readiness-explanation' })).toHaveLength(0);
    expect(control().findByType(Modal).props.visible).toBe(false);
    expect(mockPush).not.toHaveBeenCalled();
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
        readinessSessionId: 'dwell-session',
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
        readinessSessionId: 'dwell-session',
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
        readinessSessionId: 'private-dwell',
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
