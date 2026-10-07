import * as Location from 'expo-location';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../../contexts/AuthContext';
import { loadReadinessPreferences } from '../../services/checkInReadinessPreferences';
import { createSocialOperationId, recordCheckInReadinessSample } from '../../services/socialService';
import { useMapStore } from '../../store/mapStore';
import { resetCheckInReadinessOwner, useCheckInReadinessStore } from '../../store/checkInReadinessStore';
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
import { validReadinessReceipt } from '../../utils/checkInReadinessContract';

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

function waitForFreshSharedMapSample(newerThanMs: number | null) {
  let settled = false;
  let unsubscribe: () => void = () => undefined;
  let resolveSample: (sample: ReadinessSample | null) => void = () => undefined;
  const promise = new Promise<ReadinessSample | null>((resolve) => { resolveSample = resolve; });
  const finish = (sample: ReadinessSample | null) => {
    if (settled) return;
    settled = true;
    unsubscribe();
    resolveSample(sample);
  };
  const inspect = (location: Location.LocationObject | null) => {
    const sample = freshSharedMapSample(location, Date.now(), newerThanMs);
    if (sample) finish(sample);
  };
  unsubscribe = useMapStore.subscribe((state, previous) => {
    if (state.userLocation !== previous.userLocation) inspect(state.userLocation);
  });
  inspect(useMapStore.getState().userLocation);
  return { promise, cancel: () => finish(null) };
}

