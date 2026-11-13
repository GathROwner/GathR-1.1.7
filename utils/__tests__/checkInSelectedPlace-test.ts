import { resetCheckInReadinessOwner, useCheckInReadinessStore } from '../../store/checkInReadinessStore';
import { captureSelectedExternalPlace, resolveSelectedExternalPlace } from '../checkInSelectedPlace';

const key = `external:${'a'.repeat(32)}`;
const now = 2_000_000_100_000;
function setup() {
  resetCheckInReadinessOwner('owner');
  const arrival = { sessionId: 'session-1', latitude: 46.235, longitude: -63.129, accuracyMeters: 10,
    capturedAtMs: now, expiresAtMs: now + 180_000, here: true, place: true };
  const candidate = { id: 'old-uuid', type: 'external_place' as const, locationKey: key, name: 'Same name', address: '',
    category: 'Cafe', latitude: arrival.latitude, longitude: arrival.longitude, distanceMetres: 0 };
  useCheckInReadinessStore.setState({ foregroundGranted: true, appActive: true, sessionId: arrival.sessionId, arrival,
    preparation: { sessionId: arrival.sessionId, latitude: arrival.latitude, longitude: arrival.longitude, expiresAtMs: now + 300_000,
      canonical: { status: 'ready', candidates: [], error: '', retryAtMs: 0 },
      external: { status: 'ready', candidates: [candidate], error: '', retryAtMs: 0 } } });
  const state = useCheckInReadinessStore.getState();
  return { state, selected: captureSelectedExternalPlace(state, candidate.id, now)!, candidate };
}

it('renews an expired UUID only by the exact stable source key in a new qualified session', () => {
  const { state, selected, candidate } = setup();
  const later = now + 21 * 60_000;
  const arrival = { ...state.arrival!, sessionId: 'session-2', capturedAtMs: later, expiresAtMs: later + 180_000 };
  const next = { ...state, sessionId: arrival.sessionId, arrival, preparation: { ...state.preparation,
    sessionId: arrival.sessionId, expiresAtMs: later + 300_000,
    external: { ...state.preparation.external, candidates: [{ ...candidate, id: 'new-uuid' }] } } };
  expect(resolveSelectedExternalPlace(next, selected, later)?.candidate.id).toBe('new-uuid');
});

it.each(['wrong-source', 'out-of-area', 'expired-pool', 'owner-change', 'departure', 'ambiguous'] as const)(
  'does not substitute a target on %s', kind => {
    const { state, selected, candidate } = setup();
    if (kind === 'wrong-source') state.preparation.external.candidates = [{ ...candidate, id: 'new', locationKey: `external:${'b'.repeat(32)}` }];
    if (kind === 'out-of-area') state.arrival = { ...state.arrival!, latitude: 46.25 };
    if (kind === 'expired-pool') state.preparation.expiresAtMs = now;
    if (kind === 'owner-change') state.uid = 'another-owner';
    if (kind === 'departure') state.revocationRevision += 1;
    if (kind === 'ambiguous') state.preparation.external.candidates = [candidate, { ...candidate, id: 'duplicate' }];
    expect(resolveSelectedExternalPlace(state, selected, now)).toBeNull();
  }
);

it('requires an eligible original candidate with a server source key; never trusts route labels', () => {
  const { state } = setup();
  expect(captureSelectedExternalPlace(state, 'route-forged-id', now)).toBeNull();
  state.preparation.external.candidates[0].locationKey = undefined;
  const legacy = captureSelectedExternalPlace(state, 'old-uuid', now);
  expect(resolveSelectedExternalPlace(state, legacy, now)?.candidate.id).toBe('old-uuid');
  state.preparation.external.candidates[0].id = 'different-uuid';
  expect(resolveSelectedExternalPlace(state, legacy, now)).toBeNull();
});
