import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { usePathname } from 'expo-router';

import { auth, firestore } from '../config/firebaseConfig';
import {
  LEGACY_TUTORIAL_STEP_IDS,
  TUTORIAL_STEPS,
} from '../config/tutorialSteps';
import { amplitudeTrack } from '../lib/amplitudeAnalytics';
import { useMapStore } from '../store/mapStore';
import { Cluster, Venue } from '../types/events';
import { TutorialManager, TutorialStatus } from '../types/tutorial';
import {
  getTutorialPreviousIndex,
  getTutorialStepAdvance,
  shouldSkipTutorialCalloutLesson,
} from '../utils/tutorialStepAdvance';

const TUTORIAL_VERSION = 2;
const anonymousKey = 'gathr:tutorial:anonymous:v2';

const defaultStatus = (): TutorialStatus => ({
  completed: false,
  skipped: false,
  currentStep: 0,
  completedSteps: [],
  version: TUTORIAL_VERSION,
});

const clampStatus = (status: Partial<TutorialStatus> | null | undefined): TutorialStatus => ({
  completed: Boolean(status?.completed),
  skipped: Boolean(status?.skipped),
  currentStep: Math.min(Math.max(0, status?.currentStep ?? 0), TUTORIAL_STEPS.length - 1),
  completedSteps: Array.isArray(status?.completedSteps) ? status.completedSteps : [],
  lastTutorialDate: status?.lastTutorialDate,
  version: TUTORIAL_VERSION,
});

