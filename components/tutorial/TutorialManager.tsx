import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, useWindowDimensions, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { TUTORIAL_CONFIG, TUTORIAL_STEPS, getCompletedIdsForStep } from '../../config/tutorialSteps';
import { useTutorial } from '../../hooks/useTutorial';
import { amplitudeTrack } from '../../lib/amplitudeAnalytics';
import { useTutorialUiStore } from '../../store/tutorialUiStore';
import { ComponentMeasurement, TutorialStep } from '../../types/tutorial';
import { isTutorialStepCurrent, registerTutorialAction } from '../../utils/tutorialActions';
import { waitForTutorialMeasurement } from '../../utils/tutorialReadiness';
import {
  getTutorialSpotlightForStep,
  OwnedTutorialSpotlight,
} from '../../utils/tutorialSpotlightOwnership';
import { TutorialBottomSheet } from './TutorialBottomSheet';
import { StaticTutorialScene } from './StaticTutorialScene';
import { TutorialSpotlight } from './TutorialSpotlight';
import { WelcomeScreen } from './WelcomeScreen';

const MAP_ROUTE = '/(tabs)/map' as const;

type LayoutTarget = {
  flag: string;
  layout: string;
  radius: number;
  acceptExisting?: boolean;
};

/**
 * Every guided target below is a normal React Native control measured in its
 * own screen. Mapbox marker and native-callout geometry are deliberately not
 * part of this tour: they cannot provide the same dependable, cross-platform
 * target contract as the rest of the app.
 */
const LAYOUT_TARGETS: Partial<Record<string, LayoutTarget>> = {
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
  'specials-tab': {
    flag: 'tutorialHighlightSpecialsTab',
    layout: 'specialsTabLayout',
    radius: 16,
  },
  'profile-facebook': {
    flag: 'tutorialHighlightProfileFacebook',
    layout: 'profileFacebookLayout',
    radius: 20,
  },
  'facebook-submission': {
    flag: 'tutorialHighlightFacebookSubmission',
    layout: 'facebookSubmissionLayout',
    radius: 18,
    // Profile can publish its stable row measurement before this manager's
    // effect runs through the native-stack modal transition.
    acceptExisting: true,
  },
};

