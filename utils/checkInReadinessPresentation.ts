import type { CheckInReadinessStore } from '../store/checkInReadinessStore';
import { CHECK_IN_READINESS } from './checkInReadiness';

// At the smaller ring's radius this leaves an arc longer than both rounded caps.
export const UNVERIFIED_RING_PROGRESS_MAX = 0.92;

type PresentationState = Pick<CheckInReadinessStore, 'sessionId' | 'acceptedProgress'>;

/** Display acknowledged dwell only. Pauses cannot retract speculative seconds.
 * The observer clears the acknowledgement on a real session/departure reset;
 * readiness and prepared-place authorization remain independently enforced.
 */
export function presentedCheckInReadiness(state: PresentationState) {
  const accepted = state.acceptedProgress;
  if (!accepted || accepted.sessionId !== state.sessionId) return { hereMs: 0, placeMs: 0 };
  return {
    hereMs: Math.min(CHECK_IN_READINESS.hereMs, Math.max(0, accepted.hereMs)),
    placeMs: Math.min(CHECK_IN_READINESS.placeMs, Math.max(0, accepted.placeMs)),
  };
}
