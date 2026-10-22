import * as Location from 'expo-location';
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { loadReadinessPreferences } from '../../../services/checkInReadinessPreferences';
import { recordCheckInReadinessSample } from '../../../services/socialService';
import { resetCheckInReadinessOwner, useCheckInReadinessStore } from '../../../store/checkInReadinessStore';
import type { CheckInReadinessSampleInput } from '../../../types/social';
import { CHECK_IN_READINESS } from '../../../utils/checkInReadiness';
import { readinessLevels } from '../../../utils/checkInReadinessContract';
import { useMapStore } from '../../../store/mapStore';
import CheckInReadinessObserver from '../CheckInReadinessObserver';

let mockUid: string | null = 'observer-user';
let mockMode: 'standard' | 'basic' = 'standard';
let mockChangeState: (state: AppStateStatus) => void;
let mockOperationSequence = 0;
let mockPathname = '/(tabs)/events';
jest.mock('expo-router', () => ({ usePathname: () => mockPathname }));
// Real subscription behavior, without loading the native map or its I/O.
jest.mock('../../../store/mapStore', () => ({
  useMapStore: jest.requireActual('zustand').create(() => ({
    hasInitialViewportSettled: true,
    userLocation: null,
  })),
}));
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUid ? { uid: mockUid } : null }) }));
jest.mock('../../../store/socialStore', () => ({
  useSocialStore: Object.assign(
    (select: (state: { ownCheckIn: null }) => unknown) => select({ ownCheckIn: null }),
    { getState: () => ({ ownCheckIn: null }) }
  ),
}));
jest.mock('../../../types/social', () => ({ SOCIAL_FEATURE_ENABLED: true, SOCIAL_RELEASE_TWO_ENABLED: true }));
jest.mock('../../../services/checkInReadinessPreferences', () => ({ loadReadinessPreferences: jest.fn() }));
jest.mock('../../../services/socialService', () => ({
  createSocialOperationId: () => `session-${++mockOperationSequence}`,
  recordCheckInReadinessSample: jest.fn(),
}));
jest.mock('expo-location', () => ({
  Accuracy: { High: 4 }, getForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(), requestBackgroundPermissionsAsync: jest.fn(),
}));

