import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, useWindowDimensions, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TUTORIAL_CONFIG, TUTORIAL_STEPS, getCompletedIdsForStep } from '../../config/tutorialSteps';
import { useTutorial } from '../../hooks/useTutorial';
import { amplitudeTrack } from '../../lib/amplitudeAnalytics';
import { useMapStore } from '../../store/mapStore';
import { useTutorialUiStore } from '../../store/tutorialUiStore';
import { Cluster } from '../../types/events';
import { ComponentMeasurement, SpotlightConfig, TutorialStep } from '../../types/tutorial';
import { runTutorialAction } from '../../utils/tutorialActions';
import {
  isTutorialModalHostedStep,
  setTutorialModalOverlay,
} from '../../utils/tutorialModalOverlay';
import {
  waitForTutorialMeasurement,
} from '../../utils/tutorialReadiness';
import { TutorialBottomSheet } from './TutorialBottomSheet';
import { TutorialSpotlight } from './TutorialSpotlight';
import { WelcomeScreen } from './WelcomeScreen';

const MAP_ROUTE = '/(tabs)/map' as const;
const CLUSTER_ARTWORK_HORIZONTAL_OFFSET = 25;
const STEP_ADVANCE_LOCK_MS = 450;

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
    // The callout publishes its measurement as soon as its native modal is
    // laid out. By the time this step mounts that measurement is already the
    // current, stable callout—not stale geometry from a previous route.
    acceptExisting: true,
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
    acceptExisting: true,
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
    acceptExisting: true,
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

