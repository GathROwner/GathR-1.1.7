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
    (discoverNearbyCheckInPlaces as jest.Mock).mockReset().mockResolvedValue({ candidates: [canonical, external], preparationRadiusMetres: 175, externalLookupStatus: 'complete', expiresAt: start + 900_000 });
  });
  afterEach(() => { clearCheckInPreparationCache(); jest.useRealTimers(); });
  it('warms both lists during countdown once, then full-ready waits for server arrival', async () => {
    prepareCheckInPlaces(); prepareCheckInPlaces();
    expect(listNearbyCanonicalCheckInVenues).not.toHaveBeenCalled();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledWith(expect.objectContaining({ preparation: true }), expect.any(Object));
    await flush();
    expect(useCheckInReadinessStore.getState().preparation.external.status).toBe('ready');
    expect(useCheckInReadinessStore.getState().preparation.canonical.candidates).toEqual([canonical]);
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
    finish({ candidates: [canonical, external], preparationRadiusMetres: 175, externalLookupStatus: 'complete' }); await flush();
    expect(useCheckInReadinessStore.getState().preparation.external.status).toBe('ready');
  });
  it('attaches a nearby replacement session to one in-flight combined lookup', async () => {
    let finish: (result: unknown) => void = () => undefined;
    (discoverNearbyCheckInPlaces as jest.Mock).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    prepareCheckInPlaces(); ready('replacement-session'); prepareCheckInPlaces();
    finish({ candidates: [canonical, external], preparationRadiusMetres: 175, externalLookupStatus: 'complete' }); await flush();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
    expect(listNearbyCanonicalCheckInVenues).not.toHaveBeenCalled();
    expect(useCheckInReadinessStore.getState().preparation).toMatchObject({ sessionId: 'replacement-session',
      canonical: { status: 'ready', candidates: [canonical] }, external: { status: 'ready', candidates: [external] } });
  });
  it('warms the combined pool with Here-quality accuracy without waiting for Place-quality GPS', async () => {
    const state = useCheckInReadinessStore.getState();
    useCheckInReadinessStore.setState({ evidence: { ...state.evidence, previous: { ...state.evidence.previous!, accuracyMeters: 40 } } });
    prepareCheckInPlaces(); await flush();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledWith(expect.objectContaining({ accuracyMeters: 40, preparation: true }), expect.any(Object));
    expect(listNearbyCanonicalCheckInVenues).not.toHaveBeenCalled();
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
    expect(listNearbyCanonicalCheckInVenues).not.toHaveBeenCalled();
  });
  it('treats successful empty discovery as prepared, never as an outage', async () => {
    (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValueOnce({ candidates: [], preparationRadiusMetres: 175, externalLookupStatus: 'complete' });
    prepareCheckInPlaces(); await flush();
    expect(useCheckInReadinessStore.getState().preparation.external).toMatchObject({ status: 'ready', candidates: [], error: '' });
  });
  it('uses marked partial-empty results as a complete empty canonical pool, while external remains unavailable', async () => {
    (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValueOnce({ candidates: [], preparationRadiusMetres: 175, externalLookupStatus: 'partial_unavailable' });
    prepareCheckInPlaces(); await flush();
    expect(useCheckInReadinessStore.getState().preparation.canonical).toMatchObject({ status: 'ready', candidates: [], error: '' });
    expect(useCheckInReadinessStore.getState().preparation.external.status).toBe('error');
    expect(listNearbyCanonicalCheckInVenues).not.toHaveBeenCalled();
  });
  it('keeps usable canonical choices while an explicit external retry is pending or fails', async () => {
    (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValueOnce({ candidates: [canonical], preparationRadiusMetres: 175, externalLookupStatus: 'partial_unavailable' });
    prepareCheckInPlaces(); await flush();
    jest.advanceTimersByTime(60_000); ready();
    let fail: (error: Error) => void = () => undefined;
    (discoverNearbyCheckInPlaces as jest.Mock).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    requestCheckInPreparationRetry('external');
    expect(useCheckInReadinessStore.getState().preparation.canonical).toMatchObject({ status: 'ready', candidates: [canonical] });
    expect(useCheckInReadinessStore.getState().preparation.external.status).toBe('loading');
    fail(new Error('Provider timed out')); await flush();
    expect(useCheckInReadinessStore.getState().preparation.canonical).toMatchObject({ status: 'ready', candidates: [canonical] });
    ready('after-failed-retry'); requestCheckInPreparationRetry('external');
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(2);
    expect(listNearbyCanonicalCheckInVenues).not.toHaveBeenCalled();
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
    expect(useCheckInReadinessStore.getState().preparation.canonical.status).toBe('ready');
    expect(listNearbyCanonicalCheckInVenues).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 30; index++) prepareCheckInPlaces();
    expect(listNearbyCanonicalCheckInVenues).toHaveBeenCalledTimes(1);
    for (let index = 16; index < 20; index += 1) { move(index); requestCheckInPreparationRetry('external'); await flush(); }
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(20);
    move(20); requestCheckInPreparationRetry('external'); await flush();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(20);
    expect(useCheckInReadinessStore.getState().preparation.external.retryAtMs).toBe(start + 24 * 60 * 60_000);
  });
  it('counts a manual canonical refresh as one coordinated search rather than making a second catalog request', async () => {
    (discoverNearbyCheckInPlaces as jest.Mock).mockRejectedValueOnce(new Error('Service unavailable'));
    prepareCheckInPlaces(); await flush();
    jest.advanceTimersByTime(60_000); ready(); requestCheckInPreparationRetry('canonical'); await flush();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(2);
    expect(listNearbyCanonicalCheckInVenues).not.toHaveBeenCalled();
    expect(useCheckInReadinessStore.getState().preparation.canonical.status).toBe('ready');
  });
  it('reuses nearby successful pools without extending their original expiry', async () => {
    prepareCheckInPlaces(); await flush();
    const expiry = useCheckInReadinessStore.getState().preparation.expiresAtMs;
    jest.advanceTimersByTime(240_000); ready('second-session'); prepareCheckInPlaces(); await flush();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
    expect(useCheckInReadinessStore.getState().preparation.expiresAtMs).toBe(expiry);
    expect(listNearbyCanonicalCheckInVenues).not.toHaveBeenCalled();
    jest.advanceTimersByTime(60_001); ready('expired-pool-session'); prepareCheckInPlaces(); await flush();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(2);
    expect(listNearbyCanonicalCheckInVenues).not.toHaveBeenCalled();
  });
  it('does not reuse another owner\'s combined candidate cache', async () => {
    prepareCheckInPlaces(); await flush();
    resetCheckInReadinessOwner('a-different-preparation-owner'); ready(); prepareCheckInPlaces(); await flush();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(2);
    expect(listNearbyCanonicalCheckInVenues).not.toHaveBeenCalled();
  });
  it('filters the prepared pool at qualified arrival using exact radius and public footprints', async () => {
    const beyond = { ...canonical, id: 'venue:beyond', latitude: position.latitude + 67.4 / 111_195 };
    const footprint = { ...external, latitude: position.latitude + 150 / 111_195,
      checkInBoundary: [{ lat: position.latitude - .0001, lon: position.longitude - .0001 },
        { lat: position.latitude + .0001, lon: position.longitude - .0001 }, { lat: position.latitude + .0001, lon: position.longitude + .0001 },
        { lat: position.latitude - .0001, lon: position.longitude + .0001 }, { lat: position.latitude - .0001, lon: position.longitude - .0001 }] };
    (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValueOnce({ candidates: [canonical, beyond, footprint], preparationRadiusMetres: 175, externalLookupStatus: 'complete' });
    prepareCheckInPlaces(); await flush();
    useCheckInReadinessStore.setState({ arrival: { sessionId: 'preparation-session', ...position, accuracyMeters: 17,
      capturedAtMs: start, expiresAtMs: start + 180_000, here: true, place: true } });
    expect(preparedCandidatesForArrival(useCheckInReadinessStore.getState(), 'canonical').map(x => x.id)).toEqual(['venue:one']);
    expect(preparedCandidatesForArrival(useCheckInReadinessStore.getState(), 'external')).toHaveLength(1);
    expect(captureCheckInAttempt(useCheckInReadinessStore.getState().uid!, true)).not.toBeNull();
  });
  it('fails closed when an older endpoint ignores preparation, including canonical partial-outage fallback', async () => {
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
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60_000); ready('next-session'); requestCheckInPreparationRetry(); await flush();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(2);
    expect(useCheckInReadinessStore.getState().preparation.external.status).toBe('ready');
  });
  it('keeps total failure sticky across time and nearby session replacement until explicit retry', async () => {
    (discoverNearbyCheckInPlaces as jest.Mock).mockRejectedValueOnce(new Error('Service unavailable'));
    prepareCheckInPlaces(); await flush();
    for (let second = 1; second <= 610; second++) {
      jest.advanceTimersByTime(1_000); ready(second % 20 === 0 ? `failure-session-${second}` : useCheckInReadinessStore.getState().sessionId);
      prepareCheckInPlaces(); await flush();
    }
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
    expect(listNearbyCanonicalCheckInVenues).not.toHaveBeenCalled();
    expect(useCheckInReadinessStore.getState().preparation.canonical).toMatchObject({ status: 'error', candidates: [] });
    requestCheckInPreparationRetry(); await flush();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(2);
    expect(useCheckInReadinessStore.getState().preparation.external.status).toBe('ready');
  });
  it('does not retry a partial outage after the canonical candidate cache expires', async () => {
    (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValueOnce({ candidates: [canonical], preparationRadiusMetres: 175, externalLookupStatus: 'partial_unavailable' });
    prepareCheckInPlaces(); await flush();
    for (let second = 1; second <= 610; second++) {
      jest.advanceTimersByTime(1_000); ready(second % 15 === 0 ? `partial-session-${second}` : useCheckInReadinessStore.getState().sessionId);
      prepareCheckInPlaces(); await flush();
      if (second === 60) expect(useCheckInReadinessStore.getState().preparation.canonical.status).toBe('ready');
    }
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
    expect(listNearbyCanonicalCheckInVenues).not.toHaveBeenCalled();
    expect(useCheckInReadinessStore.getState().preparation.canonical).toMatchObject({ status: 'error', candidates: [] });
    expect(useCheckInReadinessStore.getState().preparation.external.status).toBe('error');
    requestCheckInPreparationRetry('canonical'); await flush();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(2);
    expect(useCheckInReadinessStore.getState().preparation.canonical.status).toBe('ready');
  });
  it('permits automatic preparation after a real location change outside the failed area', async () => {
    (discoverNearbyCheckInPlaces as jest.Mock).mockRejectedValueOnce(new Error('Service unavailable'));
    prepareCheckInPlaces(); await flush();
    const state = useCheckInReadinessStore.getState();
    const sample = { ...state.evidence.previous!, latitude: position.latitude + .001 };
    useCheckInReadinessStore.setState({ evidence: { ...state.evidence, anchor: sample, previous: sample } });
    prepareCheckInPlaces(); await flush();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(2);
    expect(useCheckInReadinessStore.getState().preparation.external.status).toBe('ready');
  });
  it('does not turn ordinary GPS jitter into an automatic retry of a failed area', async () => {
    (discoverNearbyCheckInPlaces as jest.Mock).mockRejectedValueOnce(new Error('Service unavailable'));
    prepareCheckInPlaces(); await flush();
    jest.advanceTimersByTime(301_000); ready('jittered-replacement-session');
    const state = useCheckInReadinessStore.getState();
    const sample = { ...state.evidence.previous!, latitude: position.latitude + 25 / 111_195, accuracyMeters: 30 };
    useCheckInReadinessStore.setState({ evidence: { ...state.evidence, anchor: sample, previous: sample } });
    prepareCheckInPlaces(); await flush();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
    expect(listNearbyCanonicalCheckInVenues).not.toHaveBeenCalled();
    expect(useCheckInReadinessStore.getState().preparation.external.status).toBe('error');
  });
  it.each([undefined, 'unexpected'])('does not claim ready for a marked combined response with external status %s', async externalLookupStatus => {
    (discoverNearbyCheckInPlaces as jest.Mock).mockResolvedValueOnce({ candidates: [canonical, external], preparationRadiusMetres: 175, externalLookupStatus });
    prepareCheckInPlaces(); await flush();
    expect(useCheckInReadinessStore.getState().preparation.canonical).toMatchObject({ status: 'error', candidates: [] });
    expect(useCheckInReadinessStore.getState().preparation.external).toMatchObject({ status: 'error', candidates: [] });
  });
  it('accepts an explicit retry with a25-second-old fix while preserving its original capture time', async () => {
    const capturedAtMs = useCheckInReadinessStore.getState().evidence.previous!.capturedAtMs;
    jest.advanceTimersByTime(25_000);
    prepareCheckInPlaces();
    expect(discoverNearbyCheckInPlaces).not.toHaveBeenCalled();
    requestCheckInPreparationRetry('external'); await flush();
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledWith(expect.objectContaining({ capturedAtMs }), expect.any(Object));
    expect(discoverNearbyCheckInPlaces).toHaveBeenCalledTimes(1);
    expect(useCheckInReadinessStore.getState().preparation.external.status).toBe('ready');
  });
  it('rejects an explicit lookup with a fix older than60seconds and surfaces a location-updating error', async () => {
    jest.advanceTimersByTime(60_001);
    requestCheckInPreparationRetry('external'); await flush();
    expect(discoverNearbyCheckInPlaces).not.toHaveBeenCalled();
    expect(listNearbyCanonicalCheckInVenues).not.toHaveBeenCalled();
    expect(useCheckInReadinessStore.getState().preparation.external).toMatchObject({ status: 'error',
      error: 'Location is updating. Retry once a recent location is available.' });
  });
});
