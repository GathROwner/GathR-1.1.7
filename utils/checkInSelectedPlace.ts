import { preparedCandidatesForArrival, qualifiedArrivalForState, type CheckInReadinessStore } from '../store/checkInReadinessStore';
import type { CheckInQualifiedArrival } from '../types/social';
import { CHECK_IN_READINESS, readinessDistance } from './checkInReadiness';

export interface SelectedExternalPlace {
  uid: string;
  locationKey: string | null;
  candidateId: string;
  arrival: CheckInQualifiedArrival;
  revocationRevision: number;
}

/** Capture identity from the owner-scoped server-prepared pool, never route labels. */
export function captureSelectedExternalPlace(state: CheckInReadinessStore, candidateId: string, nowMs = Date.now()): SelectedExternalPlace | null {
  const arrival = qualifiedArrivalForState(state, nowMs);
  const candidate = preparedCandidatesForArrival(state, 'external', nowMs).find(place => place.id === candidateId && place.type === 'external_place');
  if (!state.uid || !arrival?.place || !candidate
    || (candidate.locationKey !== undefined && !/^external:[a-f0-9]{32}$/.test(candidate.locationKey))) return null;
  return { uid: state.uid, candidateId: candidate.id, locationKey: candidate.locationKey || null,
    arrival: { ...arrival }, revocationRevision: state.revocationRevision };
}

/** Resolve only the exact same public source record in a currently eligible pool. */
export function resolveSelectedExternalPlace(state: CheckInReadinessStore, selected: SelectedExternalPlace | null, nowMs = Date.now()) {
  if (!selected || state.uid !== selected.uid || !state.appActive || state.revocationRevision !== selected.revocationRevision) return null;
  const arrival = qualifiedArrivalForState(state, nowMs);
  if (!arrival?.place || readinessDistance(selected.arrival, arrival)
    - Math.max(selected.arrival.accuracyMeters, arrival.accuracyMeters) > CHECK_IN_READINESS.departureRadiusMetres) return null;
  const matches = preparedCandidatesForArrival(state, 'external', nowMs)
    .filter(place => place.type === 'external_place' && (selected.locationKey
      ? place.locationKey === selected.locationKey : place.id === selected.candidateId));
  return matches.length === 1 ? { candidate: matches[0], arrival } : null;
}
