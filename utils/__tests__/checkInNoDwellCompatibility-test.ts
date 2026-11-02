import { emptyCheckInPreparation, preparedReadinessLevels, useCheckInReadinessStore } from '../../store/checkInReadinessStore';
import { validQualifiedArrival } from '../checkInReadinessContract';
import { presentedCheckInReadiness } from '../checkInReadinessPresentation';

const now = 2_000_000_000_000;
const arrival = { sessionId: 'local-no-dwell', latitude: 46.2382, longitude: -63.1311,
  accuracyMeters: 20, capturedAtMs: now, expiresAtMs: now + 180_000, here: true as const, place: true };
function state() {
  return { ...useCheckInReadinessStore.getState(), uid: 'local-user', foregroundGranted: true,
    appActive: true, sessionId: arrival.sessionId, arrival,
    acceptedProgress: { sessionId: arrival.sessionId, hereMs: 0, placeMs: 0, receivedAtMs: now },
    preparation: { ...emptyCheckInPreparation(), sessionId: arrival.sessionId, expiresAtMs: now + 180_000 } };
}

it('accepts a server arrival with zero dwell without inventing progress', () => {
  const current = state();
  expect(validQualifiedArrival(arrival, current.sessionId, now)).toBe(true);
  expect(presentedCheckInReadiness(current)).toEqual({ hereMs: 0, placeMs: 0 });
  expect(preparedReadinessLevels(current, now)).toMatchObject({ here: true, place: false });
});

it('public readiness still requires both prepared lists and exposes lookup failures', () => {
  const current = state();
  current.preparation.canonical.status = 'ready';
  current.preparation.external.status = 'error';
  expect(preparedReadinessLevels(current, now)).toMatchObject({ place: false, publicVenues: true, external: false });
  current.preparation.external.status = 'ready';
  expect(preparedReadinessLevels(current, now).place).toBe(true);
});

it('expired or mismatched arrivals cannot unlock either level', () => {
  expect(preparedReadinessLevels(state(), now + 180_001)).toMatchObject({ here: false, place: false });
  expect(preparedReadinessLevels({ ...state(), sessionId: 'different' }, now))
    .toMatchObject({ here: false, place: false });
});