export const useTutorial = (): TutorialManager => {
  const pathname = usePathname();
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [tutorialStatus, setTutorialStatus] = useState<TutorialStatus | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const statusRef = useRef<TutorialStatus | null>(null);
  const calloutSnapshotRef = useRef<{
    selectedVenues: Venue[];
    selectedCluster: Cluster | null;
  } | null>(null);
  const skippedCalloutLessonRef = useRef(false);
  const calloutFixtureAvailableRef = useRef(false);

  const currentStep = TUTORIAL_STEPS[currentStepIndex] ?? null;

  useEffect(() => {
    statusRef.current = tutorialStatus;
  }, [tutorialStatus]);

  useEffect(() => {
    if (!isActive || currentStep?.id !== 'callout-venue-selector') return;
    const captureCallout = (state: ReturnType<typeof useMapStore.getState>) => {
      if (!state.selectedVenues.length) return;
      calloutSnapshotRef.current = {
        selectedVenues: [...state.selectedVenues],
        selectedCluster: state.selectedCluster,
      };
    };
    captureCallout(useMapStore.getState());
    return useMapStore.subscribe(captureCallout);
  }, [currentStep?.id, isActive]);

  const storageKey = useCallback(
    () => (auth.currentUser ? `gathr:tutorial:${auth.currentUser.uid}:v2` : anonymousKey),
    [],
  );

  const persistStatus = useCallback((nextStatus: TutorialStatus) => {
    const normalized = clampStatus(nextStatus);
    statusRef.current = normalized;
    setTutorialStatus(normalized);
    void AsyncStorage.setItem(storageKey(), JSON.stringify(normalized)).catch((error) => {
      console.warn('[Tutorial] Local progress could not be saved.', error);
    });

    const user = auth.currentUser;
    if (!user) return;

    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(() => updateDoc(doc(firestore, 'users', user.uid), {
        tutorialStatus: { ...normalized, lastTutorialDate: new Date() },
      }))
      .catch((error) => {
        console.warn('[Tutorial] Remote progress will retry on a later step.', error);
      });
  }, [storageKey]);

  const loadStatus = useCallback(async () => {
    const localKey = storageKey();
    let localStatus: TutorialStatus | null = null;
    try {
      const stored = await AsyncStorage.getItem(localKey);
      if (stored) localStatus = clampStatus(JSON.parse(stored));
    } catch (error) {
      console.warn('[Tutorial] Local progress could not be loaded.', error);
    }

    if (localStatus) setTutorialStatus(localStatus);

    const user = auth.currentUser;
    if (!user) {
      setTutorialStatus((current) => current ?? defaultStatus());
      return;
    }

    try {
      const snapshot = await getDoc(doc(firestore, 'users', user.uid));
      const remote = snapshot.exists()
        ? clampStatus(snapshot.data().tutorialStatus as Partial<TutorialStatus> | undefined)
        : defaultStatus();
      const resolved = localStatus?.completed || localStatus?.skipped ? localStatus : remote;
      setTutorialStatus(resolved);
      statusRef.current = resolved;
      void AsyncStorage.setItem(localKey, JSON.stringify(resolved));
    } catch (error) {
      console.warn('[Tutorial] Using local progress while remote status is unavailable.', error);
      setTutorialStatus((current) => current ?? defaultStatus());
    }
  }, [storageKey]);

  useEffect(() => auth.onAuthStateChanged(() => {
    setIsActive(false);
    void loadStatus();
  }), [loadStatus]);

  const startTutorial = useCallback(() => {
    calloutSnapshotRef.current = null;
    skippedCalloutLessonRef.current = false;
    calloutFixtureAvailableRef.current = false;
    const startingIndex = Math.min(
      Math.max(0, statusRef.current?.currentStep ?? 0),
      TUTORIAL_STEPS.length - 1,
    );
    setCurrentStepIndex(startingIndex);
    setIsActive(true);
    persistStatus({
      ...(statusRef.current ?? defaultStatus()),
      completed: false,
      skipped: false,
      currentStep: startingIndex,
    });
  }, [persistStatus]);

  const setCalloutFixtureAvailable = useCallback((available: boolean) => {
    calloutFixtureAvailableRef.current = available;
  }, []);

  const nextStep = useCallback((stepCount = 1) => {
    setCurrentStepIndex((index) => {
      const advance = getTutorialStepAdvance(index, stepCount);
      if (advance.nextIndex === index) return index;

      if (advance.crossesFilterPills) {
        const bypassedUnavailableCallout =
          TUTORIAL_STEPS[index]?.id === 'cluster-click' &&
          TUTORIAL_STEPS[advance.nextIndex]?.id === 'filter-pills';
        skippedCalloutLessonRef.current = bypassedUnavailableCallout;
        const { selectedVenues, selectedCluster } = useMapStore.getState();
        if (bypassedUnavailableCallout) {
          calloutSnapshotRef.current = null;
        } else if (selectedVenues.length) {
          calloutSnapshotRef.current = {
            selectedVenues: [...selectedVenues],
            selectedCluster,
          };
        }
        (global as any).closeCallout?.();
      }

      const status = statusRef.current ?? defaultStatus();
      persistStatus({
        ...status,
        currentStep: advance.nextIndex,
        completedSteps: [...new Set([...status.completedSteps, ...advance.completedIds])],
      });
      return advance.nextIndex;
    });
  }, [persistStatus]);

  const previousStep = useCallback(() => {
    setCurrentStepIndex((index) => {
      if (index <= 0) return 0;
      const shouldSkipCalloutLesson = shouldSkipTutorialCalloutLesson({
        currentStepId: TUTORIAL_STEPS[index]?.id,
        skippedCalloutLesson: skippedCalloutLessonRef.current,
        hasCalloutSnapshot: Boolean(calloutSnapshotRef.current),
        hasCalloutFixture: calloutFixtureAvailableRef.current,
      });
      if (
        TUTORIAL_STEPS[index]?.id === 'filter-pills' &&
        calloutSnapshotRef.current
      ) {
        const snapshot = calloutSnapshotRef.current;
        const store = useMapStore.getState();
        store.selectVenues(snapshot.selectedVenues);
        store.selectCluster(snapshot.selectedCluster);
        store.selectVenue(snapshot.selectedVenues[0] ?? null);
      }
      const previousIndex = getTutorialPreviousIndex(index, shouldSkipCalloutLesson);
      if (shouldSkipCalloutLesson) skippedCalloutLessonRef.current = false;
      persistStatus({
        ...(statusRef.current ?? defaultStatus()),
        currentStep: previousIndex,
      });
      return previousIndex;
    });
  }, [persistStatus]);

  const skipTutorial = useCallback(() => {
    calloutFixtureAvailableRef.current = false;
    setIsActive(false);
    persistStatus({
      ...(statusRef.current ?? defaultStatus()),
      completed: false,
      skipped: true,
      currentStep: 0,
    });
    amplitudeTrack('tutorial_dismissed', {
      tutorial_id: 'main_onboarding_v1',
      tutorial_version: TUTORIAL_VERSION,
      total_steps: TUTORIAL_STEPS.length,
      step_key: currentStep?.id ?? 'welcome',
      from_screen: pathname || '(unknown)',
    });
  }, [currentStep?.id, pathname, persistStatus]);

  const completeTutorial = useCallback(() => {
    calloutFixtureAvailableRef.current = false;
    setIsActive(false);
    persistStatus({
      completed: true,
      skipped: false,
      currentStep: TUTORIAL_STEPS.length - 1,
      completedSteps: [...LEGACY_TUTORIAL_STEP_IDS],
      version: TUTORIAL_VERSION,
    });
    amplitudeTrack('tutorial_completed', {
      tutorial_id: 'main_onboarding_v1',
      tutorial_version: TUTORIAL_VERSION,
      total_steps: TUTORIAL_STEPS.length,
      step_key: 'completion',
      from_screen: pathname || '(unknown)',
    });
  }, [pathname, persistStatus]);

  const restartTutorial = useCallback(() => {
    calloutSnapshotRef.current = null;
    skippedCalloutLessonRef.current = false;
    calloutFixtureAvailableRef.current = false;
    const reset = defaultStatus();
    persistStatus(reset);
    setCurrentStepIndex(0);
    setIsActive(true);
  }, [persistStatus]);

  const markStepCompleted = useCallback((stepId: string) => {
    const status = statusRef.current ?? defaultStatus();
    persistStatus({
      ...status,
      completedSteps: [...new Set([...status.completedSteps, stepId])],
    });
  }, [persistStatus]);

  return {
    isActive,
    currentStep,
    currentSubStep: -1,
    tutorialStatus,
    startTutorial,
    nextStep,
    previousStep,
    skipTutorial,
    completeTutorial,
    restartTutorial,
    markStepCompleted,
    setCalloutFixtureAvailable,
  };
};
