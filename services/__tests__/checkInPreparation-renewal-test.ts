import { discoverNearbyCheckInPlaces, listNearbyCanonicalCheckInVenues } from '../socialService';
import { clearCheckInPreparationCache, prepareCheckInPlaces, requestCheckInPreparationRetry } from '../checkInPreparation';
import { emptyCheckInPreparation, preparedReadinessLevels, resetCheckInReadinessOwner, useCheckInReadinessStore } from '../../store/checkInReadinessStore';
import { emptyReadiness } from '../../utils/checkInReadiness';

jest.mock('../socialService', () => ({ discoverNearbyCheckInPlaces: jest.fn(), listNearbyCanonicalCheckInVenues: jest.fn() }));
const start = 2_000_000_000_000;
const minute = 60_000;
const position = { latitude: 46.235, longitude: -63.129 };
const canonical = { id: 'venue:one', type: 'gathr_venue' as const, venueId: 'one', name: 'Venue', address: '', category: 'Venue', ...position, distanceMetres: 0 };
const external = { id: 'external-one', type: 'external_place' as const, locationKey: `external:${'a'.repeat(32)}`,
  name: 'Pub', address: '', category: 'Pub', ...position, distanceMetres: 0 };
let owner = 0;
const flush = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };
function fresh(sessionId = 'session', offsetMetres = 0, qualified = true) {
  const sample = { ...position, latitude: position.latitude + offsetMetres / 111_195, accuracyMeters: 17, speedMetersPerSecond: 0, capturedAtMs: Date.now() };
  useCheckInReadinessStore.setState({ sessionId, foregroundGranted: true, appActive: true, preferencesLoaded: true,
    evidence: { ...emptyReadiness(), hereMs: 30_000, placeMs: 90_000, anchor: sample, previous: sample, reason: 'qualifying' },
    arrival: qualified ? { ...sample, sessionId, expiresAtMs: Date.now() + 180_000, here: true, place: true } : null, attempt: null });
}
function result(sourceStartedAt = start, reused = false, poolId = 'pool-identity-000001') {
  return { preparationRadiusMetres: 175, externalLookupStatus: 'complete', preparationReused: reused,
    candidates: [canonical, external], expiresAt: Math.min(Date.now() + 15 * minute, sourceStartedAt + 360 * minute),
    preparationPool: { id: poolId, originLatitude: position.latitude, originLongitude: position.longitude,
      expiresAtMs: Math.min(Date.now() + 15 * minute, sourceStartedAt + 360 * minute),
      refreshAtMs: Math.min(Date.now() + 10 * minute, sourceStartedAt + 360 * minute), sourceExpiresAtMs: sourceStartedAt + 360 * minute } };
}
beforeEach(() => {
  jest.useFakeTimers(); jest.setSystemTime(start); clearCheckInPreparationCache(); resetCheckInReadinessOwner(`renewal-owner-${++owner}`); fresh();
  (discoverNearbyCheckInPlaces as jest.Mock).mockReset().mockResolvedValue(result());
  (listNearbyCanonicalCheckInVenues as jest.Mock).mockReset().mockResolvedValue({ candidates: [canonical], preparationRadiusMetres: 175 });
});
afterEach(() => { clearCheckInPreparationCache(); jest.useRealTimers(); });