describe('foreground readiness observer lifecycle', () => {
  let component: renderer.ReactTestRenderer | null;
  const originalAppState = AppState.currentState;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(2_000_000_000_000);
    component = null;
    mockUid = 'observer-user';
    mockMode = 'standard';
    mockOperationSequence = 0;
    mockPathname = '/(tabs)/events';
    useMapStore.setState({ hasInitialViewportSettled: true, userLocation: null });
    AppState.currentState = 'active';
    resetCheckInReadinessOwner(null);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
      mockChangeState = callback as (state: AppStateStatus) => void;
      return { remove: jest.fn() };
    });
    (loadReadinessPreferences as jest.Mock).mockImplementation(async () => {
      useCheckInReadinessStore.setState({ preferencesLoaded: true, mode: mockMode });
    });
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Location.getCurrentPositionAsync as jest.Mock).mockImplementation(async () => ({
      timestamp: Date.now(), coords: { latitude: 46.235, longitude: -63.129, accuracy: 10, speed: 0 },
    }));
    (recordCheckInReadinessSample as jest.Mock).mockImplementation(async (input: CheckInReadinessSampleInput) => ({
      protocolVersion: 1, sessionId: input.sessionId, sequence: input.sequence,
      hereQualifyingMs: input.reset ? 0 : Math.min(30_000, (input.sequence - 1) * 10_000),
      placeQualifyingMs: input.reset ? 0 : Math.min(90_000, (input.sequence - 1) * 10_000),
      expiresAtMs: Date.now() + 20_000,
    }));
  });
  afterEach(() => {
    if (component) act(() => component!.unmount());
    AppState.currentState = originalAppState;
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });
  const mount = async () => { await act(async () => { component = renderer.create(<CheckInReadinessObserver />); }); };
  const advance = async (milliseconds: number) => { await act(async () => { jest.advanceTimersByTime(milliseconds); }); };

  it('samples before any place selection and requests no permissions or check-in mutation', async () => {
    await mount();
    await advance(10_000);
    expect(recordCheckInReadinessSample).toHaveBeenCalledTimes(2);
    const input = (recordCheckInReadinessSample as jest.Mock).mock.calls[1][0];
    expect(input).toMatchObject({ protocolVersion: 1, sequence: 2, reset: false });
    expect(input).not.toHaveProperty('venueId');
    expect(input).not.toHaveProperty('placeCandidateId');
    expect(input).not.toHaveProperty('qualifyingMs');
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
    expect(useCheckInReadinessStore.getState().evidence.hereMs).toBe(10_000);
    expect(useCheckInReadinessStore.getState().grant).toBeNull();
  });
  it('feeds time-ordered jitter, accuracy wobble, and movement into the real readiness reducer', async () => {
    const origin = Date.now();
    const fixes = [
      { capturedAtMs: origin, latitude: 46.235, longitude: -63.129, accuracy: 10, speed: 0.2 },
      { capturedAtMs: origin + 9_500, latitude: 46.23504, longitude: -63.12897, accuracy: 18, speed: 0.2 },
      { capturedAtMs: origin + 19_800, latitude: 46.23497, longitude: -63.12902, accuracy: 30, speed: null },
      { capturedAtMs: origin + 29_200, latitude: 46.23502, longitude: -63.12898, accuracy: 17, speed: 0.4 },
      { capturedAtMs: origin + 40_000, latitude: 46.23498, longitude: -63.12901, accuracy: 12, speed: 0.3 },
      { capturedAtMs: origin + 49_700, latitude: 46.23505, longitude: -63.129, accuracy: 18, speed: 1.2 },
    ];
    let fixIndex = 0;
    (Location.getCurrentPositionAsync as jest.Mock).mockImplementation(async () => {
      const next = fixes[fixIndex++];
      return { timestamp: next.capturedAtMs, coords: {
        latitude: next.latitude, longitude: next.longitude, accuracy: next.accuracy, speed: next.speed,
      } };
    });

    await mount();
    for (let index = 0; index < fixes.length - 1; index += 1) await advance(10_000);

    const inputs = (recordCheckInReadinessSample as jest.Mock).mock.calls.map(([input]) => input as CheckInReadinessSampleInput);
    expect(inputs).toHaveLength(fixes.length);
    expect(inputs.map(({ capturedAtMs }) => capturedAtMs)).toEqual(fixes.map(({ capturedAtMs }) => capturedAtMs));
    expect(inputs[1].latitude).not.toBe(inputs[0].latitude);
    expect(inputs[2]).toMatchObject({ accuracyMeters: 30, speedMetersPerSecond: null, reset: false });
    expect(inputs[4]).toMatchObject({ accuracyMeters: 12, speedMetersPerSecond: 0.3, reset: false });
    expect(inputs[5]).toMatchObject({ accuracyMeters: 18, speedMetersPerSecond: 1.2, reset: true, sequence: 1 });
    expect(useCheckInReadinessStore.getState()).toMatchObject({
      sessionId: 'session-2', evidence: { hereMs: 0, placeMs: 0, reason: 'moving' },
    });
  });
  it('pauses GPS and readiness calls while privacy has a bound place, including short inactive pauses', async () => {
    await mount();
    const grant = { protocolVersion: 1 as const, readinessSessionId: 'bound-session',
      eligibilitySessionId: 'bound-session', venueId: 'venue-1', locationType: 'gathr_venue' as const,
      exactPrivateAllowed: false, expiresAtMs: Date.now() + 300000 };
    await act(async () => useCheckInReadinessStore.setState({ grant }));
    const calls = (Location.getCurrentPositionAsync as jest.Mock).mock.calls.length;
    const posts = (recordCheckInReadinessSample as jest.Mock).mock.calls.length;
    await advance(30000);
    act(() => { AppState.currentState = 'inactive'; mockChangeState('inactive'); });
    await advance(10000);
    await act(async () => { AppState.currentState = 'active'; mockChangeState('active'); });
    await advance(30000);
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(calls);
    expect(recordCheckInReadinessSample).toHaveBeenCalledTimes(posts);
    expect(useCheckInReadinessStore.getState().grant).toEqual(grant);
    await act(async () => useCheckInReadinessStore.setState({ grant: null }));
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(calls + 1);
  });
  it('requires a fresh location after returning from a long pause with an expired bound place', async () => {
    await mount();
    await act(async () => useCheckInReadinessStore.setState({ grant: { protocolVersion: 1,
      readinessSessionId: 'bound-session', eligibilitySessionId: 'bound-session', venueId: 'venue-1',
      locationType: 'gathr_venue', exactPrivateAllowed: false, expiresAtMs: Date.now() + 300000 } }));
    const calls = (Location.getCurrentPositionAsync as jest.Mock).mock.calls.length;
    act(() => { AppState.currentState = 'background'; mockChangeState('background'); });
    await advance(301000);
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(calls);
    await act(async () => { AppState.currentState = 'active'; mockChangeState('active'); });
    expect(useCheckInReadinessStore.getState().grant).toBeNull();
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(calls + 1);
  });
  it('does not collect in basic mode or when foreground permission is denied', async () => {
    mockMode = 'basic';
    await mount();
    await advance(60_000);
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(recordCheckInReadinessSample).not.toHaveBeenCalled();
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    await act(async () => useCheckInReadinessStore.setState({ mode: 'standard' }));
    await advance(10_000);
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
  it('preserves readiness through a short background interruption and verifies the elapsed gap on return', async () => {
    await mount();
    await advance(10_000);
    const before = useCheckInReadinessStore.getState();
    act(() => { AppState.currentState = 'background'; mockChangeState('background'); });
    expect(useCheckInReadinessStore.getState()).toMatchObject({
      receipt: before.receipt,
      sessionId: before.sessionId,
      appActive: false,
      evidence: { hereMs: 10_000 },
    });
    const calls = (recordCheckInReadinessSample as jest.Mock).mock.calls.length;
    await advance(5_000);
    expect(recordCheckInReadinessSample).toHaveBeenCalledTimes(calls);
    await act(async () => { AppState.currentState = 'active'; mockChangeState('active'); });
    expect(useCheckInReadinessStore.getState()).toMatchObject({
      sessionId: before.sessionId,
      appActive: true,
      evidence: { hereMs: 15_000 },
    });
  });
  it('retries a cached return fix after a screenshot-sized interruption instead of resetting progress', async () => {
    await mount();
    await advance(10_000);
    const before = useCheckInReadinessStore.getState();
    act(() => { AppState.currentState = 'inactive'; mockChangeState('inactive'); });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValueOnce({
      timestamp: before.evidence.previous!.capturedAtMs,
      coords: { latitude: 46.235, longitude: -63.129, accuracy: 10, speed: 0 },
    });

    await act(async () => { AppState.currentState = 'active'; mockChangeState('active'); });
    expect(useCheckInReadinessStore.getState()).toMatchObject({
      sessionId: before.sessionId,
      interruptedAtMs: expect.any(Number),
      evidence: { hereMs: 10_000 },
    });

    const calls = (Location.getCurrentPositionAsync as jest.Mock).mock.calls.length;
    await advance(CHECK_IN_READINESS.resumeRetryMs);
    // Every retry uses at least the accepted 2s sampling interval.
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(calls);
    expect(useCheckInReadinessStore.getState().interruptedAtMs).not.toBeNull();
    await advance(CHECK_IN_READINESS.nearReadySampleIntervalMs - CHECK_IN_READINESS.resumeRetryMs);
    expect(useCheckInReadinessStore.getState()).toMatchObject({
      sessionId: before.sessionId,
      interruptedAtMs: null,
      evidence: { hereMs: 12_000 },
    });
  });
  it('credits a longer interruption only after a fresh return fix matches the same anchor', async () => {
    (recordCheckInReadinessSample as jest.Mock).mockImplementation(async (input: CheckInReadinessSampleInput) => {
      const evidence = useCheckInReadinessStore.getState().evidence;
      return {
        protocolVersion: 1, sessionId: input.sessionId, sequence: input.sequence,
        hereQualifyingMs: evidence.hereMs, placeQualifyingMs: evidence.placeMs,
        expiresAtMs: Date.now() + 20_000,
      };
    });
    await mount();
    await advance(10_000);
    const before = useCheckInReadinessStore.getState();
    act(() => { AppState.currentState = 'background'; mockChangeState('background'); });
    await advance(91_000);
    expect(useCheckInReadinessStore.getState().evidence.hereMs).toBe(10_000);
    await act(async () => { AppState.currentState = 'active'; mockChangeState('active'); });
    const resumed = useCheckInReadinessStore.getState();
    expect(resumed).toMatchObject({
      appActive: true,
      interruptedAtMs: null,
      evidence: { hereMs: 30_000, placeMs: 90_000 },
    });
    expect(resumed.sessionId).toBe(before.sessionId);
    expect(readinessLevels(resumed.evidence, resumed.receipt, resumed.sessionId, Date.now()))
      .toEqual({ here: true, place: true });
  });
  it('starts the next sample ten seconds after the GPS fix, including server time', async () => {
    (recordCheckInReadinessSample as jest.Mock).mockImplementationOnce(async (input: CheckInReadinessSampleInput) => {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      return {
        protocolVersion: 1, sessionId: input.sessionId, sequence: input.sequence,
        hereQualifyingMs: 0, placeQualifyingMs: 0, expiresAtMs: Date.now() + 20_000,
      };
    });
    await mount();
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    await advance(3_000);
    await advance(6_999);
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(2);
  });
  it('waits through transient return drift, then resets a sustained displacement', async () => {
    await mount();
    await advance(10_000);
    const sessionId = useCheckInReadinessStore.getState().sessionId;
    act(() => { AppState.currentState = 'background'; mockChangeState('background'); });
    await advance(30_000);
    (Location.getCurrentPositionAsync as jest.Mock).mockImplementation(async () => ({
      timestamp: Date.now(), coords: { latitude: 46.24, longitude: -63.129, accuracy: 10, speed: 0 },
    }));
    await act(async () => { AppState.currentState = 'active'; mockChangeState('active'); });
    expect(useCheckInReadinessStore.getState()).toMatchObject({
      sessionId,
      interruptedAtMs: expect.any(Number),
      evidence: { hereMs: 10_000 },
    });
    await advance(CHECK_IN_READINESS.resumeValidationGraceMs);
    expect(useCheckInReadinessStore.getState()).toMatchObject({ interruptedAtMs: null, evidence: { hereMs: 0 } });
    expect(useCheckInReadinessStore.getState().sessionId).not.toBe(sessionId);
    const reset = useCheckInReadinessStore.getState();
    expect(readinessLevels(reset.evidence, reset.receipt, reset.sessionId, Date.now()))
      .toEqual({ here: false, place: false });
  });
  it('ignores a location result delivered after sign-out', async () => {
    let resolveFix: (value: unknown) => void = () => undefined;
    (Location.getCurrentPositionAsync as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { resolveFix = resolve; }));
    await mount();
    await act(async () => { mockUid = null; component!.update(<CheckInReadinessObserver />); });
    await act(async () => { resolveFix({ timestamp: Date.now(), coords: { latitude: 46.235, longitude: -63.129, accuracy: 10, speed: 0 } }); });
    expect(recordCheckInReadinessSample).not.toHaveBeenCalled();
    expect(useCheckInReadinessStore.getState()).toMatchObject({ uid: null, grant: null, receipt: null });
  });
  it('does not unlock when a server endpoint is missing or returns a receipt for another session', async () => {
    (recordCheckInReadinessSample as jest.Mock).mockRejectedValueOnce(new Error('not-found'));
    await mount();
    expect(useCheckInReadinessStore.getState()).toMatchObject({ serviceError: true, receipt: null });
    (recordCheckInReadinessSample as jest.Mock).mockResolvedValueOnce({ protocolVersion: 1, sessionId: 'other-session', sequence: 2,
      hereQualifyingMs: 30_000, placeQualifyingMs: 90_000, expiresAtMs: Date.now() + 20_000 });
    await advance(10_000);
    expect(useCheckInReadinessStore.getState().receipt).toBeNull();
  });

  it('waits for the initial viewport before collecting during map startup', async () => {
    mockPathname = '/(tabs)/map';
    useMapStore.setState({ hasInitialViewportSettled: false });
    await mount();
    await advance(30_000);
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(recordCheckInReadinessSample).not.toHaveBeenCalled();
    await act(async () => useMapStore.setState({ hasInitialViewportSettled: true }));
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    expect(recordCheckInReadinessSample).toHaveBeenCalledTimes(1);
  });

  it('reuses a fresh accurate shared location without a second GPS request', async () => {
    const location = { timestamp: Date.now(), coords: {
      latitude: 46.235, longitude: -63.129, accuracy: 10, speed: 0, altitude: null, altitudeAccuracy: null, heading: null,
    } };
    useMapStore.setState({ userLocation: location });
    await mount();
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(recordCheckInReadinessSample).toHaveBeenCalledTimes(1);
    expect(recordCheckInReadinessSample).toHaveBeenCalledWith(expect.objectContaining({
      capturedAtMs: location.timestamp, accuracyMeters: 10, sequence: 1,
    }), expect.anything());
  });

  it('accepts a shared location during a pending fallback and ignores the later fallback result', async () => {
    let resolveFallback!: (location: unknown) => void;
    (Location.getCurrentPositionAsync as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { resolveFallback = resolve; }));
    await mount();
    expect(recordCheckInReadinessSample).not.toHaveBeenCalled();
    await act(async () => useMapStore.setState({ userLocation: { timestamp: Date.now(), coords: {
      latitude: 46.235, longitude: -63.129, accuracy: 10, speed: 0, altitude: null, altitudeAccuracy: null, heading: null,
    } } }));
    expect(recordCheckInReadinessSample).toHaveBeenCalledTimes(1);
    const sessionId = useCheckInReadinessStore.getState().sessionId;
    await act(async () => resolveFallback({ timestamp: Date.now() - 1_000, coords: {
      latitude: 46.24, longitude: -63.129, accuracy: 10, speed: 2,
    } }));
    expect(recordCheckInReadinessSample).toHaveBeenCalledTimes(1);
    expect(useCheckInReadinessStore.getState().sessionId).toBe(sessionId);
  });

  it('keeps listening for a fresh map fix after the one-shot location request fails', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValueOnce(new Error('Location temporarily unavailable'));
    await mount();
    await advance(1_000);
    await act(async () => useMapStore.setState({ userLocation: { timestamp: Date.now(), coords: {
      latitude: 46.08954, longitude: -64.77345, accuracy: 18, speed: 0,
      altitude: null, altitudeAccuracy: null, heading: null,
    } } }));
    expect(recordCheckInReadinessSample).toHaveBeenCalledTimes(1);
    expect(useCheckInReadinessStore.getState().serviceError).toBe(false);
  });

  it('does not let a cached one-shot result discard a newer shared map fix', async () => {
    await mount();
    const first = useCheckInReadinessStore.getState().evidence.previous!;
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValueOnce({
      timestamp: first.capturedAtMs, coords: { latitude: first.latitude, longitude: first.longitude, accuracy: 10, speed: 0 },
    });
    await advance(10_000);
    await advance(1_000);
    await act(async () => useMapStore.setState({ userLocation: { timestamp: Date.now(), coords: {
      latitude: first.latitude, longitude: first.longitude, accuracy: 14, speed: 0,
      altitude: null, altitudeAccuracy: null, heading: null,
    } } }));
    expect(recordCheckInReadinessSample).toHaveBeenCalledTimes(2);
    expect(useCheckInReadinessStore.getState().evidence.hereMs).toBe(11_000);
  });

  it('retries after a location request never resolves without inventing location evidence', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockImplementationOnce(() => new Promise(() => undefined));
    await mount();
    await advance(8_000);
    expect(recordCheckInReadinessSample).not.toHaveBeenCalled();
    expect(useCheckInReadinessStore.getState().evidence.hereMs).toBe(0);
    await advance(2_000);
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(2);
    expect(recordCheckInReadinessSample).toHaveBeenCalledTimes(1);
    expect(useCheckInReadinessStore.getState().evidence.hereMs).toBe(0);
  });

  it('ignores the first location result after its deadline and a successful retry', async () => {
    let finishOld: (location: unknown) => void = () => undefined;
    (Location.getCurrentPositionAsync as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
    await mount();
    await advance(8_000);
    await advance(2_000);
    const accepted = useCheckInReadinessStore.getState();
    expect(recordCheckInReadinessSample).toHaveBeenCalledTimes(1);
    await act(async () => finishOld({ timestamp: Date.now(), coords: {
      latitude: 46.24, longitude: -63.129, accuracy: 10, speed: 3,
    } }));
    expect(recordCheckInReadinessSample).toHaveBeenCalledTimes(1);
    expect(useCheckInReadinessStore.getState().evidence).toEqual(accepted.evidence);
    expect(useCheckInReadinessStore.getState().sessionId).toBe(accepted.sessionId);
  });

  it('cancels location retries while the app is backgrounded', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValueOnce(new Error('Location temporarily unavailable'));
    await mount();
    act(() => { AppState.currentState = 'background'; mockChangeState('background'); });
    await advance(10_000);
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(1);
    expect(recordCheckInReadinessSample).not.toHaveBeenCalled();
    await act(async () => { AppState.currentState = 'active'; mockChangeState('active'); });
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledTimes(2);
    expect(recordCheckInReadinessSample).toHaveBeenCalledTimes(1);
  });
});
