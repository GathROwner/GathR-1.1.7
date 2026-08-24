import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Modal, useWindowDimensions, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { TUTORIAL_CONFIG, TUTORIAL_STEPS, getCompletedIdsForStep } from '../../config/tutorialSteps';
import { useTutorial } from '../../hooks/useTutorial';
import { amplitudeTrack } from '../../lib/amplitudeAnalytics';
import { useMapStore } from '../../store/mapStore';
import { useTutorialUiStore } from '../../store/tutorialUiStore';
import { Cluster } from '../../types/events';
import { ComponentMeasurement, SpotlightConfig, TutorialStep } from '../../types/tutorial';
import { runTutorialAction } from '../../utils/tutorialActions';
import {
  waitForTutorialMeasurement,
} from '../../utils/tutorialReadiness';
import { TutorialBottomSheet } from './TutorialBottomSheet';
import { TutorialSpotlight } from './TutorialSpotlight';
import { WelcomeScreen } from './WelcomeScreen';

const MAP_ROUTE = '/(tabs)/map' as const;

// Temporary Preview-only timing probe. Removed before the final release commit.
const tutorialPerf = (event: string, details: Record<string, unknown> = {}) => {
  const monotonic = global.performance?.now?.() ?? Date.now();
  console.warn(`[GathR Tutorial Perf v2 ${monotonic.toFixed(1)}ms]`, event, JSON.stringify(details));
};

