import { emptyCheckInPreparation, qualifiedArrivalForState, useCheckInReadinessStore, type CheckInPreparedList, type CheckInReadinessStore } from '../store/checkInReadinessStore';
import type { CheckInPreparationPool, NearbyCheckInPlacesResult } from '../types/social';
import { CHECK_IN_READINESS, readinessDistance } from '../utils/checkInReadiness';
import { discoverNearbyCheckInPlaces, listNearbyCanonicalCheckInVenues } from './socialService';

type Kind = 'canonical' | 'external';
const CACHE_MS = 5 * 60_000;
const CACHE_RADIUS_METRES = 20;
const RETRY_MS = 60_000;
const MANUAL_LOOKUP_MAX_SAMPLE_AGE_MS = 60_000;
const DAY_MS = 24 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;
const POOL_LEASE_MS = 15 * 60_000;
const POOL_SOURCE_MS = 6 * HOUR_MS;
const RENEWALS_PER_HOUR = 8;
// One combined warmup uses one of the existing twenty daily OSM searches.
// Reserve four for explicit retry. Manual canonical refresh uses this same
// request/budget unless exhausted allowance requires canonical-only fallback.
const AUTOMATIC_EXTERNAL_BUDGET = 16;
const TOTAL_EXTERNAL_BUDGET = 20;
const VERSION_ERROR = 'Nearby place preparation is unavailable in this server version. Your choices are saved.';
const PROVIDER_ERROR = 'Public places could not be prepared.';
const ALLOWANCE_ERROR = 'Nearby public-place preparation has reached its search allowance.';
type Cached = { uid: string; latitude: number; longitude: number; expiresAtMs: number;
  result: NearbyCheckInPlacesResult; externalError: string; retryAtMs: number;
  pool?: CheckInPreparationPool; renewalRetryAtMs?: number; renewalFailures?: number; renewalError?: string; renewalDisabled?: boolean };
// Failure retention is independent of candidate TTL. Clocks and disposable
// readiness sessions cannot silently restart a failed lookup in this area.
type FailedArea = { uid: string; latitude: number; longitude: number; accuracyMeters: number; canonicalError?: string; externalError: string; retryAtMs: number };
type Request = { uid: string; sessionId: string; latitude: number; longitude: number; accuracyMeters: number; controller: AbortController; canonicalOnly: boolean;
  renewal?: boolean; revocationRevision: number };
let cache: Cached | null = null;
let active: Request | null = null;
let failedArea: FailedArea | null = null;
const requestTimes = new Map<string, number[]>();
const renewalTimes = new Map<string, number[]>();
let awaitingQualifiedRediscovery: string | null = null;

function listPatch(kind: Kind, value: Partial<CheckInPreparedList>, sessionId: string) {
  const state = useCheckInReadinessStore.getState();
  if (state.sessionId !== sessionId || state.preparation.sessionId !== sessionId) return;
  useCheckInReadinessStore.setState({ preparation: { ...state.preparation, [kind]: { ...state.preparation[kind], ...value } } });
}

function expiry(value: NearbyCheckInPlacesResult, now: number, pool?: CheckInPreparationPool) {
  const raw = value.expiresAt;
  const object = raw && typeof raw === 'object' ? raw as unknown as Record<string, unknown> : null;
  const seconds = object?.seconds ?? object?._seconds;
  const nanoseconds = object?.nanoseconds ?? object?._nanoseconds ?? 0;
  const timestamp = raw && typeof raw === 'object' && 'toMillis' in raw && typeof raw.toMillis === 'function'
    ? raw.toMillis() : raw instanceof Date ? raw.getTime() : typeof raw === 'number' ? raw
      : typeof seconds === 'number' && typeof nanoseconds === 'number' ? seconds * 1000 + nanoseconds / 1_000_000 : pool?.expiresAtMs ?? now + CACHE_MS;
  return Math.min(now + (pool ? POOL_LEASE_MS : CACHE_MS), timestamp, pool?.expiresAtMs ?? Infinity);
}

