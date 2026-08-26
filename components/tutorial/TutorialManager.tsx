import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, useWindowDimensions, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { TUTORIAL_CONFIG, TUTORIAL_STEPS, getCompletedIdsForStep } from '../../config/tutorialSteps';
import { useTutorial } from '../../hooks/useTutorial';
import { amplitudeTrack } from '../../lib/amplitudeAnalytics';
import { useMapStore } from '../../store/mapStore';
import { useTutorialUiStore } from '../../store/tutorialUiStore';
import { Cluster } from '../../types/events';
import { ComponentMeasurement, TutorialStep } from '../../types/tutorial';
import {
  isTutorialStepCurrent,
  registerTutorialAction,
  runTutorialAction,
  waitForTutorialAction,
} from '../../utils/tutorialActions';
import {
  doesTutorialCalloutMatchAnchor,
  getTutorialClusterAnchorVenueKey,
  isTutorialClusterCalloutTarget,
} from '../../utils/tutorialClusterTarget';
import {
  isTutorialModalHostedStep,
  setTutorialModalOverlay,
} from '../../utils/tutorialModalOverlay';
import {
  subscribeTutorialMeasurement,
  waitForTutorialMeasurement,
} from '../../utils/tutorialReadiness';
import {
  getTutorialSpotlightForStep,
  OwnedTutorialSpotlight,
} from '../../utils/tutorialSpotlightOwnership';
import { TutorialBottomSheet } from './TutorialBottomSheet';
import { TutorialSpotlight } from './TutorialSpotlight';
import { WelcomeScreen } from './WelcomeScreen';

const MAP_ROUTE = '/(tabs)/map' as const;

type LayoutTarget = {
  flag: string;
  layout: string;
  radius: number;
  acceptExisting?: boolean;
};

const LAYOUT_TARGETS: Partial<Record<string, LayoutTarget>> = {
  'callout-venue-selector': {
    flag: 'tutorialHighlightVenueSelector',
    layout: 'venueSelectorLayout',
    radius: 14,
  },
  'filter-pills': {
    flag: 'tutorialHighlightFilterPills',
    layout: 'filterPillsLayout',
    radius: 22,
    acceptExisting: true,
  },
  'events-tab': {
    flag: 'tutorialHighlightEventsTab',
    layout: 'eventsTabLayout',
    radius: 16,
  },
  'events-list-explanation': {
    flag: 'tutorialHighlightEventsListExplanation',
    layout: 'eventsListExplanationLayout',
    radius: 18,
  },
  'specials-tab': {
    flag: 'tutorialHighlightSpecialsTab',
    layout: 'specialsTabLayout',
    radius: 16,
  },
  'specials-list-explanation': {
    flag: 'tutorialHighlightSpecialsListExplanation',
    layout: 'specialsListExplanationLayout',
    radius: 18,
  },
  'profile-facebook': {
    flag: 'tutorialHighlightProfileFacebook',
    layout: 'profileFacebookLayout',
    radius: 24,
    acceptExisting: true,
  },
  'facebook-submission': {
    flag: 'tutorialHighlightFacebookSubmission',
    layout: 'facebookSubmissionLayout',
    radius: 18,
    // Profile is already mounted when the route-driven step advances. Its
    // child effect can publish the stable row measurement before this parent
    // effect begins waiting, especially through the native-stack modal on
    // iOS. That measurement belongs to the current mounted Profile screen.
    acceptExisting: true,
  },
};

const ALL_HIGHLIGHT_FLAGS = [
  'tutorialHighlightFilterPills',
  'tutorialHighlightEventDetails',
  'tutorialHighlightVenueSelector',
  'tutorialHighlightEventTabs',
  'tutorialHighlightEventsTab',
  'tutorialHighlightEventsListExplanation',
  'tutorialHighlightEventsFilters',
  'tutorialHighlightSpecialsTab',
  'tutorialHighlightSpecialsListExplanation',
  'tutorialHighlightSpecialsFilters',
  'tutorialHighlightProfileFacebook',
  'tutorialHighlightFacebookSubmission',
] as const;