/** One foreground observer for the whole authenticated app, independent of map/modals. */
export default function CheckInReadinessObserver() {
  const { user } = useAuth();
  const uid = user?.uid || null;
  const ownCheckIn = useSocialStore((state) => state.ownCheckIn);
  const mode = useCheckInReadinessStore((state) => state.mode);
  const loaded = useCheckInReadinessStore((state) => state.preferencesLoaded);
  const hasGrant = useCheckInReadinessStore((state) => state.grant !== null);

  useEffect(() => {
    resetCheckInReadinessOwner(uid);
    if (uid) void loadReadinessPreferences(uid);
    return () => resetCheckInReadinessOwner(null);
  }, [uid]);

  useEffect(() => {
    if (!uid || !loaded || !SOCIAL_FEATURE_ENABLED || !SOCIAL_RELEASE_TWO_ENABLED) return;
    let disposed = false;
    let generation = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sequence = 0;
    let pendingRequest: AbortController | null = null;
    let cancelPendingMapSample: (() => void) | null = null;
    let resumeValidationStartedAtMs = 0;
    const invalidate = () => {
      const current = useCheckInReadinessStore.getState();
      useCheckInReadinessStore.setState({
        evidence: pauseReadiness(current.evidence), receipt: null, sessionId: '', interruptedAtMs: null,
        resumeAfterCheckIn: false,
      });
    };
    const preserveForCheckIn = () => {
      const current = useCheckInReadinessStore.getState();
      useCheckInReadinessStore.setState({
        receipt: null,
        sessionId: '',
        grant: null,
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
          invalidate();
          return;
        }
        const before = useCheckInReadinessStore.getState();
        const newerThanMs = before.evidence.previous?.capturedAtMs ?? null;
        const sampleIntervalForReceipt = (
          evidence: typeof before.evidence,
          candidateReceipt: typeof before.receipt,
          sessionId: string
        ) => {
          const currentReceipt = candidateReceipt?.sessionId === sessionId
            && candidateReceipt.expiresAtMs > Date.now() ? candidateReceipt : null;
          const needsHereConfirmation = (currentReceipt?.hereQualifyingMs ?? 0) < CHECK_IN_READINESS.hereMs
            && Math.max(evidence.hereMs, currentReceipt?.hereQualifyingMs ?? 0)
              >= CHECK_IN_READINESS.hereMs - CHECK_IN_READINESS.nearReadyWindowMs;
          const needsPlaceConfirmation = (currentReceipt?.placeQualifyingMs ?? 0) < CHECK_IN_READINESS.placeMs
            && Math.max(evidence.placeMs, currentReceipt?.placeQualifyingMs ?? 0)
              >= CHECK_IN_READINESS.placeMs - CHECK_IN_READINESS.nearReadyWindowMs;
          return evidence.reason === 'qualifying' && (needsHereConfirmation || needsPlaceConfirmation)
            ? CHECK_IN_READINESS.nearReadySampleIntervalMs
            : CHECK_IN_READINESS.sampleIntervalMs;
        };
        // Reuse the same fresh map fix the user dot already received when it
        // meets Here accuracy. Race it against the high-accuracy fallback so
        // opening the app does not wait on a second location request.
        let sample = freshSharedMapSample(useMapStore.getState().userLocation, Date.now(), newerThanMs);
        if (!sample) {
          const sharedMapSample = waitForFreshSharedMapSample(newerThanMs);
          cancelPendingMapSample = sharedMapSample.cancel;
          let nextSample: { sample: ReadinessSample | null };
          try {
            nextSample = await Promise.race([
              sharedMapSample.promise.then((sharedSample) => ({ sample: sharedSample })),
              Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
                .then((location) => ({ sample: asReadinessSample(location) })),
            ]);
          } finally {
            sharedMapSample.cancel();
            cancelPendingMapSample = null;
          }
          if (!currentRun()) return;
          sample = nextSample.sample;
        }
        if (!sample || !currentRun()) return;
        // iOS can return the same cached fix from successive current-position
        // requests. It cannot add evidence, so don't resend it to the server or
        // let its old capture time schedule a zero-delay request loop.
        if (before.evidence.previous && sample.capturedAtMs <= before.evidence.previous.capturedAtMs) {
          nextDelayMs = before.interruptedAtMs !== null
            ? CHECK_IN_READINESS.resumeRetryMs
            : sampleIntervalForReceipt(before.evidence, before.receipt, before.sessionId);
          return;
        }
        const nowMs = Date.now();
        const resuming = before.interruptedAtMs !== null;
        const resumeDecision = resuming
          ? readinessResumeDecision(before.evidence, sample, nowMs,
            before.resumeAfterCheckIn ? CHECK_IN_READINESS.maxCheckInResumeGapMs : undefined)
          : 'reset';
        if (resuming && resumeDecision === 'retry'
          && nowMs - resumeValidationStartedAtMs < CHECK_IN_READINESS.resumeValidationGraceMs) {
          nextDelayMs = CHECK_IN_READINESS.resumeRetryMs;
          return;
        }
        const evidence = resuming && resumeDecision === 'retry'
          ? pauseReadiness(before.evidence)
          : resuming && resumeDecision === 'accept' && before.resumeAfterCheckIn
            ? { ...before.evidence, anchor: before.evidence.anchor || sample, previous: sample, reason: 'qualifying' as const }
          : advanceReadiness(
            before.evidence,
            sample,
            nowMs,
            true,
            resuming && resumeDecision === 'accept'
              ? CHECK_IN_READINESS.maxResumeGapMs
              : CHECK_IN_READINESS.maxSampleGapMs
          );
        // A reset changes the server session too. A stale response cannot restore old readiness.
        const sessionId = !before.sessionId || evidence.revision !== before.evidence.revision
          ? createSocialOperationId() : before.sessionId;
        if (sessionId !== before.sessionId) sequence = 0;
        useCheckInReadinessStore.setState({ evidence, sessionId, interruptedAtMs: null, resumeAfterCheckIn: false,
          ...(sessionId !== before.sessionId ? { receipt: null } : {}) });
        if (evidence.reason === 'stale') return;
        // Keep the cadence tied to captured GPS times. Waiting a full interval
        // after the server response adds its latency to every readiness cycle.
        // Sample more often only while waiting for the server's final readiness receipt.
        nextSampleDueAtMs = sample.capturedAtMs + sampleIntervalForReceipt(evidence, before.receipt, sessionId);
        const sentSequence = ++sequence;
        pendingRequest = new AbortController();
        const receipt = await recordCheckInReadinessSample({ protocolVersion: 1, sessionId, sequence: sentSequence,
          reset: evidence.reason !== 'qualifying', ...sample }, { signal: pendingRequest.signal });
        if (!currentRun() || useCheckInReadinessStore.getState().sessionId !== sessionId) return;
        if (!validReadinessReceipt(receipt, sessionId, sentSequence, Date.now())) throw new Error('Invalid readiness receipt');
        useCheckInReadinessStore.setState({ receipt, serviceError: false });
        nextSampleDueAtMs = sample.capturedAtMs + sampleIntervalForReceipt(evidence, receipt, sessionId);
      } catch {
        if (currentRun()) useCheckInReadinessStore.setState({ receipt: null, serviceError: true });
      } finally {
        if (currentRun()) {
          const scheduledDelayMs = nextSampleDueAtMs === null
            ? nextDelayMs
            : Math.max(0, nextSampleDueAtMs - Date.now());
          const delayMs = Math.max(CHECK_IN_READINESS.nearReadySampleIntervalMs, scheduledDelayMs);
          timer = setTimeout(() => void run(epoch), delayMs);
        }
      }
    };
    const changeState = (state: string) => {
      generation += 1;
      cancelPendingMapSample?.();
      cancelPendingMapSample = null;
      pendingRequest?.abort();
      if (timer) clearTimeout(timer);
      const current = useCheckInReadinessStore.getState();
      const active = state === 'active';
      useCheckInReadinessStore.setState({
        appActive: active,
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
      if (state.grant) return;
      if (state.appActive && state.interruptedAtMs === null
        && state.evidence.previous && !isFreshReadiness(state.evidence, now)) invalidate();
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
      else if (!current.grant && !current.resumeAfterCheckIn) invalidate();
    };
  }, [hasGrant, loaded, mode, ownCheckIn, uid]);
  return null;
}