function preparationPool(value: NearbyCheckInPlacesResult, origin: { latitude: number; longitude: number }, now: number): CheckInPreparationPool | undefined {
  const pool = value.preparationPool;
  if (!pool || typeof pool.id !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(pool.id)
    || ![pool.expiresAtMs, pool.refreshAtMs, pool.sourceExpiresAtMs, pool.originLatitude, pool.originLongitude].every(Number.isFinite)
    || Math.abs(pool.originLatitude) > 85 || Math.abs(pool.originLongitude) > 180
    || pool.expiresAtMs <= now || pool.expiresAtMs > now + POOL_LEASE_MS + CHECK_IN_READINESS.receiptClockSkewMs
    || pool.sourceExpiresAtMs > now + POOL_SOURCE_MS + CHECK_IN_READINESS.receiptClockSkewMs
    || pool.expiresAtMs > pool.sourceExpiresAtMs || pool.refreshAtMs > pool.expiresAtMs || pool.refreshAtMs <= now
    || readinessDistance(origin, { latitude: pool.originLatitude, longitude: pool.originLongitude }) > 1) return undefined;
  return pool;
}

function externalIdentities(value: NearbyCheckInPlacesResult) {
  return value.candidates.filter(place => place.type === 'external_place')
    .map(place => JSON.stringify([place.id, place.locationKey ?? null])).sort().join('|');
}

function applyCache(saved: Cached, sessionId: string) {
  const state = useCheckInReadinessStore.getState();
  if (state.uid !== saved.uid || state.sessionId !== sessionId) return;
  const canonical = { status: 'ready' as const, candidates: saved.result.candidates.filter(place => place.type === 'gathr_venue'), error: '', retryAtMs: 0 };
  const external: CheckInPreparedList = saved.externalError
    ? { status: 'error', candidates: [], error: saved.externalError, retryAtMs: saved.retryAtMs }
    : { status: 'ready', candidates: saved.result.candidates.filter(place => place.type === 'external_place'), error: '', retryAtMs: 0 };
  const sameList = (left: CheckInPreparedList, right: CheckInPreparedList) => left.status === right.status
    && left.error === right.error && left.retryAtMs === right.retryAtMs && left.candidates.length === right.candidates.length
    && left.candidates.every((candidate, index) => candidate === right.candidates[index]);
  if (state.preparation.sessionId === sessionId && state.preparation.expiresAtMs === saved.expiresAtMs
    && state.preparation.latitude === saved.latitude && state.preparation.longitude === saved.longitude
    && sameList(state.preparation.canonical, canonical) && sameList(state.preparation.external, external)) return;
  useCheckInReadinessStore.setState({ preparation: {
    ...state.preparation, sessionId, latitude: saved.latitude, longitude: saved.longitude,
    expiresAtMs: saved.expiresAtMs, canonical, external,
  } });
}

