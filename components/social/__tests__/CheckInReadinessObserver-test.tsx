import * as Location from 'expo-location';
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { loadReadinessPreferences } from '../../../services/checkInReadinessPreferences';
import { recordCheckInReadinessSample } from '../../../services/socialService';
import { resetCheckInReadinessOwner, useCheckInReadinessStore } from '../../../store/checkInReadinessStore';
import type { CheckInReadinessSampleInput } from '../../../types/social';
import { CHECK_IN_READINESS } from '../../../utils/checkInReadiness';
import CheckInReadinessObserver from '../CheckInReadinessObserver';

let mockUid: string | null = 'observer-user';
let mockMode: 'standard' | 'basic' = 'standard';
let mockChangeState: (state: AppStateStatus) => void;
let mockOperationSequence = 0;
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUid ? { uid: mockUid } : null }) }));
jest.mock('../../../store/socialStore', () => ({ useSocialStore: (select: (state: { ownCheckIn: null }) => unknown) => select({ ownCheckIn: null }) }));
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

    await advance(CHECK_IN_READINESS.resumeRetryMs);
    expect(useCheckInReadinessStore.getState()).toMatchObject({
      sessionId: before.sessionId,
      interruptedAtMs: null,
      evidence: { hereMs: 11_000 },
    });
  });
  it('credits a longer interruption only after a fresh return fix matches the same anchor', async () => {
    await mount();
    await advance(10_000);
    const sessionId = useCheckInReadinessStore.getState().sessionId;
    act(() => { AppState.currentState = 'background'; mockChangeState('background'); });
    await advance(91_000);
    expect(useCheckInReadinessStore.getState().evidence.hereMs).toBe(10_000);
    await act(async () => { AppState.currentState = 'active'; mockChangeState('active'); });
    expect(useCheckInReadinessStore.getState()).toMatchObject({
      appActive: true,
      interruptedAtMs: null,
      evidence: { hereMs: 30_000, placeMs: 90_000 },
    });
    expect(useCheckInReadinessStore.getState().sessionId).toBe(sessionId);
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
});
