import { create } from 'zustand';

import type { BoundCheckInReadiness, CheckInQualifiedArrival, CheckInReadinessReceipt, NearbyCheckInPlaceCandidate } from '../types/social';
import { emptyReadiness, readinessDistance, type CheckInLocationMode, type ReadinessState } from '../utils/checkInReadiness';
import { validQualifiedArrival } from '../utils/checkInReadinessContract';

export interface CheckInPreparedList {
  status: 'idle' | 'loading' | 'ready' | 'error';
  candidates: NearbyCheckInPlaceCandidate[];
  error: string;
  retryAtMs: number;
}
export interface CheckInPreparation {
  sessionId: string;
  latitude: number;
  longitude: number;
  expiresAtMs: number;
  canonical: CheckInPreparedList;
  external: CheckInPreparedList;
}
export function emptyCheckInPreparation(): CheckInPreparation {
  const list = (): CheckInPreparedList => ({ status: 'idle', candidates: [], error: '', retryAtMs: 0 });
  return { sessionId: '', latitude: 0, longitude: 0, expiresAtMs: 0, canonical: list(), external: list() };
}

export interface CheckInReadinessStore {
  uid: string | null;
  mode: CheckInLocationMode;
  preferencesLoaded: boolean;
  foregroundGranted: boolean;
  appActive: boolean;
  interruptedAtMs: number | null;
  resumeAfterCheckIn: boolean;
  evidence: ReadinessState;
  sessionId: string;
  receipt: CheckInReadinessReceipt | null;
  serviceError: boolean;
  lastPromptAtMs: number;
  grant: BoundCheckInReadiness | null;
  restorePickerOnReturn: boolean;
  arrival: CheckInQualifiedArrival | null;
  attempt: { arrival: CheckInQualifiedArrival; capturedAtMs: number } | null;
  preparation: CheckInPreparation;
  /** Explicit safety revocation only; lease expiry does not revoke an in-flight bind response. */
  revocationRevision: number;
  lastSampleRequestAtMs: number | null;
  sampleSequence: number;
}

// Sensitive evidence and bound grants stay in memory only. Never persist raw fixes, place IDs or labels.
export const useCheckInReadinessStore = create<CheckInReadinessStore>(() => ({
  uid: null, mode: 'standard', preferencesLoaded: false, foregroundGranted: false,
  appActive: false, interruptedAtMs: null, resumeAfterCheckIn: false,
  evidence: emptyReadiness(), sessionId: '', receipt: null,
  serviceError: false, lastPromptAtMs: 0, grant: null, restorePickerOnReturn: false,
  arrival: null, attempt: null, preparation: emptyCheckInPreparation(),
  revocationRevision: 0,
  lastSampleRequestAtMs: null,
  sampleSequence: 0,
}));

export function resetCheckInReadinessOwner(uid: string | null) {
  useCheckInReadinessStore.setState({
    uid, mode: 'standard', preferencesLoaded: false, foregroundGranted: false,
    interruptedAtMs: null, resumeAfterCheckIn: false,
    evidence: emptyReadiness(), sessionId: '', receipt: null, serviceError: false,
    lastPromptAtMs: 0, grant: null, restorePickerOnReturn: false,
    arrival: null, attempt: null, preparation: emptyCheckInPreparation(),
    revocationRevision: useCheckInReadinessStore.getState().revocationRevision + 1,
    lastSampleRequestAtMs: null,
    sampleSequence: 0,
  });
}

/** Prepared evidence is in-memory and owner/session scoped, never a saved GPS override. */
export function qualifiedArrivalForState(state: CheckInReadinessStore, nowMs = Date.now()): CheckInQualifiedArrival | null {
  if (!state.uid || state.mode === 'basic' || !state.foregroundGranted) return null;
  const current = validQualifiedArrival(state.arrival, state.sessionId, nowMs) ? state.arrival : null;
  const attempt = validQualifiedArrival(state.attempt?.arrival, state.sessionId, nowMs) ? state.attempt!.arrival : null;
  if (current?.place && !attempt?.place) return current;
  return attempt || current;
}

export function preparedReadinessLevels(state: CheckInReadinessStore, nowMs = Date.now()) {
  const arrival = qualifiedArrivalForState(state, nowMs);
  const prepared = state.preparation.sessionId === state.sessionId && state.preparation.expiresAtMs > nowMs;
  const publicVenues = !!arrival?.place && prepared && state.preparation.canonical.status === 'ready';
  const external = !!arrival?.place && prepared && state.preparation.external.status === 'ready';
  return { here: !!arrival?.here, place: publicVenues && external, publicVenues, external };
}

/** Same public footprint distance as the server; selecting a pool item is not authorization. */
function candidateDistance(origin: CheckInQualifiedArrival, place: NearbyCheckInPlaceCandidate): number {
  const boundary = place.checkInBoundary;
  if (!boundary || boundary.length < 4 || boundary.length > 256
    || boundary.some(point => !Number.isFinite(point.lat) || Math.abs(point.lat) > 85 || !Number.isFinite(point.lon) || Math.abs(point.lon) > 180)
    || boundary[0].lat !== boundary[boundary.length - 1].lat || boundary[0].lon !== boundary[boundary.length - 1].lon) return readinessDistance(origin, place);
  const xScale = 6_371_000 * Math.PI / 180 * Math.cos(origin.latitude * Math.PI / 180);
  const yScale = 6_371_000 * Math.PI / 180;
  let inside = false;
  let nearest = Infinity;
  for (let index = 1; index < boundary.length; index += 1) {
    const a = boundary[index - 1], b = boundary[index];
    const ax = (a.lon - origin.longitude) * xScale, ay = (a.lat - origin.latitude) * yScale;
    const bx = (b.lon - origin.longitude) * xScale, by = (b.lat - origin.latitude) * yScale;
    if ((ay > 0) !== (by > 0) && 0 < ax + (bx - ax) * -ay / (by - ay)) inside = !inside;
    const dx = bx - ax, dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
    nearest = Math.min(nearest, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return inside ? 0 : nearest;
}

export function preparedCandidatesForArrival(state: CheckInReadinessStore, kind: 'canonical' | 'external', nowMs = Date.now()) {
  const arrival = qualifiedArrivalForState(state, nowMs);
  if (!arrival || state.preparation.sessionId !== state.sessionId || state.preparation.expiresAtMs <= nowMs
    || state.preparation[kind].status !== 'ready') return [];
  const radius = 50 + Math.min(arrival.accuracyMeters, 25);
  return state.preparation[kind].candidates
    .map(place => ({ ...place, distanceMetres: candidateDistance(arrival, place) }))
    .filter(place => place.distanceMetres <= radius)
    .map(place => ({ ...place, distanceMetres: Math.round(place.distanceMetres) }))
    .sort((left, right) => left.distanceMetres - right.distanceMetres);
}

export function captureCheckInAttempt(uid: string, requirePlace: boolean, nowMs = Date.now()): CheckInQualifiedArrival | null {
  const state = useCheckInReadinessStore.getState();
  const levels = preparedReadinessLevels(state, nowMs);
  const arrival = qualifiedArrivalForState(state, nowMs);
  if (state.uid !== uid || !state.appActive || !arrival || !(requirePlace ? levels.publicVenues || levels.external : levels.here)) return null;
  useCheckInReadinessStore.setState({ attempt: { arrival: { ...arrival }, capturedAtMs: nowMs } });
  return arrival;
}

export function clearCheckInAttempt() {
  useCheckInReadinessStore.setState({ attempt: null });
}