/** Renewal never grants presence or silently falls back to the ordinary discovery budget. */
function renewPool(saved: Cached, state: CheckInReadinessStore, manual: Kind | 'all' | null, now: number) {
  const pool = saved.pool!;
  if (saved.renewalDisabled || now < (saved.renewalRetryAtMs || 0) || (!manual && now < pool.refreshAtMs)) return;
  const arrival = qualifiedArrivalForState(state, now);
  const sample = state.evidence.previous!;
  if (!arrival?.here || arrival.sessionId !== state.sessionId || readinessDistance(saved, sample) > CACHE_RADIUS_METRES) return;
  const uid = saved.uid;
  const attempts = (renewalTimes.get(uid) || []).filter(time => time > now - HOUR_MS);
  if (attempts.length >= RENEWALS_PER_HOUR) {
    cache = { ...saved, renewalRetryAtMs: attempts[0] + HOUR_MS, renewalError: 'Nearby preparation renewal has reached its hourly allowance.' };
    return;
  }
  renewalTimes.set(uid, [...attempts, now]);
  // A rolled-back server may ignore the flag and perform a normal lookup.
  // Reserve conservatively; refund only an acknowledged renewal/typed refusal.
  requestTimes.set(uid, [...(requestTimes.get(uid) || []).filter(time => time > now - DAY_MS), now]);
  let refunded = false;
  const refund = () => {
    if (refunded) return;
    refunded = true;
    const times = [...(requestTimes.get(uid) || [])];
    const index = times.lastIndexOf(now);
    if (index >= 0) times.splice(index, 1);
    requestTimes.set(uid, times);
  };
  const controller = new AbortController();
  const request: Request = { uid, sessionId: state.sessionId, latitude: saved.latitude, longitude: saved.longitude,
    accuracyMeters: sample.accuracyMeters!, controller, canonicalOnly: false, renewal: true, revocationRevision: state.revocationRevision };
  active = request;
  const currentRequest = () => {
    const latest = useCheckInReadinessStore.getState();
    return active === request && !controller.signal.aborted && latest.uid === uid
      && latest.sessionId === request.sessionId && latest.revocationRevision === request.revocationRevision;
  };
  void discoverNearbyCheckInPlaces({ latitude: sample.latitude, longitude: sample.longitude, accuracyMeters: sample.accuracyMeters!,
    capturedAtMs: sample.capturedAtMs, preparation: true,
    renewPreparationPool: { poolId: pool.id, readinessSessionId: state.sessionId } }, { signal: controller.signal, timeoutMs: 25_000 })
    .then(result => {
      const renewed = preparationPool(result, saved, Date.now());
      const acknowledged = result.preparationReused === true && renewed && renewed.id === pool.id
        && renewed.sourceExpiresAtMs === pool.sourceExpiresAtMs && result.preparationRadiusMetres === 175
        && result.externalLookupStatus === 'complete' && externalIdentities(result) === externalIdentities(saved.result);
      // Cost accounting may accept a known zero-discovery acknowledgement even
      // when a later owner/session change correctly prevents publishing its data.
      if (acknowledged) refund();
      if (!currentRequest()) return;
      if (!acknowledged) {
        cache = { ...saved, renewalDisabled: true };
        throw new Error('This server could not confirm renewal of your prepared places.');
      }
      const expiresAtMs = expiry(result, Date.now(), renewed);
      if (expiresAtMs <= Date.now()) throw new Error('Prepared places expired before renewal was received.');
      refund();
      cache = { ...saved, result, pool: renewed, expiresAtMs, renewalRetryAtMs: 0, renewalFailures: 0, renewalError: '', externalError: '', retryAtMs: 0 };
      failedArea = null; awaitingQualifiedRediscovery = null;
      applyCache(cache, request.sessionId);
    }).catch(error => {
      const condition = (error as { details?: { condition?: string } })?.details?.condition;
      if (['rediscovery_required', 'preparation_renewal_rate_limited', 'preparation_renewal_unqualified'].includes(condition || '')) refund();
      if (!currentRequest()) return;
      if (condition === 'rediscovery_required') {
        cache = null; failedArea = null; awaitingQualifiedRediscovery = null; active = null;
        useCheckInReadinessStore.setState({ preparation: emptyCheckInPreparation() });
        prepareCheckInPlaces(manual);
        return;
      }
      const failures = (saved.renewalFailures || 0) + 1;
      cache = { ...(cache?.pool?.id === pool.id ? cache : saved), renewalFailures: failures,
        renewalRetryAtMs: Date.now() + Math.min(5 * RETRY_MS, RETRY_MS * 2 ** Math.min(3, failures - 1)),
        renewalError: error instanceof Error ? error.message : 'Prepared places could not be renewed.' };
    }).finally(() => { if (active === request) active = null; });
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
  if (cache?.pool && cache.uid === uid && cache.expiresAtMs <= now) {
    const expired = cache;
    cache = null;
    if (expired.pool!.sourceExpiresAtMs > now && (expired.renewalError || expired.renewalDisabled)) {
      const message = 'Prepared places expired while renewal was unavailable. Retry to refresh your choices.';
      failedArea = { uid, latitude: sample.latitude, longitude: sample.longitude, accuracyMeters: sample.accuracyMeters,
        canonicalError: message, externalError: message, retryAtMs: expired.renewalRetryAtMs || now };
    } else awaitingQualifiedRediscovery = uid;
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
  if (active?.uid === uid && active.revocationRevision === state.revocationRevision && readinessDistance(active, sample) <= CACHE_RADIUS_METRES) {
    // A nearby session replacement attaches to the area/owner's existing work.
    active.sessionId = sessionId;
    if (active.renewal && cache?.uid === uid && cache.expiresAtMs > now) applyCache(cache, sessionId);
    else if (!active.renewal) {
      if (state.preparation.canonical.status !== 'ready') listPatch('canonical', { status: 'loading', error: '' }, sessionId);
      if (!active.canonicalOnly) listPatch('external', { status: 'loading', error: '' }, sessionId);
    }
    return;
  }
  if (cache?.uid === uid && cache.expiresAtMs > now && readinessDistance(cache, sample) <= CACHE_RADIUS_METRES) {
    applyCache(cache, sessionId);
    state = useCheckInReadinessStore.getState();
  }
  const canonicalReady = state.preparation.canonical.status === 'ready';
  const externalReady = state.preparation.external.status === 'ready';
  if (cache?.pool && cache.uid === uid && cache.expiresAtMs > now && readinessDistance(cache, sample) <= CACHE_RADIUS_METRES) {
    renewPool(cache, state, manual, now);
    return;
  }
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
  if (awaitingQualifiedRediscovery === uid) {
    if (!qualifiedArrivalForState(state, now)?.here) return;
    awaitingQualifiedRediscovery = null;
  }

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
    accuracyMeters: sample.accuracyMeters, controller, canonicalOnly, revocationRevision: state.revocationRevision };
  active = request;
  if (!canonicalReady) listPatch('canonical', { status: 'loading', error: '', retryAtMs: 0 }, sessionId);
  if (!canonicalOnly) listPatch('external', { status: 'loading', error: '', retryAtMs: 0 }, sessionId);
  const input = { latitude: sample.latitude, longitude: sample.longitude,
    accuracyMeters: sample.accuracyMeters, capturedAtMs: sample.capturedAtMs, preparation: true as const };
  const lookup = canonicalOnly ? listNearbyCanonicalCheckInVenues : discoverNearbyCheckInPlaces;
  void lookup(input, { signal: controller.signal, timeoutMs: 25_000 }).then(result => {
    const latest = useCheckInReadinessStore.getState();
    if (active !== request || latest.uid !== uid || latest.sessionId !== request.sessionId
      || latest.revocationRevision !== request.revocationRevision || controller.signal.aborted) return;
    if (result.preparationRadiusMetres !== 175) throw new Error(VERSION_ERROR);
    if (!canonicalOnly && result.externalLookupStatus !== 'complete' && result.externalLookupStatus !== 'partial_unavailable') {
      throw new Error('Nearby place preparation could not be confirmed. Your choices are saved.');
    }
    const pool = !canonicalOnly && result.externalLookupStatus === 'complete' && result.preparationReused !== true
      ? preparationPool(result, input, Date.now()) : undefined;
    const expiresAtMs = expiry(result, Date.now(), pool);
    if (expiresAtMs <= Date.now()) throw new Error('Nearby places expired while loading. Try preparing them again.');
    const externalError = canonicalOnly ? ALLOWANCE_ERROR
      : result.externalLookupStatus === 'partial_unavailable' ? PROVIDER_ERROR : '';
    cache = { uid, ...input, ...(pool ? { latitude: pool.originLatitude, longitude: pool.originLongitude, pool } : {}), expiresAtMs, result, externalError,
      retryAtMs: canonicalOnly ? allowanceRetryAtMs : externalError ? Date.now() + RETRY_MS : 0 };
    failedArea = externalError ? { uid, latitude: request.latitude, longitude: request.longitude, accuracyMeters: request.accuracyMeters,
      externalError, retryAtMs: cache.retryAtMs } : null;
    // A marked partial response proves the canonical pool complete even if empty.
    applyCache(cache, request.sessionId);
  }).catch(error => {
    if (active !== request || controller.signal.aborted) return;
    const latest = useCheckInReadinessStore.getState();
    if (latest.uid !== uid || latest.sessionId !== request.sessionId || latest.revocationRevision !== request.revocationRevision) return;
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
  cancelCheckInPreparation(); cache = null; failedArea = null; awaitingQualifiedRediscovery = null;
}
