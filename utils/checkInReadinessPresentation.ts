import type { CheckInReadinessStore } from '../store/checkInReadinessStore';
import { CHECK_IN_READINESS, isFreshReadiness, projectedReadinessMs } from './checkInReadiness';

// At the smaller ring's radius this leaves an arc longer than both rounded caps.
export const UNVERIFIED_RING_PROGRESS_MAX = 0.92;

type PresentationState = Pick<CheckInReadinessStore,
  'sessionId' | 'acceptedProgress' | 'evidence' | 'appActive' | 'interruptedAtMs' | 'serviceError' | 'progressPaused'>;

/** A timer smooths accepted evidence; it cannot invent an unacknowledged baseline. */
export function presentedCheckInReadiness(state: PresentationState, nowMs: number) {
  const accepted = state.acceptedProgress;
  if (!accepted || accepted.sessionId !== state.sessionId) return { hereMs: 0, placeMs: 0 };
  const age = nowMs - accepted.receivedAtMs;
  const projecting = state.appActive && !state.progressPaused && !state.serviceError
    && state.interruptedAtMs === null && age >= 0 && age <= CHECK_IN_READINESS.maxSampleGapMs
    && isFreshReadiness(state.evidence, nowMs);
  const extra = projecting ? age : 0;
  const local = projecting ? projectedReadinessMs(state.evidence, nowMs) : state.evidence;
  return {
    hereMs: Math.min(CHECK_IN_READINESS.hereMs, local.hereMs, accepted.hereMs + extra),
    placeMs: Math.min(CHECK_IN_READINESS.placeMs, local.placeMs, accepted.placeMs + (
      projecting && state.evidence.previous?.accuracyMeters !== null
      && (state.evidence.previous?.accuracyMeters ?? Infinity) <= CHECK_IN_READINESS.placeAccuracyMetres ? extra : 0
    )),
  };
}