it('keeps both lists ready while one renewal is in flight and extends only after its server acknowledgement', async () => {
  prepareCheckInPlaces(); await flush();
  expect(useCheckInReadinessStore.getState().preparation.expiresAtMs).toBe(start + 15 * minute);
  jest.setSystemTime(start + 10 * minute); fresh();
  let finish!: (value: unknown) => void;
  (discoverNearbyCheckInPlaces as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  prepareCheckInPlaces(); for (let tick = 0; tick < 50; tick += 1) prepareCheckInPlaces();
  expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(2);
  expect((discoverNearbyCheckInPlaces as jest.Mock).mock.calls[1][0]).toMatchObject({
    renewPreparationPool: { poolId: 'pool-identity-000001', readinessSessionId: 'session' }, capturedAtMs: start + 10 * minute });
  expect(preparedReadinessLevels(useCheckInReadinessStore.getState()).place).toBe(true);
  expect(useCheckInReadinessStore.getState().preparation.expiresAtMs).toBe(start + 15 * minute);
  useCheckInReadinessStore.setState({ appActive: false }); prepareCheckInPlaces();
  fresh('resumed-session', 5); prepareCheckInPlaces();
  expect(preparedReadinessLevels(useCheckInReadinessStore.getState()).place).toBe(true);
  finish(result(start, true)); await flush();
  expect(useCheckInReadinessStore.getState().preparation.expiresAtMs).toBe(start + 25 * minute);
  expect(preparedReadinessLevels(useCheckInReadinessStore.getState()).place).toBe(true);
});

it('uses two charged discoveries over eight stationary hours, with ID-preserving renewals rather than five-minute searches', async () => {
  let sourceStart = start;
  let generation = 0;
  (discoverNearbyCheckInPlaces as jest.Mock).mockImplementation(async input => {
    if (!input.renewPreparationPool) { sourceStart = Date.now(); generation += 1; }
    return result(sourceStart, !!input.renewPreparationPool, `pool-generation-${String(generation).padStart(4, '0')}`);
  });
  for (let elapsed = 0; elapsed <= 480; elapsed += 1) {
    jest.setSystemTime(start + elapsed * minute); fresh(); prepareCheckInPlaces(); await flush();
    expect(preparedReadinessLevels(useCheckInReadinessStore.getState()).place).toBe(true);
  }
  const inputs = (discoverNearbyCheckInPlaces as jest.Mock).mock.calls.map(call => call[0]);
  expect(inputs.filter(input => !input.renewPreparationPool)).toHaveLength(2);
  expect(inputs.filter(input => input.renewPreparationPool)).toHaveLength(47);
  expect(listNearbyCanonicalCheckInVenues).not.toHaveBeenCalled();
});

it('uses one normal budgeted rediscovery only after the server requires it', async () => {
  prepareCheckInPlaces(); await flush(); jest.setSystemTime(start + 10 * minute); fresh();
  (discoverNearbyCheckInPlaces as jest.Mock).mockRejectedValueOnce({ details: { condition: 'rediscovery_required' } })
    .mockResolvedValueOnce(result(Date.now(), false, 'replacement-pool-0001'));
  prepareCheckInPlaces(); await flush();
  for (let tick = 0; tick < 20; tick += 1) prepareCheckInPlaces();
  expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(3);
  expect((discoverNearbyCheckInPlaces as jest.Mock).mock.calls[2][0].renewPreparationPool).toBeUndefined();
  expect(preparedReadinessLevels(useCheckInReadinessStore.getState()).place).toBe(true);
});

it('requires fresh qualified Here and does not slide the original coverage origin through nearby sessions', async () => {
  prepareCheckInPlaces(); await flush(); jest.setSystemTime(start + 10 * minute); fresh('replacement', 15, false);
  prepareCheckInPlaces(); await flush(); expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
  fresh('replacement', 15); (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValueOnce(result(start, true));
  prepareCheckInPlaces(); await flush();
  expect(useCheckInReadinessStore.getState().preparation.latitude).toBe(position.latitude);
  expect(useCheckInReadinessStore.getState().preparation.longitude).toBe(position.longitude);
  jest.setSystemTime(start + 20 * minute); fresh('replacement', 30);
  prepareCheckInPlaces(); await flush(); expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(2);
});

it('caps manual renewal attempts at eight per hour without charging acknowledged renewals as discoveries', async () => {
  (discoverNearbyCheckInPlaces as jest.Mock).mockImplementation(async input => result(start, !!input.renewPreparationPool));
  prepareCheckInPlaces(); await flush();
  for (let count = 0; count < 12; count += 1) { requestCheckInPreparationRetry('external'); await flush(); }
  expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(9);
  jest.setSystemTime(start + 16 * minute); fresh();
  for (let tick = 0; tick < 100; tick += 1) { prepareCheckInPlaces(); await flush(); }
  expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(9);
  expect(preparedReadinessLevels(useCheckInReadinessStore.getState()).place).toBe(false);
});

it.each(['preparation_renewal_rate_limited', 'preparation_renewal_unqualified', 'network'])('backs off %s for eight hours without new discoveries or ready state past server expiry', async condition => {
  prepareCheckInPlaces(); await flush(); jest.setSystemTime(start + 10 * minute); fresh();
  (discoverNearbyCheckInPlaces as jest.Mock).mockRejectedValue(condition === 'network' ? new Error('Network unavailable') : { details: { condition } });
  for (let seconds = 0; seconds <= 8 * 60 * 60; seconds += 60) {
    jest.setSystemTime(start + 10 * minute + seconds * 1000); fresh(); prepareCheckInPlaces(); await flush();
    if (seconds < 5 * 60) expect(preparedReadinessLevels(useCheckInReadinessStore.getState()).place).toBe(true);
  }
  expect((discoverNearbyCheckInPlaces as jest.Mock).mock.calls.filter(call => !call[0].renewPreparationPool)).toHaveLength(1);
  expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(4); // 10,11,13 minute attempts; no auto loop after lease expiry.
  expect(preparedReadinessLevels(useCheckInReadinessStore.getState()).place).toBe(false);
});

it.each(['missing-ack', 'changed-ids', 'changed-pool', 'shifted-origin', 'extended-source'] as const)('rejects %s and never invents an extended lease', async kind => {
  prepareCheckInPlaces(); await flush(); jest.setSystemTime(start + 10 * minute); fresh();
  const response = result(start, true);
  if (kind === 'missing-ack') response.preparationReused = false;
  if (kind === 'changed-ids') response.candidates = [canonical, { ...external, id: 'new-id-from-ignored-flag' }];
  if (kind === 'changed-pool') response.preparationPool.id = 'different-pool-0001';
  if (kind === 'shifted-origin') response.preparationPool.originLatitude += 0.001;
  if (kind === 'extended-source') response.preparationPool.sourceExpiresAtMs += 60 * minute;
  (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValueOnce(response);
  prepareCheckInPlaces(); await flush();
  expect(useCheckInReadinessStore.getState().preparation.expiresAtMs).toBe(start + 15 * minute);
  jest.setSystemTime(start + 14 * minute); fresh(); prepareCheckInPlaces(); await flush();
  expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(2);
  jest.setSystemTime(start + 16 * minute); fresh(); prepareCheckInPlaces(); await flush();
  expect(preparedReadinessLevels(useCheckInReadinessStore.getState()).place).toBe(false);
});

it('never keeps a ready pool beyond an earlier explicit server expiry', async () => {
  (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValueOnce({ ...result(), expiresAt: start + 2 * minute });
  prepareCheckInPlaces(); await flush();
  expect(useCheckInReadinessStore.getState().preparation.expiresAtMs).toBe(start + 2 * minute);
  jest.setSystemTime(start + 2 * minute + 1);
  expect(preparedReadinessLevels(useCheckInReadinessStore.getState()).place).toBe(false);
});

it('keeps all four manual discovery slots after eight acknowledged renewals at the automatic discovery ceiling', async () => {
  let normal = 0;
  (discoverNearbyCheckInPlaces as jest.Mock).mockImplementation(async input => {
    if (input.renewPreparationPool) return result(start, true);
    normal += 1;
    const response = result();
    return normal === 16 ? response : { ...response, preparationPool: undefined };
  });
  for (let index = 0; index < 16; index += 1) { clearCheckInPreparationCache(); fresh(`normal-${index}`); prepareCheckInPlaces(); await flush(); }
  for (let index = 0; index < 8; index += 1) { requestCheckInPreparationRetry('external'); await flush(); }
  clearCheckInPreparationCache(); fresh('auto-limit'); prepareCheckInPlaces(); await flush();
  expect(normal).toBe(16); expect(listNearbyCanonicalCheckInVenues).toHaveBeenCalledTimes(1);
  for (let index = 0; index < 4; index += 1) {
    if (index) { clearCheckInPreparationCache(); fresh(`manual-${index}`); }
    requestCheckInPreparationRetry('external'); await flush();
  }
  clearCheckInPreparationCache(); fresh('total-limit'); requestCheckInPreparationRetry('external'); await flush();
  expect(normal).toBe(20);
});

it.each(['typed-refusal', 'unknown-network'] as const)('refunds only provably zero-discovery outcomes (%s)', async kind => {
  let normal = 0;
  (discoverNearbyCheckInPlaces as jest.Mock).mockImplementation(async input => {
    if (input.renewPreparationPool) throw kind === 'typed-refusal'
      ? { details: { condition: 'preparation_renewal_rate_limited' } } : new Error('Unknown network outcome');
    normal += 1;
    const response = result();
    return normal === 16 ? response : { ...response, preparationPool: undefined };
  });
  for (let index = 0; index < 16; index += 1) { clearCheckInPreparationCache(); fresh(`normal-${index}`); prepareCheckInPlaces(); await flush(); }
  requestCheckInPreparationRetry('external'); await flush();
  for (let index = 0; index < 4; index += 1) { clearCheckInPreparationCache(); fresh(`manual-${index}`); requestCheckInPreparationRetry('external'); await flush(); }
  expect(normal).toBe(kind === 'typed-refusal' ? 20 : 19);
});

it.each(['owner', 'departure'])('ignores a late renewal after %s changes', async kind => {
  prepareCheckInPlaces(); await flush(); jest.setSystemTime(start + 10 * minute); fresh();
  let finish!: (value: unknown) => void;
  (discoverNearbyCheckInPlaces as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  prepareCheckInPlaces();
  const originalUid = useCheckInReadinessStore.getState().uid;
  if (kind === 'owner') { clearCheckInPreparationCache(); resetCheckInReadinessOwner('replacement-owner'); }
  else { const state = useCheckInReadinessStore.getState(); useCheckInReadinessStore.setState({ revocationRevision: state.revocationRevision + 1,
    preparation: emptyCheckInPreparation(), arrival: null }); }
  finish(result(start, true)); await flush();
  expect(useCheckInReadinessStore.getState().preparation.external.status).not.toBe('ready');
  // The acknowledged cost is still refunded to its original owner, never data
  // applied to the replacement session. Fifteen further searches reach16, not17.
  clearCheckInPreparationCache(); resetCheckInReadinessOwner(originalUid);
  (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValue({ ...result(), preparationPool: undefined });
  for (let index = 0; index < 15; index += 1) { clearCheckInPreparationCache(); fresh(`next-${index}`); prepareCheckInPlaces(); await flush(); }
  expect((discoverNearbyCheckInPlaces as jest.Mock).mock.calls.filter(call => !call[0].renewPreparationPool)).toHaveLength(16);
});
