import { emptyCheckInPreparation, useCheckInReadinessStore, type CheckInPreparedList } from '../store/checkInReadinessStore';
import type { NearbyCheckInPlacesResult } from '../types/social';
import { CHECK_IN_READINESS, readinessDistance } from '../utils/checkInReadiness';
import { discoverNearbyCheckInPlaces, listNearbyCanonicalCheckInVenues } from './socialService';

type Kind = 'canonical' | 'external';
const CACHE_MS = 5 * 60_000;
const CACHE_RADIUS_METRES = 20;
const RETRY_MS = 60_000;
const MANUAL_LOOKUP_MAX_SAMPLE_AGE_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;
// One combined warmup uses one of the existing twenty daily OSM searches.
// Reserve four for explicit retry. Manual canonical refresh uses this same
// request/budget unless exhausted allowance requires canonical-only fallback.
const AUTOMATIC_EXTERNAL_BUDGET = 16;
const TOTAL_EXTERNAL_BUDGET = 20;
const VERSION_ERROR = 'Nearby place preparation is unavailable in this server version. Your choices are saved.';
const PROVIDER_ERROR = 'Public places could not be prepared. Your nearby GathR venues are still available.';
const ALLOWANCE_ERROR = 'Nearby public-place preparation has reached its search allowance. GathR venues are still available.';
type Cached = { uid: string; latitude: number; longitude: number; expiresAtMs: number;
  result: NearbyCheckInPlacesResult; externalError: string; retryAtMs: number };
// Failure retention is independent of candidate TTL. Clocks and disposable
// readiness sessions cannot silently restart a failed lookup in this area.
type FailedArea = { uid: string; latitude: number; longitude: number; accuracyMeters: number; canonicalError?: string; externalError: string; retryAtMs: number };
type Request = { uid: string; sessionId: string; latitude: number; longitude: number; accuracyMeters: number; controller: AbortController; canonicalOnly: boolean };
let cache: Cached | null = null;
let active: Request | null = null;
let failedArea: FailedArea | null = null;
const requestTimes = new Map<string, number[]>();

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

function applyCache(saved: Cached, sessionId: string) {
  listPatch('canonical', { status: 'ready', candidates: saved.result.candidates.filter(place => place.type === 'gathr_venue'), error: '', retryAtMs: 0 }, sessionId);
  listPatch('external', saved.externalError
    ? { status: 'error', candidates: [], error: saved.externalError, retryAtMs: saved.retryAtMs }
    : { status: 'ready', candidates: saved.result.candidates.filter(place => place.type === 'external_place'), error: '', retryAtMs: 0 }, sessionId);
  const state = useCheckInReadinessStore.getState();
  if (state.sessionId === sessionId) useCheckInReadinessStore.setState({ preparation: {
    ...state.preparation, expiresAtMs: Math.min(state.preparation.expiresAtMs, saved.expiresAtMs),
  } });
}

