import { advanceReadiness, emptyReadiness } from '../checkInReadiness';
import { presentedCheckInReadiness } from '../checkInReadinessPresentation';

const now = 2_000_000_100_000;
function state(localSeconds = 90, acceptedSeconds = 10) {
  let evidence = emptyReadiness();
  for (let elapsed = 0; elapsed <= localSeconds; elapsed += 10) {
    const time = now - (localSeconds - elapsed) * 1000;
    evidence = advanceReadiness(evidence, { latitude: 46.235, longitude: -63.129,
      accuracyMeters: 10, speedMetersPerSecond: 0, capturedAtMs: time }, time);
  }
  return { sessionId: 'session', evidence, appActive: true, interruptedAtMs: null as number | null,
    serviceError: false, progressPaused: false,
    acceptedProgress: { sessionId: 'session', hereMs: Math.min(30_000, acceptedSeconds * 1000),
      placeMs: acceptedSeconds * 1000, receivedAtMs: now } };
}

it('cannot show elapsed dwell before the first server baseline despite a completed local timer', () => {
  expect(presentedCheckInReadiness({ ...state(), acceptedProgress: null }, now)).toEqual({ hereMs: 0, placeMs: 0 });
  expect(presentedCheckInReadiness(state(90, 0), now)).toEqual({ hereMs: 0, placeMs: 0 });
});

it('smooths only a short accepted foreground interval, bounded by local evidence', () => {
  expect(presentedCheckInReadiness(state(90, 10), now + 5_000)).toEqual({ hereMs: 15_000, placeMs: 15_000 });
  expect(presentedCheckInReadiness(state(10, 20), now)).toEqual({ hereMs: 10_000, placeMs: 10_000 });
});

it.each([
  { serviceError: true }, { appActive: false }, { interruptedAtMs: now }, { progressPaused: true },
])('freezes accepted progress across failure or interruption: %p', patch => {
  expect(presentedCheckInReadiness({ ...state(), ...patch }, now + 5_000)).toEqual({ hereMs: 10_000, placeMs: 10_000 });
});

it('does not fast-forward stale evidence or an old acknowledgement after resume', () => {
  expect(presentedCheckInReadiness(state(), now + 60_000)).toEqual({ hereMs: 10_000, placeMs: 10_000 });
  expect(presentedCheckInReadiness({ ...state(), sessionId: 'replacement' }, now)).toEqual({ hereMs: 0, placeMs: 0 });
});

it('requires strong current accuracy before projecting public dwell', () => {
  const current = state();
  current.evidence.previous!.accuracyMeters = 40;
  expect(presentedCheckInReadiness(current, now + 5_000)).toEqual({ hereMs: 15_000, placeMs: 10_000 });
});