const isRoute = (pathname: string, route: 'events' | 'specials' | 'profile') =>
  pathname === `/${route}` || pathname.endsWith(`/${route}`);

const cleanMeasurement = (
  measurement: ComponentMeasurement,
  screenWidth: number,
  screenHeight: number,
): ComponentMeasurement | null => {
  const x = Math.max(0, measurement.x);
  const y = Math.max(0, measurement.y);
  const width = Math.min(measurement.width, screenWidth - x);
  const height = Math.min(measurement.height, screenHeight - y);
  return width > 0 && height > 0 ? { x, y, width, height } : null;
};

const waitForClusters = (signal: AbortSignal): Promise<Cluster[] | null> => {
  const current = useMapStore.getState().clusters;
  if (current.length) return Promise.resolve(current);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (clusters: Cluster[] | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      signal.removeEventListener('abort', onAbort);
      resolve(clusters);
    };
    const unsubscribe = useMapStore.subscribe((state) => {
      if (state.clusters.length) finish(state.clusters);
    });
    const onAbort = () => finish(null);
    const timeout = setTimeout(() => finish(null), TUTORIAL_CONFIG.TARGET_TIMEOUT_MS);
    signal.addEventListener('abort', onAbort, { once: true });
  });
};

const waitForCallout = (
  signal: AbortSignal,
  anchorVenueKey: string,
) => new Promise<boolean>((resolve) => {
  const current = useMapStore.getState().selectedVenues;
  if (doesTutorialCalloutMatchAnchor(current, anchorVenueKey)) {
    resolve(true);
    return;
  }
  let settled = false;
  const finish = (ready: boolean) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    unsubscribe();
    signal.removeEventListener('abort', onAbort);
    resolve(ready);
  };
  const unsubscribe = useMapStore.subscribe((state) => {
    if (doesTutorialCalloutMatchAnchor(state.selectedVenues, anchorVenueKey)) finish(true);
  });
  const onAbort = () => finish(false);
  const timeout = setTimeout(() => finish(false), TUTORIAL_CONFIG.ROUTE_TIMEOUT_MS);
  signal.addEventListener('abort', onAbort, { once: true });
});

const waitForCalloutPresentation = async (signal: AbortSignal): Promise<boolean> => {
  const actionReady = await waitForTutorialAction('wait-callout-ready', {
    timeoutMs: TUTORIAL_CONFIG.ROUTE_TIMEOUT_MS,
    signal,
  });
  if (!actionReady || signal.aborted) return false;

  const invoked = await runTutorialAction(
    'wait-callout-ready',
    TUTORIAL_CONFIG.TARGET_TIMEOUT_MS,
    signal,
  );
  return invoked && !signal.aborted;
};

const clearHighlightFlags = () => {
  ALL_HIGHLIGHT_FLAGS.forEach((flag) => {
    (global as any)[flag] = false;
  });
  (global as any).facebookSubmissionStable = false;
};

interface Props {
  children: React.ReactNode;
}

