import { advanceReadiness, emptyReadiness } from '../checkInReadiness';
import { presentedCheckInReadiness } from '../checkInReadinessPresentation';

const now = 2_000_000_100_000;
function state(localSeconds = 90, acceptedSeconds = 63) {
  let evidence = emptyReadiness();
  for (let elapsed = 0; elapsed <= localSeconds; elapsed += 10) {
    const time = now - (localSeconds - elapsed) * 1000;
    evidence = advanceReadiness(evidence, { latitude: 46.235, longitude: -63.129,
      accuracyMeters: 10, speedMetersPerSecond: 0, capturedAtMs: time }, time);
  }
  return { sessionId: 'session', evidence, appActive: true, interruptedAtMs: null as number | null,
    serviceError: false, progressPaused: false,
    acceptedProgress: { sessionId: 'session', hereMs: Math.min(30_000, acceptedSeconds * 1000),
      placeMs: acceptedSeconds * 1000, receivedAtMs: now - 18_000 } };
}

it('cannot display local dwell before a matching server acknowledgement', () => {
  expect(presentedCheckInReadiness({ ...state(), acceptedProgress: null })).toEqual({ hereMs: 0, placeMs: 0 });
  expect(presentedCheckInReadiness(state(90, 0))).toEqual({ hereMs: 0, placeMs: 0 });
  expect(presentedCheckInReadiness({ ...state(), sessionId: 'replacement' })).toEqual({ hereMs: 0, placeMs: 0 });
});

it('shows 63 confirmed seconds as 70%, never speculative 81 seconds as 90%', () => {
  const current = state();
  const paused = { ...current, appActive: false, progressPaused: true };
  expect(presentedCheckInReadiness(current)).toEqual({ hereMs: 30_000, placeMs: 63_000 });
  expect(presentedCheckInReadiness(current).placeMs / 90_000).toBe(0.7);
  expect(presentedCheckInReadiness(paused)).toEqual(presentedCheckInReadiness(current));
});

it.each([
  { serviceError: true }, { appActive: false }, { interruptedAtMs: now }, { progressPaused: true },
])('retains confirmed dwell through an uncertain transition: %p', patch => {
  expect(presentedCheckInReadiness({ ...state(), ...patch })).toEqual({ hereMs: 30_000, placeMs: 63_000 });
});

it('holds an old acknowledgement through stale timing without advancing it', () => {
  const current = state();
  current.acceptedProgress.receivedAtMs = now - 60_000;
  current.evidence.previous!.capturedAtMs = now - 60_000;
  expect(presentedCheckInReadiness(current)).toEqual({ hereMs: 30_000, placeMs: 63_000 });
});

it('does not invent or retract server-confirmed time when local accuracy or clocks differ', () => {
  const current = state(10, 20);
  current.evidence.previous!.accuracyMeters = 40;
  expect(presentedCheckInReadiness(current)).toEqual({ hereMs: 20_000, placeMs: 20_000 });
});

it('advances only when a later accepted receipt adds qualifying dwell', () => {
  const current = state();
  const later = { ...current, acceptedProgress: { ...current.acceptedProgress, placeMs: 75_000, receivedAtMs: now } };
  expect(presentedCheckInReadiness(current).placeMs).toBe(63_000);
  expect(presentedCheckInReadiness(later).placeMs).toBe(75_000);
});

it('honours genuine departure/session reset instead of retaining a visual high-water mark', () => {
  const current = state();
  expect(presentedCheckInReadiness({ ...current, sessionId: 'new-session', acceptedProgress: null }))
    .toEqual({ hereMs: 0, placeMs: 0 });
  expect(presentedCheckInReadiness(state(0, 0))).toEqual({ hereMs: 0, placeMs: 0 });
});

it('bounds displayed dwell at the existing thresholds', () => {
  expect(presentedCheckInReadiness(state(90, 100))).toEqual({ hereMs: 30_000, placeMs: 90_000 });
});
