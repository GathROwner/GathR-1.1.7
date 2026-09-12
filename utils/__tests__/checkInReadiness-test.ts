import {
  advanceReadiness, canCollectReadiness, canDeliverArrivalNotification, CHECK_IN_READINESS,
  emptyReadiness, isFreshReadiness, mayPromptReadiness, mayShareExactPrivateLocation, pauseReadiness,
  type ReadinessPermissions, type ReadinessSample,
} from '../checkInReadiness';
import { readinessLevels, validBoundReadiness, validReadinessReceipt } from '../checkInReadinessContract';
import type { BoundCheckInReadiness, CheckInReadinessReceipt } from '../../types/social';

const start = 2_000_000_000_000;
const fix = (seconds: number, extra: Partial<ReadinessSample> = {}): ReadinessSample => ({
  latitude: 46.235, longitude: -63.129, accuracyMeters: 10, speedMetersPerSecond: 0,
  capturedAtMs: start + seconds * 1000, ...extra,
});
const dwell = (seconds: number, accuracyMeters = 10) => {
  let state = emptyReadiness();
  for (let time = 0; time <= seconds; time += 10) state = advanceReadiness(state, fix(time, { accuracyMeters }), start + time * 1000);
  return state;
};
const permissions: ReadinessPermissions = { mode: 'standard', foregroundGranted: true,
  backgroundGranted: false, notificationsGranted: false, backgroundSupported: false, appActive: true };

describe('real check-in readiness evidence', () => {
  it('requires two fresh fixes and crosses each threshold at 30 and 90 seconds', () => {
    expect(dwell(0)).toMatchObject({ hereMs: 0, placeMs: 0 });
    expect(dwell(20)).toMatchObject({ hereMs: 20_000, placeMs: 20_000 });
    expect(dwell(30)).toMatchObject({ hereMs: 30_000, placeMs: 30_000 });
    expect(dwell(80).placeMs).toBe(80_000);
    expect(dwell(90)).toMatchObject({ hereMs: 30_000, placeMs: 90_000 });
    expect(dwell(110).placeMs).toBe(90_000);
  });
  it('never credits a timer, repeated cached fix, future fix or stale gap', () => {
    const state = dwell(20);
    expect(advanceReadiness(state, fix(20), start + 25_000)).toBe(state);
    expect(advanceReadiness(state, fix(20), start + 50_000).hereMs).toBe(0);
    expect(advanceReadiness(state, fix(60), start + 60_000).hereMs).toBe(0);
    expect(advanceReadiness(state, fix(60), start + 30_000).hereMs).toBe(0);
    expect(isFreshReadiness(dwell(90), start + 111_000)).toBe(false);
  });
  it('uses different accuracy thresholds and never treats unknown accuracy as zero', () => {
    expect(dwell(90, 40)).toMatchObject({ hereMs: 30_000, placeMs: 0 });
    expect(dwell(90, 51)).toMatchObject({ hereMs: 0, placeMs: 0, reason: 'low_accuracy' });
    for (const accuracyMeters of [null, NaN, -1, Infinity]) {
      expect(advanceReadiness(dwell(30), fix(40, { accuracyMeters }), start + 40_000).hereMs).toBe(0);
    }
    const weak = advanceReadiness(dwell(30), fix(40, { accuracyMeters: 40 }), start + 40_000);
    expect(advanceReadiness(weak, fix(50), start + 50_000).placeMs).toBe(0);
  });
  it('resets walking and cumulative drift even when reported speed is absent', () => {
    const unknownFirst = advanceReadiness(emptyReadiness(), fix(0, { speedMetersPerSecond: null }), start);
    expect(unknownFirst).toMatchObject({ hereMs: 0, placeMs: 0 });
    expect(advanceReadiness(unknownFirst, fix(10, { speedMetersPerSecond: null }), start + 10_000))
      .toMatchObject({ hereMs: 10_000, placeMs: 10_000 });
    expect(advanceReadiness(dwell(90), fix(100, { speedMetersPerSecond: 1.2 }), start + 100_000))
      .toMatchObject({ hereMs: 0, placeMs: 0, reason: 'moving' });
    expect(advanceReadiness(dwell(90), fix(100, { latitude: 46.236, speedMetersPerSecond: null }), start + 100_000).reason).toBe('moving');
    let state = emptyReadiness();
    for (let i = 0; i <= 4; i++) state = advanceReadiness(state, fix(i * 10, { latitude: 46.235 + i * 0.00005, speedMetersPerSecond: null }), start + i * 10_000);
    expect(state.reason).toBe('moving');
  });
  it('suppresses a stoplight after driving and carries suppression across foreground pauses', () => {
    const driving = advanceReadiness(dwell(30), fix(40, { speedMetersPerSecond: 8 }), start + 40_000);
    const paused = pauseReadiness(driving);
    expect(advanceReadiness(paused, fix(60), start + 60_000)).toMatchObject({ hereMs: 0, placeMs: 0, reason: 'driving' });
    const resumed = advanceReadiness(paused, fix(80), start + 80_000);
    expect(resumed).toMatchObject({ hereMs: 0, placeMs: 0, reason: 'qualifying' });
  });
  it('clears readiness on background/basic and does not count time away', () => {
    const state = pauseReadiness(dwell(90));
    expect(state).toMatchObject({ hereMs: 0, placeMs: 0, previous: null });
    expect(advanceReadiness(state, fix(100), start + 100_000).hereMs).toBe(0);
    expect(advanceReadiness(dwell(90), fix(100), start + 100_000, false).reason).toBe('paused');
  });
});