export const TutorialManager: React.FC<Props> = ({ children }) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const router = useRouter();
  const pathname = usePathname();
  const {
    isActive,
    currentStep,
    startTutorial,
    nextStep,
    previousStep,
    skipTutorial,
    completeTutorial,
    restartTutorial,
  } = useTutorial();
  const [ownedSpotlight, setOwnedSpotlight] = useState<OwnedTutorialSpotlight>();
  const [targetUnavailable, setTargetUnavailable] = useState(false);
  const [openingCluster, setOpeningCluster] = useState(false);
  const [closingCallout, setClosingCallout] = useState(false);
  const [resumeEpoch, setResumeEpoch] = useState(0);
  const targetClusterRef = useRef<Cluster | null>(null);
  const stepAbortRef = useRef<AbortController | null>(null);
  const autoAdvancedStepRef = useRef<string | null>(null);
  const calloutTransitionInFlightRef = useRef(false);
  const clusterTransitionInFlightRef = useRef(false);
  const currentStepIdRef = useRef<string | null>(currentStep?.id ?? null);
  const routeAtStepStartRef = useRef(pathname);
  const viewedStepRef = useRef<string | null>(null);
  const setTutorialVisible = useTutorialUiStore((state) => state.setVisible);
  const setTutorialCurrentStep = useTutorialUiStore((state) => state.setCurrentStepId);
  const facebookSubmissionLayout = useTutorialUiStore((state) => state.facebookSubmissionLayout);

  const stepIndex = currentStep
    ? Math.max(0, TUTORIAL_STEPS.findIndex((step) => step.id === currentStep.id))
    : 0;
  const spotlight = getTutorialSpotlightForStep(ownedSpotlight, currentStep?.id);

  // Async actions can finish after React has already rendered the next step.
  // Keep this ref current during render so stale callbacks cannot advance the
  // newly rendered step (for example, the programmatic cluster-open action).
  currentStepIdRef.current = currentStep?.id ?? null;

  useEffect(() => {
    setTutorialVisible(isActive);
    setTutorialCurrentStep(isActive ? currentStep?.id ?? null : null);
    return () => {
      setTutorialVisible(false);
      setTutorialCurrentStep(null);
    };
  }, [currentStep?.id, isActive, setTutorialCurrentStep, setTutorialVisible]);

  useEffect(() => {
    if (!currentStep) return;
    if (viewedStepRef.current === currentStep.id) return;
    viewedStepRef.current = currentStep.id;
    routeAtStepStartRef.current = pathname;
    autoAdvancedStepRef.current = null;
    amplitudeTrack('tutorial_step_viewed', {
      tutorial_id: 'main_onboarding_v1',
      tutorial_version: 2,
      total_steps: TUTORIAL_STEPS.length,
      step_key: currentStep.id,
      step_index: stepIndex,
      from_screen: pathname || '(unknown)',
      legacy_step_keys: (currentStep.legacyStepIds ?? []).join(','),
    });
  }, [currentStep, pathname, stepIndex]);

  const advanceOnce = useCallback((step: TutorialStep) => {
    if (!isTutorialStepCurrent(step.id, currentStepIdRef.current)) return;
    if (autoAdvancedStepRef.current === step.id) return;
    autoAdvancedStepRef.current = step.id;
    getCompletedIdsForStep(step).forEach((stepKey) => {
      amplitudeTrack('tutorial_step_completed', {
        tutorial_id: 'main_onboarding_v1',
        tutorial_version: 2,
        total_steps: TUTORIAL_STEPS.length,
        step_key: stepKey,
        consolidated_into: step.id,
        from_screen: pathname || '(unknown)',
      });
    });
    nextStep();
  }, [nextStep, pathname]);

  const recoverFailedCalloutPresentation = useCallback(async (): Promise<boolean> => {
    const closedOnFirstAttempt = await runTutorialAction('close-callout');
    const closed = closedOnFirstAttempt || await runTutorialAction('close-callout');
    if (closed) return true;

    amplitudeTrack('tutorial_transition_failed', {
      tutorial_id: 'main_onboarding_v1',
      tutorial_version: 2,
      total_steps: TUTORIAL_STEPS.length,
      step_key: 'cluster-click',
      from_screen: pathname || '(unknown)',
      reason: 'callout_presentation_and_close_timeout',
    });
    clearHighlightFlags();
    setOwnedSpotlight(undefined);
    setTutorialModalOverlay(null);
    skipTutorial();
    return false;
  }, [pathname, skipTutorial]);

  useEffect(() => {
    if (!isActive || !currentStep) return;

    const globalAny = global as any;
    const handleEventsReady = () => {
      if (currentStep.id === 'events-tab') advanceOnce(currentStep);
    };
    const handleSpecialsReady = () => {
      if (currentStep.id === 'specials-tab') advanceOnce(currentStep);
    };
    const handleProfileReady = () => {
      if (currentStep.id === 'profile-facebook') advanceOnce(currentStep);
    };

    globalAny.onEventsScreenNavigated = handleEventsReady;
    globalAny.onSpecialsScreenNavigated = handleSpecialsReady;
    globalAny.onProfileScreenNavigated = handleProfileReady;

    return () => {
      if (globalAny.onEventsScreenNavigated === handleEventsReady) {
        delete globalAny.onEventsScreenNavigated;
      }
      if (globalAny.onSpecialsScreenNavigated === handleSpecialsReady) {
        delete globalAny.onSpecialsScreenNavigated;
      }
      if (globalAny.onProfileScreenNavigated === handleProfileReady) {
        delete globalAny.onProfileScreenNavigated;
      }
    };
  }, [advanceOnce, currentStep, isActive]);

  useEffect(() => {
    if (!isActive || !currentStep || pathname === routeAtStepStartRef.current) return;
    if (currentStep.id === 'events-tab' && isRoute(pathname, 'events')) advanceOnce(currentStep);
    if (currentStep.id === 'specials-tab' && isRoute(pathname, 'specials')) advanceOnce(currentStep);
    if (currentStep.id === 'profile-facebook' && isRoute(pathname, 'profile')) advanceOnce(currentStep);
  }, [advanceOnce, currentStep, isActive, pathname]);

  useEffect(() => {
    if (!isActive || currentStep?.id !== 'cluster-click') return;

    let targetCalloutWasOpen = doesTutorialCalloutMatchAnchor(
      useMapStore.getState().selectedVenues,
      targetClusterRef.current
        ? getTutorialClusterAnchorVenueKey(targetClusterRef.current)
        : null,
    );
    let anyCalloutWasOpen = useMapStore.getState().selectedVenues.length > 0;
    let presentationWaitStarted = false;
    let mismatchRecoveryStarted = false;
    let cancelled = false;
    const controller = new AbortController();
    const unsubscribe = useMapStore.subscribe((state) => {
      const anchorVenueKey = targetClusterRef.current
        ? getTutorialClusterAnchorVenueKey(targetClusterRef.current)
        : null;
      const targetCalloutIsOpen = doesTutorialCalloutMatchAnchor(
        state.selectedVenues,
        anchorVenueKey,
      );
      const anyCalloutIsOpen = state.selectedVenues.length > 0;
      if (!targetCalloutWasOpen && targetCalloutIsOpen && !presentationWaitStarted) {
        presentationWaitStarted = true;
        void (async () => {
          const presentationReady = await waitForCalloutPresentation(controller.signal);
          if (presentationReady && !cancelled && !controller.signal.aborted) {
            advanceOnce(currentStep);
            return;
          }
          if (!cancelled && !controller.signal.aborted) {
            const recovered = await recoverFailedCalloutPresentation();
            if (recovered && !cancelled && !controller.signal.aborted) {
              setTargetUnavailable(true);
            }
          }
        })();
      } else if (
        !anyCalloutWasOpen &&
        anyCalloutIsOpen &&
        !targetCalloutIsOpen &&
        !mismatchRecoveryStarted
      ) {
        mismatchRecoveryStarted = true;
        setOwnedSpotlight(undefined);
        void (async () => {
          const recovered = await recoverFailedCalloutPresentation();
          if (!recovered || cancelled || controller.signal.aborted) return;

          const target = targetClusterRef.current;
          const measured = target
            ? await runTutorialAction('measure-cluster', target)
            : false;
          if (!measured && !cancelled && !controller.signal.aborted) {
            setTargetUnavailable(true);
          }
          mismatchRecoveryStarted = false;
        })();
      }
      targetCalloutWasOpen = targetCalloutIsOpen;
      anyCalloutWasOpen = anyCalloutIsOpen;
    });

    return () => {
      cancelled = true;
      controller.abort();
      unsubscribe();
    };
  }, [advanceOnce, currentStep, isActive, recoverFailedCalloutPresentation]);

  useEffect(() => {
    clusterTransitionInFlightRef.current = false;
  }, [currentStep?.id]);

  useEffect(() => registerTutorialAction('tutorial-cluster-unavailable', () => {
    if (currentStepIdRef.current !== 'cluster-click') return false;
    setOwnedSpotlight(undefined);
    setTargetUnavailable(true);
    return true;
  }), []);

  useEffect(() => registerTutorialAction('tutorial-cluster-rebinding', (shouldClear = true) => {
    if (currentStepIdRef.current !== 'cluster-click') return false;
    if (shouldClear) setOwnedSpotlight(undefined);
    return true;
  }), []);

  useEffect(() => {
    stepAbortRef.current?.abort();
    const controller = new AbortController();
    stepAbortRef.current = controller;
    setOwnedSpotlight(undefined);
    setTargetUnavailable(false);
    setOpeningCluster(false);
    if (currentStep?.id !== 'callout-venue-selector') {
      calloutTransitionInFlightRef.current = false;
      setClosingCallout(false);
    }
    targetClusterRef.current = null;
    clearHighlightFlags();

    if (!isActive || !currentStep || currentStep.id === 'welcome' || currentStep.id === 'completion') {
      return () => controller.abort();
    }

    const prepare = async () => {
      if (currentStep.id === 'cluster-click') {
        if (pathname !== '/map' && !pathname.endsWith('/map')) {
          router.replace(MAP_ROUTE);
          return;
        }
        const mapActionsReady = await waitForTutorialAction('focus-cluster', {
          timeoutMs: TUTORIAL_CONFIG.ROUTE_TIMEOUT_MS,
          signal: controller.signal,
        });
        if (!mapActionsReady || controller.signal.aborted) {
          setTargetUnavailable(true);
          return;
        }
        if (useMapStore.getState().selectedVenues.length > 0) {
          const existingCalloutClosed = await recoverFailedCalloutPresentation();
          if (!existingCalloutClosed || controller.signal.aborted) {
            return;
          }
        }
        const clusters = await waitForClusters(controller.signal);
        if (!clusters || controller.signal.aborted) {
          setTargetUnavailable(true);
          return;
        }
        const target = clusters.find(isTutorialClusterCalloutTarget);
        if (!target) {
          setTargetUnavailable(true);
          return;
        }
        targetClusterRef.current = target;
        const focused = await runTutorialAction('focus-cluster', target, controller.signal);
        if (!focused || controller.signal.aborted) {
          setTargetUnavailable(true);
          return;
        }

        const measurementReady = await waitForTutorialAction('measure-cluster', {
          timeoutMs: TUTORIAL_CONFIG.ROUTE_TIMEOUT_MS,
          signal: controller.signal,
        });
        if (!measurementReady || controller.signal.aborted) {
          setTargetUnavailable(true);
          return;
        }
        const measuredAfter = Date.now();
        const projectedReady = waitForTutorialMeasurement('tutorialClusterLayout', {
          timeoutMs: TUTORIAL_CONFIG.TARGET_TIMEOUT_MS,
          freshAfter: measuredAfter,
          signal: controller.signal,
        });
        await runTutorialAction('measure-cluster', target);
        const projected = await projectedReady;
        if (controller.signal.aborted) return;

        const freshlyMeasuredSpotlight = projected.source === 'ready' && projected.measurement
          ? cleanMeasurement(projected.measurement, screenWidth, screenHeight)
          : null;
        if (freshlyMeasuredSpotlight) {
          setOwnedSpotlight({
            stepId: currentStep.id,
            config: {
              ...freshlyMeasuredSpotlight,
              borderRadius: 36,
              forceCircle: true,
              showPulse: true,
            },
          });
        } else {
          setTargetUnavailable(true);
        }
        return;
      }

      const target = LAYOUT_TARGETS[currentStep.id];
      if (!target) return;
      const freshAfter = Date.now();
      (global as any)[target.flag] = true;
      if (currentStep.id === 'facebook-submission' && facebookSubmissionLayout) {
        const measurement = cleanMeasurement(facebookSubmissionLayout, screenWidth, screenHeight);
        if (measurement) {
          (global as any).facebookSubmissionStable = true;
          setOwnedSpotlight({
            stepId: currentStep.id,
            config: { ...measurement, borderRadius: target.radius, showPulse: true },
          });
          return;
        }
      }
      const result = await waitForTutorialMeasurement(target.layout, {
        timeoutMs: TUTORIAL_CONFIG.TARGET_TIMEOUT_MS,
        freshAfter,
        acceptExisting: target.acceptExisting,
        signal: controller.signal,
        isUsable: (measurement) =>
          cleanMeasurement(measurement, screenWidth, screenHeight) !== null,
      });
      if (controller.signal.aborted) return;
      const measurement = result.measurement && cleanMeasurement(result.measurement, screenWidth, screenHeight);
      if (!measurement) {
        setTargetUnavailable(true);
        return;
      }
      setOwnedSpotlight({
        stepId: currentStep.id,
        config: {
          ...measurement,
          borderRadius: target.radius,
          showPulse: currentStep.action === 'interaction' || currentStep.id === 'facebook-submission',
        },
      });
      setTargetUnavailable(!result.measurement);
    };

    void prepare();
    return () => {
      controller.abort();
      clearHighlightFlags();
      if ((global as any).ignoreProgrammaticCameraRef) {
        (global as any).ignoreProgrammaticCameraRef = false;
      }
    };
  }, [
    currentStep,
    facebookSubmissionLayout,
    isActive,
    pathname,
    recoverFailedCalloutPresentation,
    resumeEpoch,
    router,
    screenHeight,
    screenWidth,
  ]);

  useEffect(() => {
    if (!isActive || currentStep?.id !== 'cluster-click') return undefined;

    return subscribeTutorialMeasurement('tutorialClusterLayout', (measurement) => {
      if (currentStepIdRef.current !== 'cluster-click') return;
      const clean = cleanMeasurement(measurement, screenWidth, screenHeight);
      if (!clean) return;
      setOwnedSpotlight({
        stepId: 'cluster-click',
        config: {
          ...clean,
          borderRadius: 36,
          forceCircle: true,
          showPulse: true,
        },
      });
      setTargetUnavailable(false);
    });
  }, [currentStep?.id, isActive, screenHeight, screenWidth]);

  useEffect(() => {
    if (!isActive) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stepAbortRef.current?.abort();
      if (state === 'active' && currentStep) {
        setOwnedSpotlight(undefined);
        setTargetUnavailable(false);
        setResumeEpoch((epoch) => epoch + 1);
      }
    });
    return () => subscription.remove();
  }, [currentStep, isActive]);

  const handleStart = useCallback(() => {
    if (pathname !== '/map' && !pathname.endsWith('/map')) {
      router.replace(MAP_ROUTE);
    }
    if (currentStep) advanceOnce(currentStep);
  }, [advanceOnce, currentStep, pathname, router]);

  const closeCalloutForTransition = useCallback(async (): Promise<boolean> => {
    if (calloutTransitionInFlightRef.current) return false;
    calloutTransitionInFlightRef.current = true;
    setClosingCallout(true);
    try {
      const closed = await runTutorialAction('close-callout');
      return closed && isTutorialStepCurrent('callout-venue-selector', currentStepIdRef.current);
    } finally {
      calloutTransitionInFlightRef.current = false;
      if (currentStepIdRef.current === 'callout-venue-selector') {
        setClosingCallout(false);
      }
    }
  }, []);

  const handleNext = useCallback(async () => {
    if (!currentStep) return;
    if (currentStep.id === 'completion') {
      completeTutorial();
      router.replace(MAP_ROUTE);
      return;
    }
    if (currentStep.id === 'cluster-click') {
      if (clusterTransitionInFlightRef.current) return;
      clusterTransitionInFlightRef.current = true;
      if (!targetClusterRef.current || targetUnavailable) {
        const unavailableSteps = TUTORIAL_STEPS.slice(stepIndex, stepIndex + 2);
        unavailableSteps.forEach((step) => {
          getCompletedIdsForStep(step).forEach((stepKey) => {
            amplitudeTrack('tutorial_step_completed', {
              tutorial_id: 'main_onboarding_v1',
              tutorial_version: 2,
              total_steps: TUTORIAL_STEPS.length,
              step_key: stepKey,
              consolidated_into: step.id,
              from_screen: pathname || '(unknown)',
              target_unavailable: true,
            });
          });
        });
        nextStep(2);
        return;
      }
      setOpeningCluster(true);
      const controller = new AbortController();
      let transitionAdvanced = false;
      try {
        const anchorVenueKey = getTutorialClusterAnchorVenueKey(targetClusterRef.current);
        if (!anchorVenueKey) {
          setTargetUnavailable(true);
          return;
        }
        const ready = waitForCallout(controller.signal, anchorVenueKey);
        const invoked = await runTutorialAction('open-cluster', targetClusterRef.current);
        const opened = invoked ? await ready : false;
        const presentationReady = opened
          ? await waitForCalloutPresentation(controller.signal)
          : false;
        if (!opened || !presentationReady) {
          const recovered = await recoverFailedCalloutPresentation();
          if (recovered) setTargetUnavailable(true);
          return;
        }
        transitionAdvanced = true;
        advanceOnce(currentStep);
      } finally {
        controller.abort();
        setOpeningCluster(false);
        if (!transitionAdvanced) clusterTransitionInFlightRef.current = false;
      }
      return;
    }
    if (currentStep.id === 'callout-venue-selector') {
      if (await closeCalloutForTransition()) {
        advanceOnce(currentStep);
      }
      return;
    }
    if (currentStep.id === 'events-tab') {
      router.replace('/(tabs)/events');
      advanceOnce(currentStep);
      return;
    }
    if (currentStep.id === 'specials-tab') {
      router.replace('/(tabs)/specials');
      advanceOnce(currentStep);
      return;
    }
    if (currentStep.id === 'profile-facebook') {
      router.replace('/profile');
      advanceOnce(currentStep);
      return;
    }
    advanceOnce(currentStep);
  }, [
    advanceOnce,
    closeCalloutForTransition,
    completeTutorial,
    currentStep,
    nextStep,
    pathname,
    recoverFailedCalloutPresentation,
    router,
    stepIndex,
    targetUnavailable,
  ]);

  const handlePrevious = useCallback(async () => {
    if (currentStep?.id === 'callout-venue-selector') {
      if (!await closeCalloutForTransition()) return;
    }
    const previous = TUTORIAL_STEPS[Math.max(0, stepIndex - 1)];
    if (previous?.id === 'events-tab') {
      router.replace(MAP_ROUTE);
    } else if (previous?.id === 'events-list-explanation' || previous?.id === 'specials-tab') {
      router.replace('/(tabs)/events');
    } else if (previous?.id === 'specials-list-explanation' || previous?.id === 'profile-facebook') {
      router.replace('/(tabs)/specials');
    } else if (previous?.id === 'facebook-submission') {
      router.replace('/profile');
    }
    previousStep();
  }, [closeCalloutForTransition, currentStep?.id, previousStep, router, stepIndex]);

  useEffect(
    () => registerTutorialAction('tutorial-previous', handlePrevious),
    [handlePrevious],
  );

  const handleSkip = useCallback(() => {
    stepAbortRef.current?.abort();
    const shouldCloseCallout = currentStep?.id === 'callout-venue-selector';
    clearHighlightFlags();
    setOwnedSpotlight(undefined);
    setTargetUnavailable(false);
    setTutorialModalOverlay(null);
    skipTutorial();
    if (shouldCloseCallout) void closeCalloutForTransition();
  }, [closeCalloutForTransition, currentStep?.id, skipTutorial]);

  const handleRestart = useCallback(() => {
    restartTutorial();
  }, [restartTutorial]);

  useEffect(() => {
    (global as any).triggerGathRTutorial = startTutorial;
    (global as any).autoTriggerGathRTutorial = startTutorial;
    (global as any).restartGathRTutorial = handleRestart;
    return () => {
      delete (global as any).triggerGathRTutorial;
      delete (global as any).autoTriggerGathRTutorial;
      delete (global as any).restartGathRTutorial;
    };
  }, [handleRestart, startTutorial]);

  const showRequiredFallback = targetUnavailable && ['events-tab', 'specials-tab', 'profile-facebook'].includes(currentStep?.id ?? '');
  const showNext = Boolean(currentStep) && (
    currentStep?.action !== 'interaction' ||
    currentStep.id === 'cluster-click' ||
    showRequiredFallback
  );
  const nextText = currentStep?.id === 'completion'
    ? 'Start exploring'
    : currentStep?.id === 'cluster-click'
      ? openingCluster ? 'Opening…' : targetUnavailable ? 'Continue' : 'Open cluster'
      : currentStep?.id === 'callout-venue-selector' && closingCallout
        ? 'Closing…'
      : 'Continue';
  const resolvedSheetPosition = currentStep?.id === 'completion'
    ? 'center'
    : currentStep?.id === 'facebook-submission'
      ? 'top'
    : spotlight
      ? spotlight.y + spotlight.height / 2 > screenHeight / 2 ? 'top' : 'bottom'
      : currentStep?.sheetPosition ?? 'bottom';

  const renderTutorialSheet = useCallback(() => (
    <TutorialSpotlight
      spotlight={spotlight}
      blockOutsideSpotlight={currentStep?.id === 'cluster-click'}
      onSpotlightPress={
        currentStep?.id === 'cluster-click' && !openingCluster
          ? handleNext
          : undefined
      }
    >
      <TutorialBottomSheet
        stepId={currentStep!.id}
        title={currentStep!.title}
        content={currentStep!.content}
        onNext={openingCluster || closingCallout ? undefined : handleNext}
        onPrevious={closingCallout ? undefined : handlePrevious}
        onSkip={closingCallout ? undefined : handleSkip}
        showPrevious={stepIndex > 0}
        showNext={showNext}
        showSkip={currentStep!.id !== 'completion'}
        nextText={nextText}
        position={{ x: screenWidth / 2, y: screenHeight / 2 }}
        placement={currentStep!.placement ?? 'bottom'}
        sheetPosition={resolvedSheetPosition}
        stepNumber={stepIndex + 1}
        totalSteps={TUTORIAL_STEPS.length}
        targetUnavailable={targetUnavailable}
      />
    </TutorialSpotlight>
  ), [
    currentStep,
    closingCallout,
    handleNext,
    handlePrevious,
    handleSkip,
    nextText,
    openingCluster,
    resolvedSheetPosition,
    screenHeight,
    screenWidth,
    showNext,
    spotlight,
    stepIndex,
    targetUnavailable,
  ]);

  useEffect(() => {
    if (!isActive || !isTutorialModalHostedStep(currentStep?.id)) {
      setTutorialModalOverlay(null);
      return;
    }
    setTutorialModalOverlay(renderTutorialSheet);
    return () => setTutorialModalOverlay(null);
  }, [currentStep?.id, isActive, renderTutorialSheet]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {isActive && currentStep?.id === 'welcome' && (
        <WelcomeScreen
          onStart={handleStart}
          onSkip={handleSkip}
          stepNumber={1}
          totalSteps={TUTORIAL_STEPS.length}
        />
      )}
      {isActive && currentStep && currentStep.id !== 'welcome' && !isTutorialModalHostedStep(currentStep.id) && (
        renderTutorialSheet()
      )}
    </View>
  );
};
