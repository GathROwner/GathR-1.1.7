import * as Location from 'expo-location';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '../../contexts/AuthContext';
import { loadReadinessPreferences } from '../../services/checkInReadinessPreferences';
import { createSocialOperationId, recordCheckInReadinessSample } from '../../services/socialService';
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
} from '../../utils/checkInReadiness';
import { validReadinessReceipt } from '../../utils/checkInReadinessContract';

/** One foreground observer for the whole authenticated app, independent of map/modals. */
export default function CheckInReadinessObserver() {
  const { user } = useAuth();
  const uid = user?.uid || null;
  const ownCheckIn = useSocialStore((state) => state.ownCheckIn);
  const mode = useCheckInReadinessStore((state) => state.mode);
  const loaded = useCheckInReadinessStore((state) => state.preferencesLoaded);

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
    let resumeValidationStartedAtMs = 0;
    const invalidate = () => {
      const current = useCheckInReadinessStore.getState();
      useCheckInReadinessStore.setState({
        evidence: pauseReadiness(current.evidence), receipt: null, sessionId: '', interruptedAtMs: null,
      });
    };
    const run = async (epoch: number) => {
      let nextDelayMs: number = CHECK_IN_READINESS.sampleIntervalMs;
      const currentRun = () => !disposed && epoch === generation && AppState.currentState === 'active'
        && useCheckInReadinessStore.getState().uid === uid;
      if (!currentRun()) return;
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!currentRun()) return;
        const granted = permission.status === 'granted';
        useCheckInReadinessStore.setState({ foregroundGranted: granted });
        if (ownCheckIn || !canCollectReadiness({ mode, foregroundGranted: granted, backgroundGranted: false,
          notificationsGranted: false, backgroundSupported: false, appActive: true })) {
          invalidate();
          return;
        }
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (!currentRun()) return;
        const sample = {
          latitude: location.coords.latitude, longitude: location.coords.longitude,
          accuracyMeters: location.coords.accuracy, speedMetersPerSecond: location.coords.speed,
          capturedAtMs: location.timestamp,
        };
        const before = useCheckInReadinessStore.getState();
        const nowMs = Date.now();
        const resuming = before.interruptedAtMs !== null;
        const resumeDecision = resuming
          ? readinessResumeDecision(before.evidence, sample, nowMs)
          : 'reset';
        if (resuming && resumeDecision === 'retry'
          && nowMs - resumeValidationStartedAtMs < CHECK_IN_READINESS.resumeValidationGraceMs) {
          nextDelayMs = CHECK_IN_READINESS.resumeRetryMs;
          return;
        }
        const evidence = advanceReadiness(
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
        useCheckInReadinessStore.setState({ evidence, sessionId, interruptedAtMs: null,
          ...(sessionId !== before.sessionId ? { receipt: null } : {}) });
        if (evidence.reason === 'stale') return;
        const sentSequence = ++sequence;
        pendingRequest = new AbortController();
        const receipt = await recordCheckInReadinessSample({ protocolVersion: 1, sessionId, sequence: sentSequence,
          reset: evidence.reason !== 'qualifying', ...sample }, { signal: pendingRequest.signal });
        if (!currentRun() || useCheckInReadinessStore.getState().sessionId !== sessionId) return;
        if (!validReadinessReceipt(receipt, sessionId, sentSequence, Date.now())) throw new Error('Invalid readiness receipt');
        useCheckInReadinessStore.setState({ receipt, serviceError: false });
      } catch {
        if (currentRun()) useCheckInReadinessStore.setState({ receipt: null, serviceError: true });
      } finally {
        if (currentRun()) timer = setTimeout(() => void run(epoch), nextDelayMs);
      }
    };
    const changeState = (state: string) => {
      generation += 1;
      pendingRequest?.abort();
      if (timer) clearTimeout(timer);
      const current = useCheckInReadinessStore.getState();
      const active = state === 'active';
      useCheckInReadinessStore.setState({
        appActive: active,
        ...(!active && current.interruptedAtMs === null ? { interruptedAtMs: Date.now() } : {}),
      });
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
      if (state.appActive && state.interruptedAtMs === null
        && state.evidence.previous && !isFreshReadiness(state.evidence, now)) invalidate();
      else if (state.receipt && state.receipt.expiresAtMs <= now) useCheckInReadinessStore.setState({ receipt: null });
    }, 1_000);
    changeState(AppState.currentState);
    return () => {
      disposed = true;
      generation += 1;
      pendingRequest?.abort();
      if (timer) clearTimeout(timer);
      clearInterval(expiryTimer);
      subscription.remove();
      invalidate();
    };
  }, [loaded, mode, ownCheckIn, uid]);
  return null;
}