describe('permission and prompt boundaries', () => {
  it('separates foreground, background support and notification permission', () => {
    expect(canCollectReadiness(permissions)).toBe(true);
    expect(canCollectReadiness({ ...permissions, foregroundGranted: false })).toBe(false);
    expect(canCollectReadiness({ ...permissions, mode: 'basic' })).toBe(false);
    expect(canCollectReadiness({ ...permissions, appActive: false })).toBe(false);
    const proactive = { ...permissions, mode: 'proactive' as const, appActive: false, backgroundGranted: true };
    expect(canCollectReadiness(proactive)).toBe(false);
    expect(canDeliverArrivalNotification({ ...proactive, notificationsGranted: true })).toBe(false);
    expect(canCollectReadiness({ ...proactive, backgroundSupported: true })).toBe(true);
    expect(canDeliverArrivalNotification({ ...proactive, backgroundSupported: true })).toBe(false);
    expect(canDeliverArrivalNotification({ ...proactive, backgroundSupported: true, notificationsGranted: true })).toBe(true);
  });
  it('prompts only for the outer ring with server approval, while visible, once per 24h', () => {
    expect(mayPromptReadiness(dwell(30), start + 30_000, 0, true, true)).toBe(false);
    expect(mayPromptReadiness(dwell(90), start + 90_000, 0, true, true)).toBe(true);
    expect(mayPromptReadiness(dwell(90), start + 90_000, 0, true, false)).toBe(false);
    expect(mayPromptReadiness(dwell(90), start + 90_000, 0, false, true)).toBe(false);
    expect(mayPromptReadiness(dwell(90), start + 90_000, start, true, true)).toBe(false);
    expect(mayPromptReadiness(dwell(90), start + 90_000, start + 90_000 - CHECK_IN_READINESS.promptCooldownMs, true, true)).toBe(true);
    expect(mayPromptReadiness(dwell(90), start + 120_000, 0, true, true)).toBe(false);
  });
});

const receipt: CheckInReadinessReceipt = { protocolVersion: 1, sessionId: 'readiness-session', sequence: 10,
  hereQualifyingMs: 30_000, placeQualifyingMs: 90_000, expiresAtMs: start + 105_000 };
const grant: BoundCheckInReadiness = { protocolVersion: 1, eligibilitySessionId: 'bound-session',
  readinessSessionId: 'readiness-session', placeCandidateId: 'private-candidate', locationType: 'private_place',
  exactPrivateAllowed: false, expiresAtMs: start + 200_000 };
const target = { type: 'private_place' as const, placeCandidateId: 'private-candidate' };
describe('server and privacy contracts', () => {
  it('never unlocks from client elapsed time, stale receipts or another session', () => {
    expect(readinessLevels(dwell(90), null, 'readiness-session', start + 90_000)).toEqual({ here: false, place: false });
    expect(readinessLevels(dwell(90), receipt, 'readiness-session', start + 90_000)).toEqual({ here: true, place: true });
    expect(readinessLevels(dwell(90), receipt, 'other-session', start + 90_000).here).toBe(false);
    expect(readinessLevels(dwell(90), receipt, 'readiness-session', start + 106_000).here).toBe(false);
    expect(validReadinessReceipt(receipt, 'readiness-session', 10, start + 90_000)).toBe(true);
    expect(validReadinessReceipt(receipt, 'readiness-session', 9, start + 90_000)).toBe(false);
    expect(validReadinessReceipt({ ...receipt, hereQualifyingMs: NaN }, 'readiness-session', 10, start + 90_000)).toBe(false);
  });
  it('binds only the requested target and rejects missing/expired/wrong-owner-session grants', () => {
    expect(validBoundReadiness(grant, target, 'readiness-session', start + 90_000)).toBe(true);
    expect(validBoundReadiness(null, target, 'readiness-session', start + 90_000)).toBe(false);
    expect(validBoundReadiness(grant, { ...target, placeCandidateId: 'other' }, 'readiness-session', start + 90_000)).toBe(false);
    expect(validBoundReadiness(grant, target, 'other-session', start + 90_000)).toBe(false);
    expect(validBoundReadiness(grant, target, 'readiness-session', start + 200_000)).toBe(false);
  });
  it('requires private place, stronger grant, selected friends AND an explicit exact switch', () => {
    const input = { isPrivatePlace: true, audienceMode: 'selected_friends', selectedFriendCount: 1, exactAllowed: true, explicitlyEnabled: true };
    expect(mayShareExactPrivateLocation(input)).toBe(true);
    expect(mayShareExactPrivateLocation({ ...input, exactAllowed: false })).toBe(false);
    expect(mayShareExactPrivateLocation({ ...input, explicitlyEnabled: false })).toBe(false);
    expect(mayShareExactPrivateLocation({ ...input, audienceMode: 'all_friends' })).toBe(false);
    expect(mayShareExactPrivateLocation({ ...input, selectedFriendCount: 0 })).toBe(false);
    expect(mayShareExactPrivateLocation({ ...input, isPrivatePlace: false })).toBe(false);
  });
});
