import * as Location from 'expo-location';
import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../../contexts/AuthContext';
import { loadReadinessPreferences } from '../../services/checkInReadinessPreferences';
import { clearCheckInPreparationCache, prepareCheckInPlaces } from '../../services/checkInPreparation';
import { createSocialOperationId, recordCheckInReadinessSample } from '../../services/socialService';
import { useMapStore } from '../../store/mapStore';
import { emptyCheckInPreparation, qualifiedArrivalForState, resetCheckInReadinessOwner, useCheckInReadinessStore } from '../../store/checkInReadinessStore';
import { useSocialStore } from '../../store/socialStore';
import { SOCIAL_FEATURE_ENABLED, SOCIAL_RELEASE_TWO_ENABLED } from '../../types/social';
import {
  advanceReadiness,
  canCollectReadiness,
  CHECK_IN_READINESS,
  isFreshReadiness,
  pauseReadiness,
  readinessResumeDecision,
  type ReadinessSample,
} from '../../utils/checkInReadiness';
import { qualifiedArrivalDeparture, validQualifiedArrival, validReadinessReceipt } from '../../utils/checkInReadinessContract';

const LOCATION_FIX_WAIT_MS = 8_000;

function asReadinessSample(location: Location.LocationObject): ReadinessSample {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracyMeters: location.coords.accuracy,
    speedMetersPerSecond: location.coords.speed,
    capturedAtMs: location.timestamp,
  };
}

function freshSharedMapSample(location: Location.LocationObject | null, nowMs: number, newerThanMs: number | null) {
  if (!location) return null;
  const sample = asReadinessSample(location);
  const ageMs = nowMs - sample.capturedAtMs;
  const accuracy = sample.accuracyMeters;
  if (
    !Number.isFinite(sample.capturedAtMs)
    || ageMs < 0
    || ageMs > CHECK_IN_READINESS.maxSampleAgeMs
    || (newerThanMs !== null && sample.capturedAtMs <= newerThanMs)
    || accuracy === null
    || !Number.isFinite(accuracy)
    || accuracy < 0
    || accuracy > CHECK_IN_READINESS.hereAccuracyMetres
  ) return null;
  return sample;
}

function waitForFreshReadinessSample(newerThanMs: number | null) {
  let settled = false;
  let unsubscribe: () => void = () => undefined;
  let resolveSample: (sample: ReadinessSample | null) => void = () => undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<ReadinessSample | null>((resolve) => { resolveSample = resolve; });
  const finish = (sample: ReadinessSample | null) => {
    if (settled) return;
    settled = true;
    unsubscribe();
    if (retry) clearTimeout(retry);
    if (deadline) clearTimeout(deadline);
    resolveSample(sample);
  };
  const inspect = (location: Location.LocationObject | null) => {
    const sample = freshSharedMapSample(location, Date.now(), newerThanMs);
    if (sample) finish(sample);
  };
  unsubscribe = useMapStore.subscribe((state, previous) => {
    if (state.userLocation !== previous.userLocation) inspect(state.userLocation);
  });
  const requestFallback = () => {
    if (settled) return;
    void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).then((location) => {
      if (settled) return;
      const sample = asReadinessSample(location);
      const ageMs = Date.now() - sample.capturedAtMs;
      if (Number.isFinite(sample.capturedAtMs) && ageMs >= 0 && ageMs <= CHECK_IN_READINESS.maxSampleAgeMs
        && (newerThanMs === null || sample.capturedAtMs > newerThanMs)) {
        // Fresh movement/low-accuracy samples must still reach the reducer so
        // existing evidence is invalidated rather than silently retained.
        finish(sample);
      } else {
        retry = setTimeout(requestFallback, CHECK_IN_READINESS.nearReadySampleIntervalMs);
      }
    }, () => {
      if (!settled) retry = setTimeout(requestFallback, CHECK_IN_READINESS.nearReadySampleIntervalMs);
    });
  };
  deadline = setTimeout(() => finish(null), LOCATION_FIX_WAIT_MS);
  inspect(useMapStore.getState().userLocation);
  if (!settled) requestFallback();
  return { promise, cancel: () => finish(null) };
}

