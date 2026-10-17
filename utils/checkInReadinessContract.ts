import type { BoundCheckInReadiness, CheckInReadinessReceipt } from '../types/social';
import { CHECK_IN_READINESS, isFreshReadiness, type ReadinessState } from './checkInReadiness';

export function validReadinessReceipt(value: CheckInReadinessReceipt | null, sessionId: string, sequence: number, nowMs: number): value is CheckInReadinessReceipt {
  return !!value && value.protocolVersion === 1 && value.sessionId === sessionId && value.sequence === sequence
    && Number.isFinite(value.hereQualifyingMs) && value.hereQualifyingMs >= 0 && value.hereQualifyingMs <= CHECK_IN_READINESS.hereMs
    && Number.isFinite(value.placeQualifyingMs) && value.placeQualifyingMs >= 0 && value.placeQualifyingMs <= CHECK_IN_READINESS.placeMs
    && Number.isFinite(value.expiresAtMs) && value.expiresAtMs > nowMs
    && value.expiresAtMs <= nowMs + CHECK_IN_READINESS.maxSampleGapMs + CHECK_IN_READINESS.receiptClockSkewMs;
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
