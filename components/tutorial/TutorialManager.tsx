import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, useWindowDimensions, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { TUTORIAL_CONFIG, TUTORIAL_STEPS, getCompletedIdsForStep } from '../../config/tutorialSteps';
import { useTutorial } from '../../hooks/useTutorial';
import { amplitudeTrack } from '../../lib/amplitudeAnalytics';
import { useTutorialUiStore } from '../../store/tutorialUiStore';
import { ComponentMeasurement, TutorialStep } from '../../types/tutorial';
import {
  isTutorialStepCurrent,
  registerTutorialAction,
} from '../../utils/tutorialActions';
import {
  isTutorialModalHostedStep,
  setTutorialModalOverlay,
} from '../../utils/tutorialModalOverlay';
import {
  waitForTutorialMeasurement,
} from '../../utils/tutorialReadiness';
import {
  isTutorialDemoCalloutStep,
  isTutorialDemoClusterReady,
  shouldAdvanceTutorialDemoCallout,
} from '../../utils/tutorialDemoFixtureState';
import {
  getTutorialSpotlightForStep,
  OwnedTutorialSpotlight,
} from '../../utils/tutorialSpotlightOwnership';
import { TutorialBottomSheet } from './TutorialBottomSheet';
import { TutorialDemoCallout } from './TutorialDemoCallout';
import { TutorialDemoCluster } from './TutorialDemoCluster';
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
  const ownedSpotlightRef = useRef<OwnedTutorialSpotlight | undefined>(undefined);
  const updateOwnedSpotlight = useCallback((next?: OwnedTutorialSpotlight) => {
    ownedSpotlightRef.current = next;
    setOwnedSpotlight(next);
  }, []);
  const [targetUnavailable, setTargetUnavailable] = useState(false);
  const [openingCluster, setOpeningCluster] = useState(false);
  const [demoCalloutVisible, setDemoCalloutVisible] = useState(false);
  const [demoCalloutReady, setDemoCalloutReady] = useState(false);
  const [resumeEpoch, setResumeEpoch] = useState(0);
  const stepAbortRef = useRef<AbortController | null>(null);
  const autoAdvancedStepRef = useRef<string | null>(null);
  const clusterTransitionInFlightRef = useRef(false);
  const demoCalloutAdvanceRef = useRef(false);
  const demoVenueSelectorLayoutRef = useRef<ComponentMeasurement | null>(null);
  const demoClusterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoCalloutTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    clusterTransitionInFlightRef.current = false;
  }, [currentStep?.id]);

  useEffect(() => {
    stepAbortRef.current?.abort();
    const controller = new AbortController();
    stepAbortRef.current = controller;
    updateOwnedSpotlight(undefined);
    setTargetUnavailable(false);
    setOpeningCluster(false);
    if (demoClusterTimeoutRef.current) {
      clearTimeout(demoClusterTimeoutRef.current);
      demoClusterTimeoutRef.current = null;
    }
    if (demoCalloutTimeoutRef.current) {
      clearTimeout(demoCalloutTimeoutRef.current);
      demoCalloutTimeoutRef.current = null;
    }
    if (currentStep?.id === 'cluster-click') {
      demoCalloutAdvanceRef.current = false;
      demoVenueSelectorLayoutRef.current = null;
      setDemoCalloutVisible(false);
      setDemoCalloutReady(false);
    } else if (currentStep?.id !== 'callout-venue-selector') {
      demoVenueSelectorLayoutRef.current = null;
      setDemoCalloutVisible(false);
      setDemoCalloutReady(false);
    }
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
        demoClusterTimeoutRef.current = setTimeout(() => {
          if (
            currentStepIdRef.current === 'cluster-click'
            && !ownedSpotlightRef.current
          ) {
            setTargetUnavailable(true);
          }
          demoClusterTimeoutRef.current = null;
        }, TUTORIAL_CONFIG.TARGET_TIMEOUT_MS);
        return;
      }

      if (currentStep.id === 'callout-venue-selector' && demoCalloutVisible) {
        const measurement = demoVenueSelectorLayoutRef.current
          && cleanMeasurement(demoVenueSelectorLayoutRef.current, screenWidth, screenHeight);
        if (!measurement) {
          setTargetUnavailable(true);
          return;
        }
        updateOwnedSpotlight({
          stepId: currentStep.id,
          config: { ...measurement, borderRadius: 14, showPulse: true },
        });
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
          updateOwnedSpotlight({
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
      updateOwnedSpotlight({
        stepId: currentStep.id,
        config: {
          ...measurement,
          borderRadius: target.radius,
          showPulse: currentStep.action === 'interaction' || currentStep.id === 'facebook-submission',
        },
      });
      setTargetUnavailable(!result.measurement);
    };

    void prepare().catch(() => {
      if (!controller.signal.aborted && currentStepIdRef.current === currentStep.id) {
        if (ownedSpotlightRef.current?.stepId === currentStep.id) {
          setTargetUnavailable(false);
          return;
        }
        updateOwnedSpotlight(undefined);
        setTargetUnavailable(true);
      }
    });
    return () => {
      controller.abort();
      if (demoClusterTimeoutRef.current) {
        clearTimeout(demoClusterTimeoutRef.current);
        demoClusterTimeoutRef.current = null;
      }
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
    resumeEpoch,
    router,
    screenHeight,
    screenWidth,
    updateOwnedSpotlight,
  ]);

  const handleDemoClusterLayout = useCallback((measurement: ComponentMeasurement) => {
    if (currentStepIdRef.current !== 'cluster-click') return;
    const clean = cleanMeasurement(measurement, screenWidth, screenHeight);
    if (!clean) {
      setTargetUnavailable(true);
      return;
    }
    if (demoClusterTimeoutRef.current) {
      clearTimeout(demoClusterTimeoutRef.current);
      demoClusterTimeoutRef.current = null;
    }
    updateOwnedSpotlight({
      stepId: 'cluster-click',
      config: { ...clean, borderRadius: clean.width / 2, forceCircle: true, showPulse: true },
    });
    setTargetUnavailable(false);
  }, [screenHeight, screenWidth, updateOwnedSpotlight]);

  const handleDemoCalloutSelectorLayout = useCallback((measurement: ComponentMeasurement) => {
    const clean = cleanMeasurement(measurement, screenWidth, screenHeight);
    if (!clean) return;
    demoVenueSelectorLayoutRef.current = clean;
    if (currentStepIdRef.current === 'callout-venue-selector') {
      updateOwnedSpotlight({
        stepId: 'callout-venue-selector',
        config: { ...clean, borderRadius: 14, showPulse: true },
      });
      setTargetUnavailable(false);
    }
  }, [screenHeight, screenWidth, updateOwnedSpotlight]);

  const handleDemoCalloutReady = useCallback(() => {
    setDemoCalloutReady(true);
  }, []);

  useEffect(() => {
    if (!currentStep || !shouldAdvanceTutorialDemoCallout({
      isTutorialActive: isActive,
      currentStepId: currentStep?.id,
      demoCalloutVisible,
      demoCalloutReady,
      alreadyAdvanced: demoCalloutAdvanceRef.current,
    })) {
      return;
    }
    demoCalloutAdvanceRef.current = true;
    if (demoCalloutTimeoutRef.current) {
      clearTimeout(demoCalloutTimeoutRef.current);
      demoCalloutTimeoutRef.current = null;
    }
    setOpeningCluster(false);
    advanceOnce(currentStep);
  }, [advanceOnce, currentStep, demoCalloutReady, demoCalloutVisible, isActive]);

  useEffect(() => {
    if (!isActive) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stepAbortRef.current?.abort();
      if (state === 'active' && currentStep) {
        updateOwnedSpotlight(undefined);
        setTargetUnavailable(false);
        setResumeEpoch((epoch) => epoch + 1);
      }
    });
    return () => subscription.remove();
  }, [currentStep, isActive, updateOwnedSpotlight]);

  const handleStart = useCallback(() => {
    if (pathname !== '/map' && !pathname.endsWith('/map')) {
      router.replace(MAP_ROUTE);
    }
    if (currentStep) advanceOnce(currentStep);
  }, [advanceOnce, currentStep, pathname, router]);

  const handleNext = useCallback(() => {
    if (!currentStep) return;
    if (currentStep.id === 'completion') {
      completeTutorial();
      router.replace(MAP_ROUTE);
      return;
    }
    if (currentStep.id === 'cluster-click') {
      if (clusterTransitionInFlightRef.current) return;
      clusterTransitionInFlightRef.current = true;
      if (!spotlight || targetUnavailable) {
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
      updateOwnedSpotlight(undefined);
      setOpeningCluster(true);
      setDemoCalloutReady(false);
      setDemoCalloutVisible(true);
      demoCalloutTimeoutRef.current = setTimeout(() => {
        if (
          currentStepIdRef.current === 'cluster-click'
          && !demoCalloutAdvanceRef.current
        ) {
          setDemoCalloutVisible(false);
          setOpeningCluster(false);
          setTargetUnavailable(true);
          clusterTransitionInFlightRef.current = false;
        }
        demoCalloutTimeoutRef.current = null;
      }, TUTORIAL_CONFIG.TARGET_TIMEOUT_MS);
      return;
    }
    if (currentStep.id === 'callout-venue-selector') {
      setDemoCalloutVisible(false);
      setDemoCalloutReady(false);
      demoVenueSelectorLayoutRef.current = null;
      updateOwnedSpotlight(undefined);
      advanceOnce(currentStep);
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
    completeTutorial,
    currentStep,
    nextStep,
    pathname,
    router,
    stepIndex,
    spotlight,
    targetUnavailable,
    updateOwnedSpotlight,
  ]);

  const handlePrevious = useCallback(() => {
    if (currentStep?.id === 'callout-venue-selector') {
      setDemoCalloutVisible(false);
      setDemoCalloutReady(false);
      demoVenueSelectorLayoutRef.current = null;
      updateOwnedSpotlight(undefined);
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
  }, [currentStep?.id, previousStep, router, stepIndex, updateOwnedSpotlight]);

  useEffect(
    () => registerTutorialAction('tutorial-previous', handlePrevious),
    [handlePrevious],
  );

  const handleSkip = useCallback(() => {
    stepAbortRef.current?.abort();
    if (demoCalloutTimeoutRef.current) {
      clearTimeout(demoCalloutTimeoutRef.current);
      demoCalloutTimeoutRef.current = null;
    }
    clearHighlightFlags();
    updateOwnedSpotlight(undefined);
    setTargetUnavailable(false);
    setDemoCalloutVisible(false);
    setDemoCalloutReady(false);
    demoVenueSelectorLayoutRef.current = null;
    setTutorialModalOverlay(null);
    skipTutorial();
  }, [skipTutorial, updateOwnedSpotlight]);

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
  const clusterTargetReady = isTutorialDemoClusterReady(
    currentStep?.id,
    Boolean(spotlight),
    targetUnavailable,
  );
  const demoCalloutStepActive = isTutorialDemoCalloutStep(
    isActive,
    currentStep?.id,
    demoCalloutVisible,
  );
  const showNext = Boolean(currentStep) && (
    currentStep?.action !== 'interaction' ||
    currentStep.id === 'cluster-click' ||
    showRequiredFallback
  );
  const nextText = currentStep?.id === 'completion'
    ? 'Start exploring'
    : currentStep?.id === 'cluster-click'
      ? openingCluster
        ? 'Opening…'
        : targetUnavailable
          ? 'Continue'
          : clusterTargetReady
            ? 'Open cluster'
            : 'Locating…'
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
      blockOutsideSpotlight={
        currentStep?.id === 'cluster-click' || demoCalloutStepActive
      }
      onSpotlightPress={
        currentStep?.id === 'cluster-click' && clusterTargetReady && !openingCluster
          ? handleNext
          : undefined
      }
    >
      <TutorialBottomSheet
        stepId={currentStep!.id}
        title={currentStep!.title}
        content={currentStep!.content}
        onNext={
          openingCluster ||
          (currentStep?.id === 'cluster-click' && !targetUnavailable && !clusterTargetReady)
            ? undefined
            : handleNext
        }
        onPrevious={handlePrevious}
        onSkip={handleSkip}
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
    clusterTargetReady,
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
    demoCalloutStepActive,
  ]);

  useEffect(() => {
    if (
      !isActive
      || !isTutorialModalHostedStep(currentStep?.id)
      || demoCalloutStepActive
    ) {
      setTutorialModalOverlay(null);
      return;
    }
    setTutorialModalOverlay(renderTutorialSheet);
    return () => setTutorialModalOverlay(null);
  }, [currentStep?.id, isActive, demoCalloutStepActive, renderTutorialSheet]);

  const showDemoCluster = Boolean(
    isActive
    && currentStep?.id === 'cluster-click'
    && (pathname === '/map' || pathname.endsWith('/map')),
  );

  return (
    <View
      collapsable={false}
      style={{ flex: 1 }}
    >
      {children}
      {showDemoCluster && (
        <TutorialDemoCluster
          key={`tutorial-demo-cluster-${resumeEpoch}`}
          onLayout={handleDemoClusterLayout}
        />
      )}
      {isActive && demoCalloutVisible && (
        <TutorialDemoCallout
          onReady={handleDemoCalloutReady}
          onVenueSelectorLayout={handleDemoCalloutSelectorLayout}
        />
      )}
      {isActive && currentStep?.id === 'welcome' && (
        <WelcomeScreen
          onStart={handleStart}
          onSkip={handleSkip}
          stepNumber={1}
          totalSteps={TUTORIAL_STEPS.length}
        />
      )}
      {isActive && currentStep && currentStep.id !== 'welcome' && (
        !isTutorialModalHostedStep(currentStep.id) || demoCalloutStepActive
      ) && (
        renderTutorialSheet()
      )}
    </View>
  );
};
