import type { BoundCheckInReadiness, CheckInQualifiedArrival, CheckInReadinessReceipt } from '../types/social';
import { CHECK_IN_READINESS, isFreshReadiness, readinessDistance, type ReadinessSample, type ReadinessState } from './checkInReadiness';

export function validReadinessReceipt(value: CheckInReadinessReceipt | null, sessionId: string, sequence: number, nowMs: number): value is CheckInReadinessReceipt {
  return !!value && value.protocolVersion === 1 && value.sessionId === sessionId && value.sequence === sequence
    && Number.isFinite(value.hereQualifyingMs) && value.hereQualifyingMs >= 0 && value.hereQualifyingMs <= CHECK_IN_READINESS.hereMs
    && Number.isFinite(value.placeQualifyingMs) && value.placeQualifyingMs >= 0 && value.placeQualifyingMs <= CHECK_IN_READINESS.placeMs
    && Number.isFinite(value.expiresAtMs) && value.expiresAtMs > nowMs
    && value.expiresAtMs <= nowMs + CHECK_IN_READINESS.maxSampleGapMs + CHECK_IN_READINESS.receiptClockSkewMs
    && (value.arrival === undefined || validQualifiedArrival(value.arrival, sessionId, nowMs));
}

export function validQualifiedArrival(value: CheckInQualifiedArrival | null | undefined, sessionId: string, nowMs: number): value is CheckInQualifiedArrival {
  return !!value && !!sessionId && value.sessionId === sessionId
    && value.here === true && typeof value.place === 'boolean'
    && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90
    && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180
    && Number.isFinite(value.accuracyMeters) && value.accuracyMeters >= 0
    && value.accuracyMeters <= (value.place ? CHECK_IN_READINESS.placeAccuracyMetres : CHECK_IN_READINESS.hereAccuracyMetres)
    && Number.isFinite(value.capturedAtMs) && value.capturedAtMs <= nowMs + CHECK_IN_READINESS.receiptClockSkewMs
    && Number.isFinite(value.expiresAtMs) && value.expiresAtMs > nowMs
    && value.expiresAtMs <= nowMs + CHECK_IN_READINESS.qualifiedArrivalMs + CHECK_IN_READINESS.receiptClockSkewMs;
}

/** Uncertainty is not departure. Match the backend's confidence-aware lease revocation. */
export function qualifiedArrivalDeparture(arrival: CheckInQualifiedArrival, sample: ReadinessSample, previousDriving: ReadinessSample | null = null) {
  const accuracy = sample.accuracyMeters;
  if (accuracy === null || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > CHECK_IN_READINESS.hereAccuracyMetres) return false;
  if (readinessDistance(arrival, sample) - Math.max(accuracy, arrival.accuracyMeters) > CHECK_IN_READINESS.departureRadiusMetres) return true;
  return sample.speedMetersPerSecond !== null && sample.speedMetersPerSecond >= CHECK_IN_READINESS.drivingSpeedMps
    && !!previousDriving && previousDriving.speedMetersPerSecond !== null
    && previousDriving.speedMetersPerSecond >= CHECK_IN_READINESS.drivingSpeedMps
    && sample.capturedAtMs > previousDriving.capturedAtMs && sample.capturedAtMs - previousDriving.capturedAtMs <= 60_000
    && previousDriving.accuracyMeters !== null && previousDriving.accuracyMeters <= CHECK_IN_READINESS.hereAccuracyMetres
    && readinessDistance(previousDriving, sample) - Math.max(accuracy, previousDriving.accuracyMeters) > CHECK_IN_READINESS.stationaryRadiusMetres;
}

export function readinessLevels(evidence: ReadinessState, receipt: CheckInReadinessReceipt | null, sessionId: string, nowMs: number) {
  const fresh = isFreshReadiness(evidence, nowMs);
  const verified = !!receipt && receipt.protocolVersion === 1 && receipt.sessionId === sessionId && receipt.expiresAtMs > nowMs;
  return {
    here: fresh && evidence.hereMs >= CHECK_IN_READINESS.hereMs && verified && receipt.hereQualifyingMs >= CHECK_IN_READINESS.hereMs,
    place: fresh && evidence.placeMs >= CHECK_IN_READINESS.placeMs && verified && receipt.placeQualifyingMs >= CHECK_IN_READINESS.placeMs,
  };
}

export function validBoundReadiness(grant: BoundCheckInReadiness | null, target: {
  type: BoundCheckInReadiness['locationType']; venueId?: string; placeCandidateId?: string;
}, readinessSessionId: string, nowMs: number): grant is BoundCheckInReadiness {
  return !!grant && grant.protocolVersion === 1 && grant.readinessSessionId === readinessSessionId
    && typeof grant.eligibilitySessionId === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(grant.eligibilitySessionId)
    && grant.locationType === target.type && typeof grant.exactPrivateAllowed === 'boolean'
    && (target.type === 'gathr_venue'
      ? !!target.venueId && grant.venueId === target.venueId && !grant.placeCandidateId
      : !!target.placeCandidateId && grant.placeCandidateId === target.placeCandidateId && !grant.venueId)
    && (!grant.exactPrivateAllowed || target.type === 'private_place')
    && Number.isFinite(grant.expiresAtMs) && grant.expiresAtMs > nowMs
    && grant.expiresAtMs <= nowMs + 5 * 60_000 + CHECK_IN_READINESS.receiptClockSkewMs;
}
