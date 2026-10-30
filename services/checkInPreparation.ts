import { emptyCheckInPreparation, useCheckInReadinessStore, type CheckInPreparedList } from '../store/checkInReadinessStore';
import type { NearbyCheckInPlacesResult } from '../types/social';
import { CHECK_IN_READINESS, readinessDistance } from '../utils/checkInReadiness';
import { discoverNearbyCheckInPlaces, listNearbyCanonicalCheckInVenues } from './socialService';

type Kind = 'canonical' | 'external';
const CACHE_MS = 5 * 60_000;
const CACHE_RADIUS_METRES = 20;
const RETRY_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;
// Leave four of the existing server's twenty daily searches for explicit retry.
const AUTOMATIC_EXTERNAL_BUDGET = 16;
const TOTAL_EXTERNAL_BUDGET = 20;
type Cached = { uid: string; latitude: number; longitude: number; expiresAtMs: number; result: NearbyCheckInPlacesResult };
const cache: Partial<Record<Kind, Cached>> = {};
const requestTimes = new Map<string, number[]>();
const active = new Map<Kind, { uid: string; sessionId: string; controller: AbortController }>();

function listPatch(kind: Kind, value: Partial<CheckInPreparedList>, sessionId: string) {
  const state = useCheckInReadinessStore.getState();
  if (state.sessionId !== sessionId || state.preparation.sessionId !== sessionId) return;
  useCheckInReadinessStore.setState({ preparation: { ...state.preparation, [kind]: { ...state.preparation[kind], ...value } } });
}

function expiry(value: NearbyCheckInPlacesResult, now: number) {
  const raw = value.expiresAt;
  const object = raw && typeof raw === 'object' ? raw as unknown as Record<string, unknown> : null;
  const seconds = object?.seconds ?? object?._seconds;
  const nanoseconds = object?.nanoseconds ?? object?._nanoseconds ?? 0;
  const timestamp = raw && typeof raw === 'object' && 'toMillis' in raw && typeof raw.toMillis === 'function'
    ? raw.toMillis() : raw instanceof Date ? raw.getTime() : typeof raw === 'number' ? raw
      : typeof seconds === 'number' && typeof nanoseconds === 'number' ? seconds * 1000 + nanoseconds / 1_000_000 : now + CACHE_MS;
  return Math.min(now + CACHE_MS, timestamp);
}

