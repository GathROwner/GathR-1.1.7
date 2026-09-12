/** Readiness is evidence, never consent. No timer alone can advance either ring. */
export const CHECK_IN_READINESS = {
  hereMs: 30_000,
  placeMs: 90_000,
  sampleIntervalMs: 10_000,
  maxSampleGapMs: 20_000,
  maxSampleAgeMs: 15_000,
  hereAccuracyMetres: 50,
  placeAccuracyMetres: 25,
  stationarySpeedMps: 0.7,
  drivingSpeedMps: 5,
  stationaryRadiusMetres: 20,
  drivingSuppressionMs: 30_000,
  promptCooldownMs: 24 * 60 * 60_000,
} as const;

export type CheckInLocationMode = 'standard' | 'basic' | 'proactive';
// This runtime has no background task/geofence integration. Never infer support from permission.
export const PROACTIVE_CHECK_IN_SUPPORTED = false;
export interface ReadinessPermissions {
  mode: CheckInLocationMode;
  foregroundGranted: boolean;
  backgroundGranted: boolean;
  notificationsGranted: boolean;
  appActive: boolean;
  backgroundSupported: boolean;
}
export function canCollectReadiness(permissions: ReadinessPermissions): boolean {
  if (permissions.mode === 'basic' || !permissions.foregroundGranted) return false;
  return permissions.appActive || (
    permissions.mode === 'proactive' && permissions.backgroundSupported && permissions.backgroundGranted
  );
}
export function canDeliverArrivalNotification(permissions: ReadinessPermissions): boolean {
  return permissions.mode === 'proactive' && permissions.backgroundSupported
    && permissions.foregroundGranted && permissions.backgroundGranted && permissions.notificationsGranted;
}

export interface ReadinessSample {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedMetersPerSecond: number | null;
  capturedAtMs: number;
}
export interface ReadinessState {
  hereMs: number;
  placeMs: number;
  anchor: ReadinessSample | null;
  previous: ReadinessSample | null;
  suppressedUntilMs: number;
  revision: number;
  reason: 'locating' | 'qualifying' | 'moving' | 'driving' | 'low_accuracy' | 'stale' | 'paused';
}
export function emptyReadiness(revision = 0, suppressedUntilMs = 0): ReadinessState {
  return { hereMs: 0, placeMs: 0, anchor: null, previous: null, suppressedUntilMs, revision, reason: 'locating' };
}
export function readinessDistance(a: Pick<ReadinessSample, 'latitude' | 'longitude'>, b: Pick<ReadinessSample, 'latitude' | 'longitude'>): number {
  const radians = Math.PI / 180;
  const sinLat = Math.sin((b.latitude - a.latitude) * radians / 2);
  const sinLon = Math.sin((b.longitude - a.longitude) * radians / 2);
  const h = sinLat ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * sinLon ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function pauseReadiness(state: ReadinessState): ReadinessState {
  return { ...emptyReadiness(state.revision + 1, state.suppressedUntilMs), reason: 'paused' };
}
export function isFreshReadiness(state: ReadinessState, nowMs: number): boolean {
  const age = nowMs - (state.previous?.capturedAtMs ?? 0);
  return state.reason === 'qualifying' && age >= 0 && age <= CHECK_IN_READINESS.maxSampleGapMs
    && nowMs >= state.suppressedUntilMs;
}

export function advanceReadiness(state: ReadinessState, sample: ReadinessSample, nowMs: number, allowed = true): ReadinessState {
  if (!allowed) return pauseReadiness(state);
  const reset = (reason: ReadinessState['reason'], suppression = state.suppressedUntilMs): ReadinessState => ({
    ...emptyReadiness(state.revision + 1, suppression), reason,
  });
  if (!Number.isFinite(sample.latitude) || Math.abs(sample.latitude) > 90
    || !Number.isFinite(sample.longitude) || Math.abs(sample.longitude) > 180
    || !Number.isFinite(sample.capturedAtMs) || sample.capturedAtMs > nowMs
    || nowMs - sample.capturedAtMs > CHECK_IN_READINESS.maxSampleAgeMs) return reset('stale');
  // Cached or out-of-order fixes cannot count twice, or keep old readiness fresh.
  if (state.previous && sample.capturedAtMs <= state.previous.capturedAtMs) {
    return isFreshReadiness(state, nowMs) ? state : reset('stale');
  }
  const speed = sample.speedMetersPerSecond;
  if (speed !== null && Number.isFinite(speed) && speed >= CHECK_IN_READINESS.drivingSpeedMps) {
    return reset('driving', nowMs + CHECK_IN_READINESS.drivingSuppressionMs);
  }
  if (nowMs < state.suppressedUntilMs) return reset('driving');
  const accuracy = sample.accuracyMeters;
  if (accuracy === null || !Number.isFinite(accuracy) || accuracy < 0
    || accuracy > CHECK_IN_READINESS.hereAccuracyMetres) return reset('low_accuracy');
  // Unknown OS speed needs a second stable fix; never coerce it to proof of zero speed.
  if (speed === null && !state.previous) {
    return { ...reset('qualifying'), anchor: sample, previous: sample };
  }
  if (speed !== null && Number.isFinite(speed) && speed > CHECK_IN_READINESS.stationarySpeedMps) return reset('moving');
  if (speed === null && state.previous
    && readinessDistance(state.previous, sample) > CHECK_IN_READINESS.stationaryRadiusMetres) return reset('moving');
  if (state.anchor && readinessDistance(state.anchor, sample) > CHECK_IN_READINESS.stationaryRadiusMetres) return reset('moving');
  const gap = state.previous ? sample.capturedAtMs - state.previous.capturedAtMs : 0;
  if (gap > CHECK_IN_READINESS.maxSampleGapMs) {
    return { ...reset('qualifying'), anchor: sample, previous: sample };
  }
  // Both endpoints must meet the stronger accuracy threshold to earn Place evidence.
  const strong = accuracy <= CHECK_IN_READINESS.placeAccuracyMetres
    && state.previous?.accuracyMeters !== null && state.previous?.accuracyMeters !== undefined
    && state.previous.accuracyMeters <= CHECK_IN_READINESS.placeAccuracyMetres;
  return {
    ...state, anchor: state.anchor || sample, previous: sample, reason: 'qualifying',
    hereMs: Math.min(CHECK_IN_READINESS.hereMs, state.hereMs + gap),
    placeMs: strong ? Math.min(CHECK_IN_READINESS.placeMs, state.placeMs + gap) : 0,
  };
}

// More conservative than per-place/day: at most one automatic prompt per account/device per 24h.
// No venue identifiers or coordinates are persisted to enforce this policy.
export function mayPromptReadiness(state: ReadinessState, nowMs: number, lastPromptAtMs: number, foregroundVisible: boolean, serverReady: boolean): boolean {
  return foregroundVisible && serverReady && isFreshReadiness(state, nowMs)
    && state.placeMs >= CHECK_IN_READINESS.placeMs
    && nowMs - lastPromptAtMs >= CHECK_IN_READINESS.promptCooldownMs;
}

export function mayShareExactPrivateLocation(input: {
  isPrivatePlace: boolean;
  audienceMode: string;
  selectedFriendCount: number;
  exactAllowed: boolean;
  explicitlyEnabled: boolean;
}): boolean {
  return input.isPrivatePlace && input.audienceMode === 'selected_friends'
    && input.selectedFriendCount > 0 && input.exactAllowed && input.explicitlyEnabled;
}