const ALL_HIGHLIGHT_FLAGS = [
  'tutorialHighlightFilterPills',
  'tutorialHighlightEventsTab',
  'tutorialHighlightSpecialsTab',
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
  const updateOwnedSpotlight = useCallback((next?: OwnedTutorialSpotlight) => {
    setOwnedSpotlight(next);
  }, []);
  const [targetUnavailable, setTargetUnavailable] = useState(false);
  const [resumeEpoch, setResumeEpoch] = useState(0);
  const stepAbortRef = useRef<AbortController | null>(null);
  const autoAdvancedStepRef = useRef<string | null>(null);
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

  // Async screen readiness can settle after React has painted a new step. Keep
  // this current during render so a stale callback can never advance it.
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

  // Existing tab/profile screens publish this callback after their navigation
  // transition finishes. It is a fallback to the route observer below, not a
  // blind delay, and is intentionally guarded by the current step id.
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
    stepAbortRef.current?.abort();
    const controller = new AbortController();
    stepAbortRef.current = controller;
    updateOwnedSpotlight(undefined);
    setTargetUnavailable(false);
    clearHighlightFlags();

    if (!isActive || !currentStep || currentStep.id === 'welcome' || currentStep.id === 'completion') {
      return () => controller.abort();
    }

    const target = LAYOUT_TARGETS[currentStep.id];
    if (!target) return () => controller.abort();

    (global as any)[target.flag] = true;
    const measure = async () => {
      if (currentStep.id === 'facebook-submission' && facebookSubmissionLayout) {
        const existing = cleanMeasurement(facebookSubmissionLayout, screenWidth, screenHeight);
        if (existing) {
          (global as any).facebookSubmissionStable = true;
          updateOwnedSpotlight({
            stepId: currentStep.id,
            config: { ...existing, borderRadius: target.radius, showPulse: true },
          });
          return;
        }
      }

      const result = await waitForTutorialMeasurement(target.layout, {
        timeoutMs: TUTORIAL_CONFIG.TARGET_TIMEOUT_MS,
        acceptExisting: target.acceptExisting,
        signal: controller.signal,
        isUsable: (measurement) =>
          cleanMeasurement(measurement, screenWidth, screenHeight) !== null,
      });
      if (controller.signal.aborted || currentStepIdRef.current !== currentStep.id) return;

      const measurement = result.measurement && cleanMeasurement(
        result.measurement,
        screenWidth,
        screenHeight,
      );
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
    };

    void measure().catch(() => {
      if (!controller.signal.aborted && currentStepIdRef.current === currentStep.id) {
        updateOwnedSpotlight(undefined);
        setTargetUnavailable(true);
      }
    });

    return () => {
      controller.abort();
      clearHighlightFlags();
    };
  }, [
    currentStep,
    facebookSubmissionLayout,
    isActive,
    pathname,
    resumeEpoch,
    screenHeight,
    screenWidth,
    updateOwnedSpotlight,
  ]);

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
    // A measurable target may be unavailable during a slow render. Continue
    // keeps the tour recoverable without waiting on network, map, or layout.
    if (currentStep.id === 'events-tab') {
      router.replace('/(tabs)/events');
    } else if (currentStep.id === 'specials-tab') {
      router.replace('/(tabs)/specials');
    } else if (currentStep.id === 'profile-facebook') {
      router.replace('/profile');
    }
    advanceOnce(currentStep);
  }, [advanceOnce, completeTutorial, currentStep, router]);

  const handlePrevious = useCallback(() => {
    const previous = TUTORIAL_STEPS[Math.max(0, stepIndex - 1)];
    if (previous?.id === 'events-tab') {
      router.replace(MAP_ROUTE);
    } else if (previous?.id === 'specials-tab') {
      router.replace('/(tabs)/events');
    } else if (previous?.id === 'profile-facebook') {
      router.replace('/(tabs)/specials');
    } else if (previous?.id === 'facebook-submission') {
      router.replace('/profile');
    }
    previousStep();
  }, [previousStep, router, stepIndex]);

  useEffect(
    () => registerTutorialAction('tutorial-previous', handlePrevious),
    [handlePrevious],
  );

  const handleSkip = useCallback(() => {
    stepAbortRef.current?.abort();
    clearHighlightFlags();
    updateOwnedSpotlight(undefined);
    setTargetUnavailable(false);
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

  const showRequiredFallback = targetUnavailable && [
    'events-tab',
    'specials-tab',
    'profile-facebook',
  ].includes(currentStep?.id ?? '');
  const showNext = Boolean(currentStep) && (
    currentStep?.action !== 'interaction' || showRequiredFallback
  );
  const nextText = currentStep?.id === 'completion' ? 'Start exploring' : 'Continue';
  const resolvedSheetPosition = currentStep?.id === 'completion'
    ? 'center'
    : currentStep?.id === 'facebook-submission'
      ? 'top'
      : spotlight
        ? spotlight.y + spotlight.height / 2 > screenHeight / 2 ? 'top' : 'bottom'
        : currentStep?.sheetPosition ?? 'bottom';

  const renderTutorialSheet = useCallback(() => (
    <TutorialSpotlight spotlight={spotlight}>
      {currentStep?.staticScene && <StaticTutorialScene scene={currentStep.staticScene} />}
      <TutorialBottomSheet
        stepId={currentStep!.id}
        staticScene={Boolean(currentStep!.staticScene)}
        title={currentStep!.title}
        content={currentStep!.content}
        onNext={handleNext}
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
    resolvedSheetPosition,
    screenHeight,
    screenWidth,
    showNext,
    spotlight,
    stepIndex,
    targetUnavailable,
  ]);

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
      {isActive && currentStep && currentStep.id !== 'welcome' && renderTutorialSheet()}
    </View>
  );
};