type LayoutTarget = {
  flag: string;
  layout: string;
  radius: number;
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
  },
  'facebook-submission': {
    flag: 'tutorialHighlightFacebookSubmission',
    layout: 'facebookSubmissionLayout',
    radius: 18,
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
  const router = useRouter();
  const pathname = usePathname();
  const {
    isActive,
    currentStep,
    tutorialStatus,
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
  const setTutorialVisible = useTutorialUiStore((state) => state.setVisible);

  const stepIndex = currentStep
    ? Math.max(0, TUTORIAL_STEPS.findIndex((step) => step.id === currentStep.id))
    : 0;

  useEffect(() => {
    setTutorialVisible(isActive);
    return () => setTutorialVisible(false);
  }, [isActive, setTutorialVisible]);

  useEffect(() => {
    if (!tutorialStatus || tutorialStatus.completed || tutorialStatus.skipped || isActive) return;
    startTutorial();
  }, [isActive, startTutorial, tutorialStatus]);

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
    tutorialPerf('step_rendered', { stepId: currentStep.id, pathname });
    requestAnimationFrame(() => tutorialPerf('tooltip_stable', { stepId: currentStep.id, pathname }));
  }, [currentStep, pathname, stepIndex]);

  useEffect(() => {
    if (spotlight && currentStep) tutorialPerf('spotlight_visible', { stepId: currentStep.id, spotlight });
  }, [currentStep, spotlight]);

  const advanceOnce = useCallback((step: TutorialStep) => {
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
    if (!isActive || !currentStep || pathname === routeAtStepStartRef.current) return;
    tutorialPerf('route_available', { stepId: currentStep.id, pathname });
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
      tutorialPerf('position_begin', { stepId: currentStep.id, pathname });
      if (currentStep.id === 'cluster-click') {
        if (pathname !== '/map' && !pathname.endsWith('/map')) {
          router.replace(MAP_ROUTE);
          tutorialPerf('navigation_begin', { stepId: currentStep.id, destination: 'map' });
          return;
        }
        const clusters = await waitForClusters(controller.signal);
        tutorialPerf('cluster_ready', { available: Boolean(clusters?.length), count: clusters?.length ?? 0 });
        if (!clusters || controller.signal.aborted) {
          setTargetUnavailable(true);
          return;
        }
        const projected = (global as any).getTutorialClusterTargets?.()?.projected as {
          cluster: Cluster;
          x: number;
          y: number;
        }[] | undefined;
        const target = projected?.find(({ cluster }) => cluster.eventCount + cluster.specialCount > 0)
          ?? projected?.[0];
        if (!target) {
          setTargetUnavailable(true);
          return;
        }
        targetClusterRef.current = target.cluster;

        // The map already maintains JS-projected hit targets for its visible
        // clusters. Reusing those coordinates avoids all synchronous Mapbox
        // camera/projection bridge calls during the tutorial.
        const measurement = cleanMeasurement({
          x: target.x - 38,
          y: target.y - 58,
          width: 76,
          height: 76,
        }, screenWidth, screenHeight);
        tutorialPerf('camera_ready', { stepId: currentStep.id, source: 'not-needed' });
        tutorialPerf('target_measured', { stepId: currentStep.id, source: 'visible-cluster-projection' });
        if (measurement) {
          setSpotlight({ ...measurement, borderRadius: 38, forceCircle: true, showPulse: true });
        } else {
          setTargetUnavailable(true);
        }
        return;
      }

      const target = LAYOUT_TARGETS[currentStep.id];
      if (!target) return;
      const freshAfter = Date.now();
      (global as any)[target.flag] = true;
      const result = await waitForTutorialMeasurement(target.layout, {
        timeoutMs: TUTORIAL_CONFIG.TARGET_TIMEOUT_MS,
        freshAfter,
        signal: controller.signal,
      });
      tutorialPerf('target_measured', { stepId: currentStep.id, source: result.source, layout: target.layout });
      if (controller.signal.aborted) return;
      const measurement = result.measurement && cleanMeasurement(result.measurement, screenWidth, screenHeight);
      if (!measurement) {
        setTargetUnavailable(true);
        return;
      }
      setSpotlight({ ...measurement, borderRadius: target.radius, showPulse: false });
      setTargetUnavailable(result.source === 'timeout');
    };

    void prepare();
    return () => {
      controller.abort();
      clearHighlightFlags();
      if ((global as any).ignoreProgrammaticCameraRef) {
        (global as any).ignoreProgrammaticCameraRef = false;
      }
    };
  }, [currentStep, isActive, pathname, resumeEpoch, router, screenHeight, screenWidth]);

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
    tutorialPerf('action', { stepId: currentStep?.id ?? 'welcome', action: 'start' });
    router.replace(MAP_ROUTE);
    tutorialPerf('navigation_begin', { stepId: currentStep?.id ?? 'welcome', destination: 'map' });
    if (currentStep) advanceOnce(currentStep);
  }, [advanceOnce, currentStep, router]);

  const handleNext = useCallback(async () => {
    if (!currentStep) return;
    tutorialPerf('action', { stepId: currentStep.id, action: 'next' });
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
    if (currentStep.id === 'events-tab') {
      router.replace('/(tabs)/events');
      tutorialPerf('navigation_begin', { stepId: currentStep.id, destination: 'events' });
      advanceOnce(currentStep);
      return;
    }
    if (currentStep.id === 'specials-tab') {
      router.replace('/(tabs)/specials');
      tutorialPerf('navigation_begin', { stepId: currentStep.id, destination: 'specials' });
      advanceOnce(currentStep);
      return;
    }
    if (currentStep.id === 'profile-facebook') {
      router.replace('/profile');
      tutorialPerf('navigation_begin', { stepId: currentStep.id, destination: 'profile' });
      advanceOnce(currentStep);
      return;
    }
    advanceOnce(currentStep);
  }, [advanceOnce, completeTutorial, currentStep, router, targetUnavailable]);

  const handlePrevious = useCallback(() => {
    tutorialPerf('action', { stepId: currentStep?.id ?? 'unknown', action: 'previous' });
    const previous = TUTORIAL_STEPS[Math.max(0, stepIndex - 1)];
    if (['events-tab', 'specials-tab', 'profile-facebook'].includes(previous?.id)) {
      router.replace(MAP_ROUTE);
    }
    previousStep();
  }, [currentStep?.id, previousStep, router, stepIndex]);

  const handleSkip = useCallback(() => {
    stepAbortRef.current?.abort();
    clearHighlightFlags();
    skipTutorial();
  }, [skipTutorial]);

  const handleRestart = useCallback(() => {
    router.replace(MAP_ROUTE);
    restartTutorial();
  }, [restartTutorial, router]);

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
    : spotlight
      ? spotlight.y + spotlight.height / 2 > screenHeight / 2 ? 'top' : 'bottom'
      : currentStep?.sheetPosition ?? 'bottom';

  return (
    <View style={{ flex: 1 }}>
      {children}
      {isActive && currentStep && (
        <Modal
          animationType="none"
          hardwareAccelerated
          navigationBarTranslucent
          onRequestClose={stepIndex > 0 ? handlePrevious : handleSkip}
          presentationStyle="overFullScreen"
          statusBarTranslucent
          transparent
          visible
        >
          <View style={{ flex: 1 }}>
            {currentStep.id === 'welcome' ? (
              <WelcomeScreen
                onStart={handleStart}
                onSkip={handleSkip}
                stepNumber={1}
                totalSteps={TUTORIAL_STEPS.length}
              />
            ) : (
              <TutorialSpotlight spotlight={spotlight}>
                <TutorialBottomSheet
                  stepId={currentStep.id}
                  title={currentStep.title}
                  content={currentStep.content}
                  onNext={openingCluster ? undefined : handleNext}
                  onPrevious={handlePrevious}
                  onSkip={handleSkip}
                  showPrevious={stepIndex > 0}
                  showNext={showNext}
                  showSkip={currentStep.id !== 'completion'}
                  nextText={nextText}
                  position={{ x: screenWidth / 2, y: screenHeight / 2 }}
                  placement={currentStep.placement ?? 'bottom'}
                  sheetPosition={resolvedSheetPosition}
                  stepNumber={stepIndex + 1}
                  totalSteps={TUTORIAL_STEPS.length}
                  targetUnavailable={targetUnavailable}
                />
              </TutorialSpotlight>
            )}
          </View>
        </Modal>
      )}
    </View>
  );
};
