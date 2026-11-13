import {
  advanceReadiness, canCollectReadiness, canDeliverArrivalNotification, CHECK_IN_READINESS,
  emptyReadiness, isFreshReadiness, mayOfferExactPrivateLocation, mayPromptReadiness, mayShareExactPrivateLocation, pauseReadiness,
  projectedReadinessMs, readinessDistance, readinessResumeDecision,
  type ReadinessPermissions, type ReadinessSample, type ReadinessState,
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
  it('accumulates a time-ordered stationary jitter sequence with changing accuracy and speed', () => {
    const times = [0, 9.8, 20.1, 29.7, 40.3, 50, 60.2, 70, 80.4, 90];
    const latitudeOffsets = [0, 0.00004, -0.00003, 0.00006, -0.00002, 0.00003, -0.00005, 0.00002, 0.00005, -0.00001];
    const longitudeOffsets = [0, 0.00005, -0.00004, 0.00002, -0.00006, 0.00003, 0.00004, -0.00002, 0.00001, -0.00005];
    const accuracies = [12, 18, 23, 16, 25, 14, 22, 16, 24, 20];
    const speeds = [0.2, 0.3, 0.4, 0.2, 0.5, null, 0.1, 0.6, 0.3, 0.2];
    let state = emptyReadiness();

    for (let index = 0; index < times.length; index += 1) {
      const sample = fix(times[index], {
        latitude: 46.235 + latitudeOffsets[index],
        longitude: -63.129 + longitudeOffsets[index],
        accuracyMeters: accuracies[index],
        speedMetersPerSecond: speeds[index],
      });
      state = advanceReadiness(state, sample, sample.capturedAtMs + 250);
    }

    expect(state).toMatchObject({ hereMs: 30_000, placeMs: 90_000, reason: 'qualifying', revision: 0 });
    expect(readinessDistance(state.anchor!, state.previous!)).toBeLessThan(CHECK_IN_READINESS.stationaryRadiusMetres);
  });
  it('pauses evidence through accuracy wobble without crediting uncertain endpoints', () => {
    const times = [0, 10, 20, 31, 40, 50, 60, 70, 80, 90, 100];
    const accuracies = [10, 18, 28, 12, 16, 24, 28, 14, 15, 20, 52];
    const speeds = [0.2, 0.2, 0.4, 0.1, 0, 0.5, 0.4, 0.2, null, 0.3, 0.1];
    let state = emptyReadiness();
    const snapshots = new Map<number, ReadinessState>();

    for (let index = 0; index < times.length; index += 1) {
      const sample = fix(times[index], {
        latitude: 46.235 + (index % 2 === 0 ? 0.00002 : -0.00003),
        longitude: -63.129 + (index % 3 === 0 ? 0.00002 : -0.00001),
        accuracyMeters: accuracies[index],
        speedMetersPerSecond: speeds[index],
      });
      state = advanceReadiness(state, sample, sample.capturedAtMs + 175);
      snapshots.set(times[index], state);
    }

    expect(snapshots.get(20)).toMatchObject({ hereMs: 20_000, placeMs: 10_000, reason: 'qualifying' });
    expect(snapshots.get(50)).toMatchObject({ hereMs: 30_000, placeMs: 29_000, reason: 'qualifying' });
    expect(snapshots.get(90)).toMatchObject({ hereMs: 30_000, placeMs: 49_000, reason: 'qualifying' });
    expect(state).toMatchObject({ hereMs: 30_000, placeMs: 49_000, reason: 'low_accuracy', revision: 0 });
  });
  it('resets both rings while moving toward and away from an adjacent candidate, even within 20 m', () => {
    const ready = dwell(30);
    const towardNeighbor = fix(40, { latitude: 46.23504, accuracyMeters: 17, speedMetersPerSecond: 1.2 });
    const moving = advanceReadiness(ready, towardNeighbor, towardNeighbor.capturedAtMs + 200);
    expect(moving).toMatchObject({ hereMs: 0, placeMs: 0, reason: 'moving', anchor: null, previous: null });

    const backTowardStart = fix(50, { latitude: 46.235, accuracyMeters: 12, speedMetersPerSecond: 0.9 });
    const returning = advanceReadiness(moving, backTowardStart, backTowardStart.capturedAtMs + 200);
    expect(returning).toMatchObject({ hereMs: 0, placeMs: 0, reason: 'moving', anchor: null, previous: null });

    const settled = fix(60, { latitude: 46.23501, accuracyMeters: 19, speedMetersPerSecond: 0.2 });
    const restarted = advanceReadiness(returning, settled, settled.capturedAtMs + 200);
    const next = fix(70, { latitude: 46.23502, accuracyMeters: 18, speedMetersPerSecond: 0.3 });
    expect(advanceReadiness(restarted, next, next.capturedAtMs + 200))
      .toMatchObject({ hereMs: 10_000, placeMs: 10_000, reason: 'qualifying' });
  });
  it('accepts the maximum sample gap, restarts after a larger gap, and validates a fresh resume fix', () => {
    const progress = dwell(30);
    const atMaximumGap = fix(50, { latitude: 46.23502, accuracyMeters: 18, speedMetersPerSecond: 0.2 });
    const continued = advanceReadiness(progress, atMaximumGap, atMaximumGap.capturedAtMs + 250);
    expect(continued).toMatchObject({ hereMs: 30_000, placeMs: 50_000, reason: 'qualifying' });

    const afterLargeGap = fix(55, { latitude: 46.23503, accuracyMeters: 22, speedMetersPerSecond: 0.3 });
    const restarted = advanceReadiness(progress, afterLargeGap, afterLargeGap.capturedAtMs + 250);
    expect(restarted).toMatchObject({ hereMs: 0, placeMs: 0, reason: 'qualifying', revision: progress.revision + 1,
      anchor: afterLargeGap, previous: afterLargeGap });

    const resumedSample = fix(85, { latitude: 46.23506, longitude: -63.12902, accuracyMeters: 20, speedMetersPerSecond: 0.4 });
    expect(readinessResumeDecision(restarted, resumedSample, resumedSample.capturedAtMs + 250)).toBe('accept');
    const resumed = advanceReadiness(restarted, resumedSample, resumedSample.capturedAtMs + 250, true,
      CHECK_IN_READINESS.maxResumeGapMs);
    expect(resumed).toMatchObject({ hereMs: 30_000, placeMs: 30_000, reason: 'qualifying' });

    const expiredReturn = fix(386, { latitude: 46.23505, accuracyMeters: 18, speedMetersPerSecond: 0.2 });
    expect(readinessResumeDecision(resumed, expiredReturn, expiredReturn.capturedAtMs + 250)).toBe('reset');
  });
  it('never credits a timer, repeated cached fix, future fix or stale gap', () => {
    const state = dwell(20);
    expect(advanceReadiness(state, fix(20), start + 25_000)).toBe(state);
    expect(advanceReadiness(state, fix(20), start + 50_000).hereMs).toBe(0);
    expect(advanceReadiness(state, fix(60), start + 60_000).hereMs).toBe(0);
    expect(advanceReadiness(state, fix(60), start + 30_000).hereMs).toBe(0);
    expect(isFreshReadiness(dwell(90), start + 111_000)).toBe(false);
  });
  it('projects smooth ring presentation only inside the accepted evidence gap', () => {
    const state = dwell(10);
    expect(projectedReadinessMs(state, start + 10_250)).toEqual({ hereMs: 10_250, placeMs: 10_250 });
    expect(projectedReadinessMs(state, start + 15_000)).toEqual({ hereMs: 15_000, placeMs: 15_000 });
    expect(projectedReadinessMs(state, start + 40_000)).toEqual({ hereMs: 30_000, placeMs: 30_000 });
    expect(projectedReadinessMs(state, start + 100_000, CHECK_IN_READINESS.maxResumeGapMs))
      .toEqual({ hereMs: 30_000, placeMs: 90_000 });
    expect(state).toMatchObject({ hereMs: 10_000, placeMs: 10_000 });
    expect(projectedReadinessMs({ ...state, reason: 'paused' }, start + 15_000))
      .toEqual({ hereMs: 10_000, placeMs: 10_000 });
    expect(projectedReadinessMs({ ...state, placeMs: 0,
      previous: { ...state.previous!, accuracyMeters: 40 } }, start + 15_000))
      .toEqual({ hereMs: 15_000, placeMs: 0 });
  });
  it('accepts a matching return fix, retries noisy drift, and expires old interruptions', () => {
    const state = dwell(10);
    expect(readinessResumeDecision(state, fix(100), start + 100_000)).toBe('accept');
    expect(readinessResumeDecision(state, fix(10), start + 10_100)).toBe('retry');
    expect(readinessResumeDecision(state, fix(100, { latitude: 46.236 }), start + 100_000)).toBe('retry');
    expect(readinessResumeDecision(state, fix(100, { accuracyMeters: 40 }), start + 100_000)).toBe('retry');
    expect(readinessResumeDecision(state, fix(100, { speedMetersPerSecond: 8 }), start + 100_000)).toBe('reset');
    expect(readinessResumeDecision(state, fix(311), start + 311_000)).toBe('reset');
  });
  it('allows a longer checkout return only when a fresh fix still matches the saved anchor', () => {
    const ready = dwell(90);
    const afterAnHour = fix(3_690, { accuracyMeters: 18, speedMetersPerSecond: 0.2 });
    expect(readinessResumeDecision(ready, afterAnHour, afterAnHour.capturedAtMs + 250)).toBe('reset');
    expect(readinessResumeDecision(ready, afterAnHour, afterAnHour.capturedAtMs + 250,
      CHECK_IN_READINESS.maxCheckInResumeGapMs)).toBe('accept');

    const moved = fix(3_690, { latitude: 46.236, accuracyMeters: 18, speedMetersPerSecond: 0.2 });
    expect(readinessResumeDecision(ready, moved, moved.capturedAtMs + 250,
      CHECK_IN_READINESS.maxCheckInResumeGapMs)).toBe('retry');

    const tooLate = fix(7_891, { accuracyMeters: 18, speedMetersPerSecond: 0.2 });
    expect(readinessResumeDecision(ready, tooLate, tooLate.capturedAtMs + 250,
      CHECK_IN_READINESS.maxCheckInResumeGapMs)).toBe('reset');
  });
  it('uses different accuracy thresholds and never treats unknown accuracy as zero', () => {
    expect(dwell(90, 40)).toMatchObject({ hereMs: 30_000, placeMs: 0 });
    expect(dwell(90, 51)).toMatchObject({ hereMs: 0, placeMs: 0, reason: 'low_accuracy' });
    for (const accuracyMeters of [null, NaN, -1, Infinity]) {
      const uncertain = advanceReadiness(dwell(30), fix(40, { accuracyMeters }), start + 40_000);
      expect(uncertain.hereMs).toBe(30_000);
      expect(isFreshReadiness(uncertain, start + 40_000)).toBe(false);
    }
    const weak = advanceReadiness(dwell(30), fix(40, { accuracyMeters: 40 }), start + 40_000);
    expect(advanceReadiness(weak, fix(50), start + 50_000).placeMs).toBe(30_000);
  });
  it('eventually prepares a stationary user despite intermittent 26m accuracy without crediting weak intervals', () => {
    let state = emptyReadiness();
    for (let seconds = 0; seconds <= 300; seconds += 10) {
      const sample = fix(seconds, { accuracyMeters: seconds % 50 === 40 ? 26 : 17 });
      state = advanceReadiness(state, sample, sample.capturedAtMs);
    }
    expect(state).toMatchObject({ hereMs: 30_000, placeMs: 90_000, revision: 0 });
  });
  it('expires retained Here and Place after five total minutes of uncertainty, not five minutes between bad fixes', () => {
    let unknown = dwell(30);
    let weak = dwell(30);
    for (let seconds = 40; seconds <= 340; seconds += 10) {
      unknown = advanceReadiness(unknown, fix(seconds, { accuracyMeters: 80 }), start + seconds * 1000);
      weak = advanceReadiness(weak, fix(seconds, { accuracyMeters: 40 }), start + seconds * 1000);
    }
    expect(unknown).toMatchObject({ hereMs: 0, placeMs: 0, reason: 'low_accuracy' });
    expect(weak).toMatchObject({ hereMs: 30_000, placeMs: 0 });
  });
  it('does not infer movement from a wildly inaccurate prior fix when speed is unavailable', () => {
    const ready = dwell(30);
    const uncertain = advanceReadiness(ready, fix(40, { latitude: 46.237, accuracyMeters: 200 }), start + 40_000);
    const returnFix = fix(50, { accuracyMeters: 17, speedMetersPerSecond: null });
    const returned = advanceReadiness(uncertain, returnFix, returnFix.capturedAtMs);
    expect(returned).toMatchObject({ hereMs: 30_000, placeMs: 30_000, reason: 'qualifying', revision: ready.revision });
    const next = fix(60, { accuracyMeters: 17, speedMetersPerSecond: null });
    expect(advanceReadiness(returned, next, next.capturedAtMs).placeMs).toBe(40_000);
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
    expect(validReadinessReceipt({ ...receipt, expiresAtMs: start + 119_999 }, 'readiness-session', 10, start + 90_000)).toBe(true);
    expect(validReadinessReceipt({ ...receipt, expiresAtMs: start + 120_001 }, 'readiness-session', 10, start + 90_000)).toBe(false);
  });
  it('binds only the requested target and rejects missing/expired/wrong-owner-session grants', () => {
    expect(validBoundReadiness(grant, target, 'readiness-session', start + 90_000)).toBe(true);
    expect(validBoundReadiness({ ...grant, expiresAtMs: start + 399_999 }, target, 'readiness-session', start + 90_000)).toBe(true);
    expect(validBoundReadiness({ ...grant, expiresAtMs: start + 400_001 }, target, 'readiness-session', start + 90_000)).toBe(false);
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
  it('offers exact private sharing at Here readiness without waiting for Place', () => {
    const hereOnly = { isPrivatePlace: true, readinessV1: true, hasContextualEligibility: true,
      hasBoundGrant: false, boundGrantAllowsExact: false, hereReady: true };
    expect(mayOfferExactPrivateLocation(hereOnly)).toBe(true);
    expect(mayOfferExactPrivateLocation({ ...hereOnly, hereReady: false })).toBe(false);
    expect(mayOfferExactPrivateLocation({ ...hereOnly, isPrivatePlace: false })).toBe(false);
    expect(mayOfferExactPrivateLocation({ ...hereOnly, hasContextualEligibility: false })).toBe(false);
    expect(mayOfferExactPrivateLocation({ ...hereOnly, hasBoundGrant: true, boundGrantAllowsExact: true, hereReady: false })).toBe(true);
    expect(mayOfferExactPrivateLocation({ ...hereOnly, hasBoundGrant: true, boundGrantAllowsExact: false })).toBe(false);
  });
});
