import { clearCheckInPreparationCache, prepareCheckInPlaces, requestCheckInPreparationRetry } from '../checkInPreparation';
import { discoverNearbyCheckInPlaces, listNearbyCanonicalCheckInVenues } from '../socialService';
import { captureCheckInAttempt, preparedCandidatesForArrival, preparedReadinessLevels, resetCheckInReadinessOwner, useCheckInReadinessStore } from '../../store/checkInReadinessStore';
import { emptyReadiness } from '../../utils/checkInReadiness';

jest.mock('../socialService', () => ({ discoverNearbyCheckInPlaces: jest.fn(), listNearbyCanonicalCheckInVenues: jest.fn() }));

const start = 2_000_000_000_000;
const position = { latitude: 46.235, longitude: -63.129 };
const canonical = { id: 'venue:one', type: 'gathr_venue' as const, venueId: 'one', name: 'Holy Whale', address: 'Charlottetown', category: 'GathR venue', ...position, distanceMetres: 0 };
const external = { ...canonical, id: 'external-one', type: 'external_place' as const, venueId: undefined, name: 'Nearby pub' };
let owner = 0;
function ready(sessionId = 'preparation-session') {
  const sample = { ...position, accuracyMeters: 17, speedMetersPerSecond: 0, capturedAtMs: Date.now() };
  useCheckInReadinessStore.setState({ foregroundGranted: true, appActive: true, preferencesLoaded: true, sessionId,
    evidence: { ...emptyReadiness(), hereMs: 20_000, placeMs: 20_000, reason: 'qualifying', anchor: sample, previous: sample } });
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

describe('arrival preparation before ring completion', () => {
  beforeEach(() => {
    jest.useFakeTimers(); jest.setSystemTime(start);
    clearCheckInPreparationCache(); resetCheckInReadinessOwner(`preparation-user-${++owner}`); ready();
    (listNearbyCanonicalCheckInVenues as jest.Mock).mockReset().mockResolvedValue({ candidates: [canonical], preparationRadiusMetres: 175, expiresAt: start + 900_000 });
    (discoverNearbyCheckInPlaces as jest.Mock).mockReset().mockResolvedValue({ candidates: [external], preparationRadiusMetres: 175, externalLookupStatus: 'complete', expiresAt: start + 900_000 });
  });
  afterEach(() => { clearCheckInPreparationCache(); jest.useRealTimers(); });
  it('warms both lists during countdown once, then full-ready waits for server arrival', async () => {
    prepareCheckInPlaces(); prepareCheckInPlaces();
    expect(listNearbyCanonicalCheckInVenues).toHaveBeenCalledTimes(1);
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledWith(expect.objectContaining({ preparation: true }), expect.any(Object));
    await flush();
    expect(useCheckInReadinessStore.getState().preparation.external.status).toBe('ready');
    expect(preparedReadinessLevels(useCheckInReadinessStore.getState()).place).toBe(false);
    useCheckInReadinessStore.setState({ arrival: { sessionId: 'preparation-session', ...position, accuracyMeters: 17,
      capturedAtMs: start, expiresAtMs: start + 180_000, here: true, place: true } });
    expect(preparedReadinessLevels(useCheckInReadinessStore.getState())).toMatchObject({ here: true, place: true, publicVenues: true, external: true });
    for (let i = 0; i < 100; i++) prepareCheckInPlaces();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
  });
  it('retains one in-flight lookup across app switching; no duplicate provider call', async () => {
    let finish: (result: unknown) => void = () => undefined;
    (discoverNearbyCheckInPlaces as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    prepareCheckInPlaces();
    useCheckInReadinessStore.setState({ appActive: false }); prepareCheckInPlaces();
    useCheckInReadinessStore.setState({ appActive: true }); prepareCheckInPlaces();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
    finish({ candidates: [external], preparationRadiusMetres: 175, externalLookupStatus: 'complete' }); await flush();
    expect(useCheckInReadinessStore.getState().preparation.external.status).toBe('ready');
  });
  it('surfaces provider failure and preserves canonical choices; retries only explicitly after backoff', async () => {
    (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValueOnce({ candidates: [canonical], preparationRadiusMetres: 175, externalLookupStatus: 'partial_unavailable' });
    prepareCheckInPlaces(); await flush();
    expect(useCheckInReadinessStore.getState().preparation.canonical.status).toBe('ready');
    expect(useCheckInReadinessStore.getState().preparation.external.status).toBe('error');
    prepareCheckInPlaces(); requestCheckInPreparationRetry('external');
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60_000); ready(); requestCheckInPreparationRetry('external'); await flush();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(2);
    expect(useCheckInReadinessStore.getState().preparation.external.status).toBe('ready');
  });
  it('treats successful empty discovery as prepared, never as an outage', async () => {
    (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValueOnce({ candidates: [], preparationRadiusMetres: 175, externalLookupStatus: 'complete' });
    prepareCheckInPlaces(); await flush();
    expect(useCheckInReadinessStore.getState().preparation.external).toMatchObject({ status: 'ready', candidates: [], error: '' });
  });
  it('does not apply a stale lookup to a replaced owner/session', async () => {
    let finish: (result: unknown) => void = () => undefined;
    (discoverNearbyCheckInPlaces as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    prepareCheckInPlaces(); ready('different-session');
    finish({ candidates: [external], preparationRadiusMetres: 175, externalLookupStatus: 'complete' }); await flush();
    expect(useCheckInReadinessStore.getState().preparation.external.status).not.toBe('ready');
  });
  it('caps automatic searches at16 and preserves four explicit retries within the existing20/day ceiling', async () => {
    const move = (index: number) => {
      ready(`budget-session-${index}`);
      const state = useCheckInReadinessStore.getState();
      const sample = { ...state.evidence.previous!, latitude: position.latitude + index * .003 };
      useCheckInReadinessStore.setState({ evidence: { ...state.evidence, anchor: sample, previous: sample } });
    };
    for (let index = 0; index < 16; index += 1) { move(index); prepareCheckInPlaces(); await flush(); }
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(16);
    move(16); prepareCheckInPlaces(); await flush();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(16);
    expect(useCheckInReadinessStore.getState().preparation.external.status).toBe('error');
    for (let index = 16; index < 20; index += 1) { move(index); requestCheckInPreparationRetry('external'); await flush(); }
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(20);
    move(20); requestCheckInPreparationRetry('external'); await flush();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(20);
    expect(useCheckInReadinessStore.getState().preparation.external.retryAtMs).toBe(start + 24 * 60 * 60_000);
  });
  it('reuses nearby successful pools without extending their original expiry', async () => {
    prepareCheckInPlaces(); await flush();
    const expiry = useCheckInReadinessStore.getState().preparation.expiresAtMs;
    jest.advanceTimersByTime(240_000); ready('second-session'); prepareCheckInPlaces(); await flush();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
    expect(useCheckInReadinessStore.getState().preparation.expiresAtMs).toBe(expiry);
  });
  it('filters the prepared pool at qualified arrival using exact radius and public footprints', async () => {
    const beyond = { ...canonical, id: 'venue:beyond', latitude: position.latitude + 67.4 / 111_195 };
    const footprint = { ...external, latitude: position.latitude + 150 / 111_195,
      checkInBoundary: [{ lat: position.latitude - .0001, lon: position.longitude - .0001 },
        { lat: position.latitude + .0001, lon: position.longitude - .0001 }, { lat: position.latitude + .0001, lon: position.longitude + .0001 },
        { lat: position.latitude - .0001, lon: position.longitude + .0001 }, { lat: position.latitude - .0001, lon: position.longitude - .0001 }] };
    (listNearbyCanonicalCheckInVenues as jest.Mock).mockResolvedValueOnce({ candidates: [canonical, beyond], preparationRadiusMetres: 175 });
    (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValueOnce({ candidates: [footprint], preparationRadiusMetres: 175, externalLookupStatus: 'complete' });
    prepareCheckInPlaces(); await flush();
    useCheckInReadinessStore.setState({ arrival: { sessionId: 'preparation-session', ...position, accuracyMeters: 17,
      capturedAtMs: start, expiresAtMs: start + 180_000, here: true, place: true } });
    expect(preparedCandidatesForArrival(useCheckInReadinessStore.getState(), 'canonical').map(x => x.id)).toEqual(['venue:one']);
    expect(preparedCandidatesForArrival(useCheckInReadinessStore.getState(), 'external')).toHaveLength(1);
    expect(captureCheckInAttempt(useCheckInReadinessStore.getState().uid!, true)).not.toBeNull();
  });
  it('fails closed when an older endpoint ignores preparation, including canonical partial-outage fallback', async () => {
    (listNearbyCanonicalCheckInVenues as jest.Mock).mockResolvedValueOnce({ candidates: [canonical] });
    (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValueOnce({ candidates: [canonical], externalLookupStatus: 'partial_unavailable' });
    prepareCheckInPlaces(); await flush();
    const state = useCheckInReadinessStore.getState();
    expect(state.preparation.canonical).toMatchObject({ status: 'error', candidates: [],
      error: 'Nearby place preparation is unavailable in this server version. Your choices are saved.' });
    expect(state.preparation.external).toMatchObject({ status: 'error', candidates: [] });
    useCheckInReadinessStore.setState({ arrival: { sessionId: state.sessionId, ...position, accuracyMeters: 17,
      capturedAtMs: start, expiresAtMs: start + 180_000, here: true, place: true } });
    expect(preparedReadinessLevels(useCheckInReadinessStore.getState())).toMatchObject({ here: true, place: false, publicVenues: false, external: false });
    ready('next-session'); prepareCheckInPlaces(); await flush();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(2);
    expect(useCheckInReadinessStore.getState().preparation.external.status).toBe('ready');
  });
});