/** One foreground observer for the whole authenticated app, independent of map/modals. */
export default function CheckInReadinessObserver() {
  const { user } = useAuth();
  const pathname = usePathname();
  const uid = user?.uid || null;
  const ownCheckIn = useSocialStore((state) => state.ownCheckIn);
  const mode = useCheckInReadinessStore((state) => state.mode);
  const loaded = useCheckInReadinessStore((state) => state.preferencesLoaded);
  const hasGrant = useCheckInReadinessStore((state) => state.grant !== null);
  const hasInitialViewportSettled = useMapStore((state) => state.hasInitialViewportSettled);
  const mapStartupFlowActive = pathname.endsWith('/map')
    || pathname.endsWith('/check-in')
    || pathname.endsWith('/check-in-settings');

  useEffect(() => {
    clearCheckInPreparationCache();
    resetCheckInReadinessOwner(uid);
    if (uid) void loadReadinessPreferences(uid);
    return () => { clearCheckInPreparationCache(); resetCheckInReadinessOwner(null); };
  }, [uid]);

  useEffect(() => {
    const deferForMapStartup = mapStartupFlowActive && !hasInitialViewportSettled && !ownCheckIn && !hasGrant;
    if (!uid || !loaded || deferForMapStartup || !SOCIAL_FEATURE_ENABLED || !SOCIAL_RELEASE_TWO_ENABLED) return;
    let disposed = false;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sequence = 0;
    let pendingRequest: AbortController | null = null;
    let cancelPendingMapSample: (() => void) | null = null;
    let resumeValidationStartedAtMs = 0;
    let previousDrivingSample: ReadinessSample | null = null;
    const invalidate = (revoke = false) => {
      const current = useCheckInReadinessStore.getState();
      useCheckInReadinessStore.setState({
        evidence: pauseReadiness(current.evidence), receipt: null, acceptedProgress: null, progressPaused: false, sessionId: '', interruptedAtMs: null,
        resumeAfterCheckIn: false,
        arrival: null, attempt: null, preparation: emptyCheckInPreparation(),
        ...(revoke ? { revocationRevision: current.revocationRevision + 1 } : {}),
      });
    };
    const preserveForCheckIn = () => {
      const current = useCheckInReadinessStore.getState();
      useCheckInReadinessStore.setState({
        receipt: null,
        acceptedProgress: null, progressPaused: false,
        sessionId: '',
        grant: null,
        arrival: null, attempt: null, preparation: emptyCheckInPreparation(),
        interruptedAtMs: current.interruptedAtMs ?? Date.now(),
        resumeAfterCheckIn: true,
      });
    };
    const run = async (epoch: number) => {
      let nextDelayMs: number = CHECK_IN_READINESS.sampleIntervalMs;
      let nextSampleDueAtMs: number | null = null;
      const currentRun = () => !disposed && epoch === generation && AppState.currentState === 'active'
        && useCheckInReadinessStore.getState().uid === uid
        && !useCheckInReadinessStore.getState().grant
        && !useSocialStore.getState().ownCheckIn;
      if (!currentRun()) return;
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!currentRun()) return;
        const granted = permission.status === 'granted';
        useCheckInReadinessStore.setState({ foregroundGranted: granted });
        if (useSocialStore.getState().ownCheckIn) {
          preserveForCheckIn();
          return;
        }
        if (!canCollectReadiness({ mode, foregroundGranted: granted, backgroundGranted: false,
          notificationsGranted: false, backgroundSupported: false, appActive: true })) {
          invalidate(true);
          return;
        }
        const before = useCheckInReadinessStore.getState();
        const newerThanMs = before.evidence.previous?.capturedAtMs ?? null;
        const sampleIntervalForReceipt = () => {
          // Keep normal server calls within the existing 360/hour allowance.
          // The two-second cadence remains only a local GPS acquisition retry.
          const arrival = qualifiedArrivalForState(useCheckInReadinessStore.getState());
          return arrival?.place ? CHECK_IN_READINESS.qualifiedSampleIntervalMs : CHECK_IN_READINESS.sampleIntervalMs;
        };
        // Reuse the same fresh map fix the user dot already received when it
        // meets Here accuracy. Race it against the high-accuracy fallback so
        // opening the app does not wait on a second location request.
        let sample = freshSharedMapSample(useMapStore.getState().userLocation, Date.now(), newerThanMs);
        if (!sample) {
          const sharedMapSample = waitForFreshReadinessSample(newerThanMs);
          cancelPendingMapSample = sharedMapSample.cancel;
          try {
            sample = await sharedMapSample.promise;
          } finally {
            sharedMapSample.cancel();
            cancelPendingMapSample = null;
          }
          if (!currentRun()) return;
        }
        if (!currentRun()) return;
        if (!sample) {
          nextDelayMs = CHECK_IN_READINESS.nearReadySampleIntervalMs;
          return;
        }
        // iOS can return the same cached fix from successive current-position
        // requests. It cannot add evidence, so don't resend it to the server or
        // let its old capture time schedule a zero-delay request loop.
        if (before.evidence.previous && sample.capturedAtMs <= before.evidence.previous.capturedAtMs) {
          nextDelayMs = before.interruptedAtMs !== null
            ? CHECK_IN_READINESS.resumeRetryMs
            : sampleIntervalForReceipt();
          return;
        }
        const nowMs = Date.now();
        const arrival = qualifiedArrivalForState(before, nowMs);
        const departed = !!arrival && qualifiedArrivalDeparture(arrival, sample, previousDrivingSample);
        previousDrivingSample = sample.speedMetersPerSecond !== null && sample.speedMetersPerSecond >= CHECK_IN_READINESS.drivingSpeedMps
          ? sample : null;
        const resuming = before.interruptedAtMs !== null;
        const resumeDecision = resuming && !arrival
          ? readinessResumeDecision(before.evidence, sample, nowMs,
            before.resumeAfterCheckIn ? CHECK_IN_READINESS.maxCheckInResumeGapMs : undefined)
          : 'reset';
        if (resuming && resumeDecision === 'retry'
          && nowMs - resumeValidationStartedAtMs < CHECK_IN_READINESS.resumeValidationGraceMs) {
          nextDelayMs = CHECK_IN_READINESS.resumeRetryMs;
          return;
        }
        let evidence = resuming && !arrival && resumeDecision === 'retry'
          ? pauseReadiness(before.evidence)
          : resuming && resumeDecision === 'accept' && before.resumeAfterCheckIn
            ? { ...before.evidence, anchor: before.evidence.anchor || sample, previous: sample, reason: 'qualifying' as const }
          : advanceReadiness(
            before.evidence,
            sample,
            nowMs,
            true,
            arrival || (resuming && resumeDecision === 'accept')
              ? CHECK_IN_READINESS.maxResumeGapMs
              : CHECK_IN_READINESS.maxSampleGapMs
          );
        // An issued arrival is independent of short-lived raw sample freshness.
        // Retain it through jitter; only a confidence-aware departure resets it.
        if (arrival && !departed) evidence = { ...evidence, revision: before.evidence.revision,
          anchor: before.evidence.anchor || sample };
        // A reset changes the server session too. A stale response cannot restore old readiness.
        const sessionId = !before.sessionId || departed || evidence.revision !== before.evidence.revision
          ? createSocialOperationId() : before.sessionId;
        if (sessionId !== before.sessionId) sequence = 0;
        useCheckInReadinessStore.setState({ evidence, sessionId, interruptedAtMs: null, resumeAfterCheckIn: false,
          ...(sessionId !== before.sessionId ? { receipt: null, acceptedProgress: null, arrival: null, attempt: null, preparation: emptyCheckInPreparation(), sampleSequence: 0 } : {}),
          ...(departed ? { revocationRevision: before.revocationRevision + 1 } : {}) });
        prepareCheckInPlaces();
        if (evidence.reason === 'stale') return;
        // Keep the cadence tied to captured GPS times. Waiting a full interval
        // after the server response adds its latency to every readiness cycle.
        // Sample more often only while waiting for the server's final readiness receipt.
        nextSampleDueAtMs = sample.capturedAtMs + sampleIntervalForReceipt();
        const minimumIntervalMs = sampleIntervalForReceipt();
        if (before.lastSampleRequestAtMs !== null && Date.now() - before.lastSampleRequestAtMs < minimumIntervalMs) {
          nextDelayMs = minimumIntervalMs - (Date.now() - before.lastSampleRequestAtMs);
          nextSampleDueAtMs = before.lastSampleRequestAtMs + minimumIntervalMs;
          return;
        }
        const sentSequence = before.sessionId === sessionId ? Math.max(sequence, before.sampleSequence) + 1 : 1;
        sequence = sentSequence;
        pendingRequest = new AbortController();
        useCheckInReadinessStore.setState({ lastSampleRequestAtMs: Date.now(), sampleSequence: sentSequence });
        const receipt = await recordCheckInReadinessSample({ protocolVersion: 1, sessionId, sequence: sentSequence,
          reset: departed || (!arrival && evidence.reason !== 'qualifying' && evidence.reason !== 'low_accuracy'), ...sample }, { signal: pendingRequest.signal });
        if (!currentRun() || useCheckInReadinessStore.getState().sessionId !== sessionId) return;
        if (!validReadinessReceipt(receipt, sessionId, sentSequence, Date.now())) {
          const current = useCheckInReadinessStore.getState();
          useCheckInReadinessStore.setState({ arrival: null, attempt: null, acceptedProgress: null,
            ...(qualifiedArrivalForState(current) ? { revocationRevision: current.revocationRevision + 1 } : {}) });
          throw new Error('Invalid readiness receipt');
        }
        const serverArrival = validQualifiedArrival(receipt.arrival, sessionId, Date.now()) ? receipt.arrival : null;
        const latest = useCheckInReadinessStore.getState();
        const revoked = !serverArrival && !!qualifiedArrivalForState(latest);
        useCheckInReadinessStore.setState({ receipt, serviceError: false,
          acceptedProgress: { sessionId, hereMs: receipt.hereQualifyingMs, placeMs: receipt.placeQualifyingMs, receivedAtMs: Date.now() },
          progressPaused: false,
          // Successful server answers are authoritative. A network failure can
          // retain a lease, but a reply that removed it cannot retain an attempt.
          arrival: serverArrival,
          ...(!serverArrival ? { attempt: null } : {}),
          ...(revoked ? { revocationRevision: latest.revocationRevision + 1 } : {}) });
        prepareCheckInPlaces();
        nextSampleDueAtMs = sample.capturedAtMs + sampleIntervalForReceipt();
      } catch {
        if (currentRun()) useCheckInReadinessStore.setState({ receipt: null, serviceError: true });
      } finally {
        if (currentRun()) {
          const scheduledDelayMs = nextSampleDueAtMs === null
            ? nextDelayMs
            : Math.max(0, nextSampleDueAtMs - Date.now());
          const state = useCheckInReadinessStore.getState();
          const minimumIntervalMs = qualifiedArrivalForState(state)?.place
            ? CHECK_IN_READINESS.qualifiedSampleIntervalMs : CHECK_IN_READINESS.sampleIntervalMs;
          const sendBudgetDelayMs = state.lastSampleRequestAtMs === null ? 0
            : Math.max(0, state.lastSampleRequestAtMs + minimumIntervalMs - Date.now());
          const delayMs = Math.max(CHECK_IN_READINESS.nearReadySampleIntervalMs, scheduledDelayMs, sendBudgetDelayMs);
          timer = setTimeout(() => void run(epoch), delayMs);
        }
      }
    };
    const changeState = (state: string) => {
      generation += 1;
      cancelPendingMapSample?.();
      cancelPendingMapSample = null;
      pendingRequest?.abort();
      // Let a lookup already in flight finish across a brief app switch. It
      // contains no new GPS collection and remains owner/session guarded.
      if (timer) clearTimeout(timer);
      const current = useCheckInReadinessStore.getState();
      const active = state === 'active';
      useCheckInReadinessStore.setState({
        appActive: active,
        ...(!active ? { progressPaused: true } : {}),
        ...(!active && current.interruptedAtMs === null ? { interruptedAtMs: Date.now() } : {}),
      });
      if (ownCheckIn) {
        preserveForCheckIn();
        return;
      }
      // The privacy screen owns a one-time bound grant. Do not request another
      // GPS fix or mutate its evidence during ordinary form entry/short pauses.
      if (current.grant) {
        if (active && (current.grant.expiresAtMs <= Date.now()
          || (current.interruptedAtMs !== null && Date.now() - current.interruptedAtMs >= CHECK_IN_READINESS.maxResumeGapMs))) {
          useCheckInReadinessStore.setState({ grant: null });
        } else if (active) {
          useCheckInReadinessStore.setState({ interruptedAtMs: null });
        }
        return;
      }
      if (active && qualifiedArrivalForState(current)) {
        useCheckInReadinessStore.setState({ interruptedAtMs: null });
        prepareCheckInPlaces();
      }
      // iOS briefly reports `inactive` while taking a screenshot and during other
      // system interruptions. Preserve the evidence/session, then let the next
      // fresh fix verify the elapsed gap. The interruption marker also keeps
      // check-in locked until that return validation accepts or resets it.
      if (active && mode !== 'basic' && !ownCheckIn) {
        resumeValidationStartedAtMs = Date.now();
        void run(generation);
      }
    };
    const subscription = AppState.addEventListener('change', changeState);
    // Expiration only: this interval can remove readiness, never add progress.
    const expiryTimer = setInterval(() => {
      const state = useCheckInReadinessStore.getState();
      const now = Date.now();
      if (state.grant) {
        if (state.grant.expiresAtMs <= now) {
          // A failed create may leave a bound one-use grant on the foreground
          // form. Expiry must restart preparation without waiting for app exit.
          useCheckInReadinessStore.setState({ grant: null, receipt: null, acceptedProgress: null, progressPaused: false, sessionId: '', arrival: null, attempt: null,
            evidence: pauseReadiness(state.evidence), preparation: emptyCheckInPreparation() });
        }
        return;
      }
      const arrival = qualifiedArrivalForState(state, now);
      if (arrival) {
        if (state.appActive) prepareCheckInPlaces();
        if (state.receipt && state.receipt.expiresAtMs <= now) useCheckInReadinessStore.setState({ receipt: null });
        return;
      }
      if (state.arrival || state.attempt) useCheckInReadinessStore.setState({ arrival: null, attempt: null });
      if (state.appActive && state.interruptedAtMs === null
        && state.evidence.previous && !isFreshReadiness(state.evidence, now)
        && !(state.evidence.reason === 'low_accuracy' && now - state.evidence.previous.capturedAtMs <= CHECK_IN_READINESS.maxSampleGapMs)) invalidate();
      else if (state.receipt && state.receipt.expiresAtMs <= now) useCheckInReadinessStore.setState({ receipt: null });
    }, 1_000);
    changeState(AppState.currentState);
    return () => {
      disposed = true;
      generation += 1;
      cancelPendingMapSample?.();
      cancelPendingMapSample = null;
      pendingRequest?.abort();
      if (timer) clearTimeout(timer);
      clearInterval(expiryTimer);
      subscription.remove();
      const current = useCheckInReadinessStore.getState();
      if (useSocialStore.getState().ownCheckIn) preserveForCheckIn();
      else if (!current.grant && !current.resumeAfterCheckIn && !qualifiedArrivalForState(current)) invalidate();
    };
  }, [hasGrant, hasInitialViewportSettled, loaded, mapStartupFlowActive, mode, ownCheckIn, uid]);
  return null;
}