/** One coordinated warmup supplies both lists during countdown, not one call per list/sample. */
export function prepareCheckInPlaces(manual: Kind | 'all' | null = null): void {
  const now = Date.now();
  let state = useCheckInReadinessStore.getState();
  const sample = state.evidence.previous;
  if (!state.uid || state.mode === 'basic' || !state.appActive || !state.foregroundGranted || !state.sessionId || !sample
    || sample.accuracyMeters === null || !Number.isFinite(sample.accuracyMeters) || sample.accuracyMeters < 0
    || sample.accuracyMeters > CHECK_IN_READINESS.hereAccuracyMetres
    || (!manual && state.evidence.hereMs < 20_000)) return;
  const uid = state.uid;
  const sessionId = state.sessionId;
  const maxSampleAgeMs = manual ? MANUAL_LOOKUP_MAX_SAMPLE_AGE_MS : CHECK_IN_READINESS.maxSampleAgeMs;
  if (!Number.isFinite(sample.capturedAtMs) || now - sample.capturedAtMs < 0 || now - sample.capturedAtMs > maxSampleAgeMs) {
    if (manual) {
      if (state.preparation.sessionId !== sessionId || state.preparation.expiresAtMs <= now) {
        useCheckInReadinessStore.setState({ preparation: { ...emptyCheckInPreparation(), sessionId,
          latitude: sample.latitude, longitude: sample.longitude, expiresAtMs: now + CACHE_MS } });
      }
      for (const kind of ['canonical', 'external'] as const) {
        if (manual === kind || manual === 'all') listPatch(kind, { status: 'error',
          error: 'Location is updating. Retry once a recent location is available.' }, sessionId);
      }
    }
    return;
  }
  const failedAreaChanged = !!failedArea && (failedArea.uid !== uid
    || readinessDistance(failedArea, sample) - Math.max(failedArea.accuracyMeters, sample.accuracyMeters) > CACHE_RADIUS_METRES);
  if (failedAreaChanged) failedArea = null;
  if (state.preparation.sessionId !== sessionId || state.preparation.expiresAtMs <= now || failedAreaChanged) {
    useCheckInReadinessStore.setState({ preparation: { ...emptyCheckInPreparation(), sessionId,
      latitude: sample.latitude, longitude: sample.longitude, expiresAtMs: now + CACHE_MS } });
    state = useCheckInReadinessStore.getState();
  }
  const origin = { latitude: state.preparation.latitude, longitude: state.preparation.longitude };
  if (readinessDistance(origin, sample) > CACHE_RADIUS_METRES + sample.accuracyMeters) return;
  if (active?.uid === uid && readinessDistance(active, sample) <= CACHE_RADIUS_METRES) {
    // A nearby session replacement attaches to the area/owner's existing work.
    active.sessionId = sessionId;
    if (state.preparation.canonical.status !== 'ready') listPatch('canonical', { status: 'loading', error: '' }, sessionId);
    if (!active.canonicalOnly) listPatch('external', { status: 'loading', error: '' }, sessionId);
    return;
  }
  if (cache?.uid === uid && cache.expiresAtMs > now && readinessDistance(cache, sample) <= CACHE_RADIUS_METRES) {
    applyCache(cache, sessionId);
    state = useCheckInReadinessStore.getState();
  }
  const canonicalReady = state.preparation.canonical.status === 'ready';
  const externalReady = state.preparation.external.status === 'ready';
  if (failedArea && (!manual || failedArea.retryAtMs > now)) {
    listPatch('external', { status: 'error', candidates: [], error: failedArea.externalError, retryAtMs: failedArea.retryAtMs }, sessionId);
    if (!canonicalReady) listPatch('canonical', { status: 'error', candidates: [],
      error: failedArea.canonicalError || 'Nearby GathR venue preparation expired. Retry to refresh your choices.', retryAtMs: failedArea.retryAtMs }, sessionId);
    return;
  }
  if (canonicalReady && externalReady) return;
  if (manual && manual !== 'all' && state.preparation[manual].status === 'ready') return;
  if (!manual && (state.preparation.canonical.status === 'error' || state.preparation.external.status === 'error')) return;
  if (manual && Math.max(state.preparation.canonical.retryAtMs, state.preparation.external.retryAtMs) > now) return;

  const times = (requestTimes.get(uid) || []).filter(time => time > now - DAY_MS);
  requestTimes.set(uid, times);
  const budget = manual ? TOTAL_EXTERNAL_BUDGET : AUTOMATIC_EXTERNAL_BUDGET;
  const canonicalOnly = times.length >= budget;
  const allowanceRetryAtMs = times.length >= TOTAL_EXTERNAL_BUDGET ? times[0] + DAY_MS : 0;
  if (canonicalOnly) {
    failedArea = { uid, latitude: sample.latitude, longitude: sample.longitude, accuracyMeters: sample.accuracyMeters,
      externalError: ALLOWANCE_ERROR, retryAtMs: allowanceRetryAtMs };
    listPatch('external', { status: 'error', error: ALLOWANCE_ERROR, candidates: [], retryAtMs: allowanceRetryAtMs }, sessionId);
    // Keep usable canonical choices. When absent, one standalone fallback may
    // prepare them without spending another OSM search; never mark full public.
    if (canonicalReady) return;
  } else {
    requestTimes.set(uid, [...times, now]);
    // Only an explicit permitted retry or a genuinely new area reaches this
    // path after failure; candidate/session expiry alone cannot clear it.
    failedArea = null;
  }

  active?.controller.abort();
  const controller = new AbortController();
  const request: Request = { uid, sessionId, latitude: sample.latitude, longitude: sample.longitude,
    accuracyMeters: sample.accuracyMeters, controller, canonicalOnly };
  active = request;
  if (!canonicalReady) listPatch('canonical', { status: 'loading', error: '', retryAtMs: 0 }, sessionId);
  if (!canonicalOnly) listPatch('external', { status: 'loading', error: '', retryAtMs: 0 }, sessionId);
  const input = { latitude: sample.latitude, longitude: sample.longitude,
    accuracyMeters: sample.accuracyMeters, capturedAtMs: sample.capturedAtMs, preparation: true as const };
  const lookup = canonicalOnly ? listNearbyCanonicalCheckInVenues : discoverNearbyCheckInPlaces;
  void lookup(input, { signal: controller.signal, timeoutMs: 25_000 }).then(result => {
    const latest = useCheckInReadinessStore.getState();
    if (active !== request || latest.uid !== uid || latest.sessionId !== request.sessionId || controller.signal.aborted) return;
    if (result.preparationRadiusMetres !== 175) throw new Error(VERSION_ERROR);
    if (!canonicalOnly && result.externalLookupStatus !== 'complete' && result.externalLookupStatus !== 'partial_unavailable') {
      throw new Error('Nearby place preparation could not be confirmed. Your choices are saved.');
    }
    const expiresAtMs = expiry(result, Date.now());
    if (expiresAtMs <= Date.now()) throw new Error('Nearby places expired while loading. Try preparing them again.');
    const externalError = canonicalOnly ? ALLOWANCE_ERROR
      : result.externalLookupStatus === 'partial_unavailable' ? PROVIDER_ERROR : '';
    cache = { uid, ...input, expiresAtMs, result, externalError,
      retryAtMs: canonicalOnly ? allowanceRetryAtMs : externalError ? Date.now() + RETRY_MS : 0 };
    failedArea = externalError ? { uid, latitude: request.latitude, longitude: request.longitude, accuracyMeters: request.accuracyMeters,
      externalError, retryAtMs: cache.retryAtMs } : null;
    // A marked partial response proves the canonical pool complete even if empty.
    applyCache(cache, request.sessionId);
  }).catch(error => {
    if (active !== request || controller.signal.aborted) return;
    const latest = useCheckInReadinessStore.getState();
    if (latest.uid !== uid || latest.sessionId !== request.sessionId) return;
    const message = error instanceof Error ? error.message : 'Nearby places could not be prepared. Try again.';
    // Carry retry backoff across disposable sessions. A failed retry preserves
    // the last complete canonical pool and its original expiry, never extends it.
    const previous = cache?.uid === uid && cache.expiresAtMs > Date.now() && readinessDistance(cache, request) <= CACHE_RADIUS_METRES ? cache : null;
    cache = previous ? { ...previous, externalError: canonicalOnly ? ALLOWANCE_ERROR : message, retryAtMs: Date.now() + RETRY_MS } : null;
    failedArea = { uid, latitude: request.latitude, longitude: request.longitude, accuracyMeters: request.accuracyMeters,
      ...(!previous ? { canonicalError: message } : {}),
      externalError: canonicalOnly ? ALLOWANCE_ERROR : message, retryAtMs: Date.now() + RETRY_MS };
    if (latest.preparation.canonical.status !== 'ready') {
      listPatch('canonical', { status: 'error', error: message, retryAtMs: Date.now() + RETRY_MS }, request.sessionId);
    }
    if (!canonicalOnly) listPatch('external', { status: 'error', error: message, retryAtMs: Date.now() + RETRY_MS }, request.sessionId);
  }).finally(() => { if (active === request) active = null; });
}

export function requestCheckInPreparationRetry(kind: Kind | 'all' = 'all') {
  prepareCheckInPlaces(kind);
}

export function cancelCheckInPreparation() {
  active?.controller.abort(); active = null;
  const state = useCheckInReadinessStore.getState();
  const preparation = { ...state.preparation };
  for (const kind of ['canonical', 'external'] as const) {
    if (preparation[kind].status === 'loading') preparation[kind] = { ...preparation[kind], status: 'idle' };
  }
  useCheckInReadinessStore.setState({ preparation });
}

/** Clear owner-scoped transient cache on logout; budget timestamps contain no location. */
export function clearCheckInPreparationCache() {
  cancelCheckInPreparation(); cache = null; failedArea = null;
}