/** Starts lookups during the countdown. Calls on subsequent GPS samples are no-ops. */
export function prepareCheckInPlaces(manual: Kind | 'all' | null = null): void {
  const now = Date.now();
  let state = useCheckInReadinessStore.getState();
  const sample = state.evidence.previous;
  if (!state.uid || state.mode === 'basic' || !state.appActive || !state.foregroundGranted || !state.sessionId || !sample
    || sample.accuracyMeters === null || !Number.isFinite(sample.accuracyMeters) || sample.accuracyMeters < 0
    || sample.accuracyMeters > CHECK_IN_READINESS.hereAccuracyMetres
    || now - sample.capturedAtMs < 0 || now - sample.capturedAtMs > CHECK_IN_READINESS.maxSampleAgeMs) return;
  const uid = state.uid;
  const sessionId = state.sessionId;
  if (state.preparation.sessionId !== sessionId || state.preparation.expiresAtMs <= now) {
    const fresh = emptyCheckInPreparation();
    useCheckInReadinessStore.setState({ preparation: { ...fresh, sessionId,
      latitude: sample.latitude, longitude: sample.longitude, expiresAtMs: now + CACHE_MS } });
    state = useCheckInReadinessStore.getState();
  }
  const origin = { latitude: state.preparation.latitude, longitude: state.preparation.longitude };
  if (readinessDistance(origin, sample) > CACHE_RADIUS_METRES + sample.accuracyMeters) return;
  for (const kind of ['canonical', 'external'] as const) {
    const explicit = manual === kind || manual === 'all';
    const current = state.preparation[kind];
    if (active.get(kind)?.sessionId === sessionId && active.get(kind)?.uid === uid) continue;
    if (current.status === 'ready') continue;
    // No automatic retry loop on a failed/free public endpoint. Retry is explicit
    // after backoff; changing location/session may use an existing nearby cache.
    if (current.status === 'error' && !explicit) continue;
    if (current.retryAtMs > now) continue;
    if (kind === 'external' && (sample.accuracyMeters > CHECK_IN_READINESS.placeAccuracyMetres
      || (!explicit && state.evidence.hereMs < 20_000))) continue;
    if (kind === 'canonical' && !explicit && state.evidence.hereMs < 10_000) continue;
    const saved = cache[kind];
    if (saved?.uid === uid && saved.expiresAtMs > now && readinessDistance(saved, sample) <= CACHE_RADIUS_METRES) {
      listPatch(kind, { status: 'ready', candidates: saved.result.candidates.filter(place => kind === 'canonical'
        ? place.type === 'gathr_venue' : place.type === 'external_place'), error: '', retryAtMs: 0 }, sessionId);
      const currentState = useCheckInReadinessStore.getState();
      if (currentState.sessionId === sessionId) useCheckInReadinessStore.setState({ preparation: {
        ...currentState.preparation, expiresAtMs: Math.min(currentState.preparation.expiresAtMs, saved.expiresAtMs),
      } });
      continue;
    }
    if (kind === 'external') {
      const times = (requestTimes.get(uid) || []).filter(time => time > now - DAY_MS);
      const budget = explicit ? TOTAL_EXTERNAL_BUDGET : AUTOMATIC_EXTERNAL_BUDGET;
      if (times.length >= budget) {
        listPatch(kind, { status: 'error', error: 'Nearby public-place preparation has reached its search allowance. GathR venues are still available.',
          retryAtMs: times.length >= TOTAL_EXTERNAL_BUDGET ? times[0] + DAY_MS : 0 }, sessionId);
        requestTimes.set(uid, times);
        continue;
      }
      requestTimes.set(uid, [...times, now]);
    }
    active.get(kind)?.controller.abort();
    const controller = new AbortController();
    const request = { uid, sessionId, controller };
    active.set(kind, request);
    listPatch(kind, { status: 'loading', error: '', retryAtMs: 0 }, sessionId);
    const input = { latitude: sample.latitude, longitude: sample.longitude,
      accuracyMeters: sample.accuracyMeters, capturedAtMs: sample.capturedAtMs, preparation: true as const };
    const lookup = kind === 'canonical' ? listNearbyCanonicalCheckInVenues : discoverNearbyCheckInPlaces;
    void lookup(input, { signal: controller.signal, timeoutMs: 25_000 }).then(result => {
      const latest = useCheckInReadinessStore.getState();
      if (active.get(kind) !== request || latest.uid !== uid || latest.sessionId !== sessionId || controller.signal.aborted) return;
      if (result.preparationRadiusMetres !== 175) {
        throw new Error('Nearby place preparation is unavailable in this server version. Your choices are saved.');
      }
      // Provider outages may still return usable canonical results; never label
      // an unavailable external provider as a successful empty public list.
      if (kind === 'external' && result.externalLookupStatus === 'partial_unavailable') {
        const canonical = result.candidates.filter(place => place.type === 'gathr_venue');
        if (canonical.length && latest.preparation.canonical.status !== 'ready') {
          listPatch('canonical', { status: 'ready', candidates: canonical, error: '', retryAtMs: 0 }, sessionId);
        }
        throw new Error('Public places could not be prepared. Your nearby GathR venues are still available.');
      }
      const expiresAtMs = expiry(result, Date.now());
      if (expiresAtMs <= Date.now()) throw new Error('Nearby places expired while loading. Try preparing them again.');
      cache[kind] = { uid, ...input, expiresAtMs, result };
      listPatch(kind, { status: 'ready', candidates: result.candidates.filter(place => kind === 'canonical'
        ? place.type === 'gathr_venue' : place.type === 'external_place'), error: '', retryAtMs: 0 }, sessionId);
      const currentState = useCheckInReadinessStore.getState();
      if (currentState.sessionId === sessionId) useCheckInReadinessStore.setState({ preparation: {
        ...currentState.preparation, expiresAtMs: Math.min(currentState.preparation.expiresAtMs, expiresAtMs),
      } });
    }).catch(error => {
      if (active.get(kind) !== request || controller.signal.aborted) return;
      listPatch(kind, { status: 'error', error: error instanceof Error ? error.message : 'Nearby places could not be prepared. Try again.',
        retryAtMs: Date.now() + RETRY_MS }, sessionId);
    }).finally(() => { if (active.get(kind) === request) active.delete(kind); });
  }
}

export function requestCheckInPreparationRetry(kind: Kind | 'all' = 'all') {
  prepareCheckInPlaces(kind);
}

export function cancelCheckInPreparation() {
  for (const request of active.values()) request.controller.abort();
  active.clear();
  const state = useCheckInReadinessStore.getState();
  const preparation = { ...state.preparation };
  for (const kind of ['canonical', 'external'] as const) {
    if (preparation[kind].status === 'loading') preparation[kind] = { ...preparation[kind], status: 'idle' };
  }
  useCheckInReadinessStore.setState({ preparation });
}

/** Clear owner-scoped transient cache on logout; timestamps contain no location. */
export function clearCheckInPreparationCache() {
  cancelCheckInPreparation();
  delete cache.canonical;
  delete cache.external;
}