const waitForCallout = (signal: AbortSignal) => new Promise<boolean>((resolve) => {
  const current = useMapStore.getState().selectedVenues;
  if (current.length) {
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
    if (state.selectedVenues.length) finish(true);
  });
  const onAbort = () => finish(false);
  const timeout = setTimeout(() => finish(false), TUTORIAL_CONFIG.ROUTE_TIMEOUT_MS);
  signal.addEventListener('abort', onAbort, { once: true });
});

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
  const insets = useSafeAreaInsets();
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
  const [spotlight, setSpotlight] = useState<SpotlightConfig>();
  const [targetUnavailable, setTargetUnavailable] = useState(false);
  const [openingCluster, setOpeningCluster] = useState(false);
  const [resumeEpoch, setResumeEpoch] = useState(0);
  const targetClusterRef = useRef<Cluster | null>(null);
  const stepAbortRef = useRef<AbortController | null>(null);
  const autoAdvancedStepRef = useRef<string | null>(null);
  const routeAtStepStartRef = useRef(pathname);
  const viewedStepRef = useRef<string | null>(null);
  const lastAdvanceAtRef = useRef(0);
  const setTutorialVisible = useTutorialUiStore((state) => state.setVisible);
  const setTutorialCurrentStep = useTutorialUiStore((state) => state.setCurrentStepId);
  const facebookSubmissionLayout = useTutorialUiStore((state) => state.facebookSubmissionLayout);

  const stepIndex = currentStep
    ? Math.max(0, TUTORIAL_STEPS.findIndex((step) => step.id === currentStep.id))
    : 0;

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
    if (autoAdvancedStepRef.current === step.id) return;
    const now = Date.now();
    if (now - lastAdvanceAtRef.current < STEP_ADVANCE_LOCK_MS) return;
    lastAdvanceAtRef.current = now;
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
    if (!isActive || !currentStep || pathname === routeAtStepStartRef.current) return;
    if (currentStep.id === 'events-tab' && isRoute(pathname, 'events')) advanceOnce(currentStep);
    if (currentStep.id === 'specials-tab' && isRoute(pathname, 'specials')) advanceOnce(currentStep);
    if (currentStep.id === 'profile-facebook' && isRoute(pathname, 'profile')) advanceOnce(currentStep);
  }, [advanceOnce, currentStep, isActive, pathname]);

  useEffect(() => {
    stepAbortRef.current?.abort();
    const controller = new AbortController();
    stepAbortRef.current = controller;
    setSpotlight(undefined);
    setTargetUnavailable(false);
    setOpeningCluster(false);
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
        const clusters = await waitForClusters(controller.signal);
        if (!clusters || controller.signal.aborted) {
          setTargetUnavailable(true);
          return;
        }
        const target = clusters.find((cluster) => cluster.eventCount + cluster.specialCount > 0)
          ?? clusters[0];
        if (!target) {
          setTargetUnavailable(true);
          return;
        }
        targetClusterRef.current = target;
        await runTutorialAction('focus-cluster', target);
        if (controller.signal.aborted) return;

        // Centering the chosen cluster avoids Android MarkerView's unreliable
        // window layout and keeps this independent of map pitch and safe-area
        // offsets on both platforms. The marker artwork itself is asymmetric:
        // its visible cluster core sits 25 dp right of the Mapbox anchor.
        const measurement = cleanMeasurement({
          x: screenWidth / 2 + CLUSTER_ARTWORK_HORIZONTAL_OFFSET - 36,
          y: screenHeight / 2 - 36,
          width: 72,
          height: 72,
        }, screenWidth, screenHeight);
        if (measurement) {
          setSpotlight({ ...measurement, borderRadius: 36, forceCircle: true, showPulse: true });
        } else {
          setTargetUnavailable(true);
        }
        return;
      }

      const target = LAYOUT_TARGETS[currentStep.id];
      if (!target) return;
      const freshAfter = Date.now();
      (global as any)[target.flag] = true;
      if (currentStep.id === 'profile-facebook') {
        const size = 34;
        const measurement = cleanMeasurement({
          x: screenWidth - 16 - size,
          y: insets.top + (Platform.OS === 'android' ? 32 : 15),
          width: size,
          height: size,
        }, screenWidth, screenHeight);
        if (measurement) {
          setSpotlight({ ...measurement, borderRadius: 20, showPulse: true });
        } else {
          setTargetUnavailable(true);
        }
        return;
      }
      if (currentStep.id === 'facebook-submission' && facebookSubmissionLayout) {
        const measurement = cleanMeasurement(facebookSubmissionLayout, screenWidth, screenHeight);
        if (measurement) {
          (global as any).facebookSubmissionStable = true;
          setSpotlight({ ...measurement, borderRadius: target.radius, showPulse: true });
          return;
        }
      }
      const result = await waitForTutorialMeasurement(target.layout, {
        timeoutMs: TUTORIAL_CONFIG.TARGET_TIMEOUT_MS,
        freshAfter,
        acceptExisting: target.acceptExisting,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const measurement = result.measurement && cleanMeasurement(result.measurement, screenWidth, screenHeight);
      if (!measurement) {
        setTargetUnavailable(true);
        return;
      }
      setSpotlight({
        ...measurement,
        borderRadius: target.radius,
        showPulse: currentStep.action === 'interaction' || currentStep.id === 'facebook-submission',
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
    insets.top,
    isActive,
    pathname,
    resumeEpoch,
    router,
    screenHeight,
    screenWidth,
  ]);

  useEffect(() => {
    if (!isActive) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stepAbortRef.current?.abort();
      if (state === 'active' && currentStep) {
        setSpotlight(undefined);
        setTargetUnavailable(false);
        setResumeEpoch((epoch) => epoch + 1);
      }
    });
    return () => subscription.remove();
  }, [currentStep, isActive]);

  const handleStart = useCallback(() => {
    router.replace(MAP_ROUTE);
    if (currentStep) advanceOnce(currentStep);
  }, [advanceOnce, currentStep, router]);

  const handleNext = useCallback(async () => {
    if (!currentStep) return;
    if (currentStep.id === 'completion') {
      completeTutorial();
      router.replace(MAP_ROUTE);
      return;
    }
    if (currentStep.id === 'cluster-click') {
      if (!targetClusterRef.current || targetUnavailable) {
        advanceOnce(currentStep);
        return;
      }
      setOpeningCluster(true);
      const controller = new AbortController();
      const ready = waitForCallout(controller.signal);
      const invoked = await runTutorialAction('open-cluster', targetClusterRef.current);
      const opened = invoked ? await ready : false;
      controller.abort();
      setOpeningCluster(false);
      if (!opened) setTargetUnavailable(true);
      advanceOnce(currentStep);
      return;
    }
    if (currentStep.id === 'callout-venue-selector') {
      await runTutorialAction('close-callout');
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
  }, [advanceOnce, completeTutorial, currentStep, router, targetUnavailable]);

  const handlePrevious = useCallback(() => {
    if (currentStep?.id === 'callout-venue-selector') {
      void runTutorialAction('close-callout');
    }
    const previous = TUTORIAL_STEPS[Math.max(0, stepIndex - 1)];
    if (['events-tab', 'specials-tab', 'profile-facebook'].includes(previous?.id)) {
      router.replace(MAP_ROUTE);
    }
    previousStep();
  }, [currentStep?.id, previousStep, router, stepIndex]);

  const handleSkip = useCallback(() => {
    stepAbortRef.current?.abort();
    void runTutorialAction('close-callout');
    clearHighlightFlags();
    skipTutorial();
  }, [skipTutorial]);

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
      : 'Continue';
  const resolvedSheetPosition = currentStep?.id === 'completion'
    ? 'center'
    : currentStep?.id === 'facebook-submission'
      ? 'top'
    : spotlight
      ? spotlight.y + spotlight.height / 2 > screenHeight / 2 ? 'top' : 'bottom'
      : currentStep?.sheetPosition ?? 'bottom';

  const renderTutorialSheet = useCallback(() => (
    <TutorialSpotlight spotlight={spotlight}>
      <TutorialBottomSheet
        stepId={currentStep!.id}
        title={currentStep!.title}
        content={currentStep!.content}
        onNext={openingCluster ? undefined : handleNext}
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
