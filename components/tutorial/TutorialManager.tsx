/**
 * GathR Tutorial System - Tutorial Manager Component
 * 
 * This is the central coordinator for the entire tutorial system. It orchestrates
 * all tutorial components, manages positioning, handles screen transitions,
 * and provides the global tutorial trigger functionality.
 * 
 * Created: Step 2B2 of tutorial implementation  
 * Dependencies: All tutorial components, hooks, and utilities
 * Used by: Root app layout (_layout.tsx)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Dimensions, Platform } from 'react-native';
import { useTutorial } from '../../hooks/useTutorial';
import { usePathname } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { amplitudeTrack } from '../../lib/amplitudeAnalytics';


import { TutorialOverlay } from './TutorialOverlay';
import { TutorialSpotlight } from './TutorialSpotlight';
import { TutorialTooltip } from './TutorialTooltip';
import { WelcomeScreen } from './WelcomeScreen';
import { TutorialBottomSheet } from './TutorialBottomSheet';
import { SpotlightConfig, ComponentMeasurement} from '../../types/tutorial';
import { findNearestCluster, measureComponent, calculateTooltipPosition, tutorialLog, shouldAutoTriggerTutorial} from '../../utils/tutorialUtils';
import { TUTORIAL_CONFIG } from '../../config/tutorialSteps';

import { TUTORIAL_STEPS, hasSubSteps, getTutorialStepById} from '../../config/tutorialSteps';
import { TutorialStep } from '../../types/tutorial';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface TutorialManagerProps {children: React.ReactNode;}

export const TutorialManager: React.FC<TutorialManagerProps> = ({ children }) => {
  const {
    isActive,
    currentStep,
    currentSubStep,
    tutorialStatus,
    startTutorial,
    nextStep,
    previousStep,
    skipTutorial,
    completeTutorial,
    restartTutorial
  } = useTutorial();

  // Tutorial UI state
  const [spotlightConfig, setSpotlightConfig] = useState<SpotlightConfig | undefined>(undefined);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [showWelcome, setShowWelcome] = useState(false);
const [isPositioning, setIsPositioning] = useState(false);
const pendingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

// -------- Tutorial analytics (step 1: overlay_opened) --------
  const pathname = usePathname();
  const { user } = useAuth();
  const overlayOpenLoggedRef = useRef(false);
  const stepSeenRef = useRef<Set<string>>(new Set()); // per-run guard (no double fires)
  const stepCompletedRef = useRef<Set<string>>(new Set()); // per-run guard for step_completed
  const lastNextClickAtRef = useRef(0); // dedupe double-taps (<350ms)
  const lastPrevClickAtRef = useRef(0); // dedupe double-taps (<350ms)
  const lastDismissClickAtRef = useRef(0); // dedupe double-taps (<350ms)

  // Keep names/version here so later steps reuse the same source of truth
  const TUTORIAL_ANALYTICS = {
    tutorial_id: 'main_onboarding_v1',
    tutorial_version: 1,
    total_steps: TUTORIAL_STEPS.length,
    source: 'tutorial_system' as const,
  };

  // Reset the one-shot guard only when the tutorial fully closes
  useEffect(() => {
    if (!showWelcome && !isActive) {
      overlayOpenLoggedRef.current = false;
    }
  }, [showWelcome, isActive]);

  // Ref to track if we need to show welcome screen
  const shouldShowWelcome = useRef(false);
  const hasTriggeredAutoTutorial = useRef(false);

  /**
   * Global tutorial trigger function
   * This function is exposed globally for easy integration from any screen
   */
  const triggerTutorial = useCallback(() => {
    tutorialLog('Tutorial triggered globally');
      shouldShowWelcome.current = true;
      setShowWelcome(true);

      // Persist run context for subsequent step analytics (no events here)
      (global as any).__tutorialRunUserInitiated = ((global as any).tutorialLaunchUserInitiated === true);
      (global as any).__tutorialRunLaunchSource = (global as any).tutorialLaunchSource || 'unknown';


    // ðŸ”” analytics (one-shot per tutorial run)
    try {
      if (!overlayOpenLoggedRef.current) {
        overlayOpenLoggedRef.current = true;

        // These globals are set by the Profile replay button (see patch below)
        const userInitiated =
          (global as any).tutorialLaunchUserInitiated === true;
        const launchSource =
          (global as any).tutorialLaunchSource || undefined;

        amplitudeTrack('tutorial_overlay_opened', {
          ...TUTORIAL_ANALYTICS,
          from_screen: pathname || '(unknown)',           // screen where overlay appears
          launch_source: launchSource || 'unknown',       // where the user initiated (e.g., 'profile')
          user_initiated: !!userInitiated,
          is_guest: !user,

        });

        // Clear one-shot globals
        (global as any).tutorialLaunchUserInitiated = false;
        delete (global as any).tutorialLaunchSource;
      }
    } catch {}
  }, [pathname, user]);

  /**
   * Auto-trigger tutorial for new users
   * Called after interest selection completion
   */
  const autoTriggerTutorial = useCallback((forceReset: boolean = false) => {
    tutorialLog('autoTriggerTutorial called', { 
      forceReset, 
      hasTriggered: hasTriggeredAutoTutorial.current,
      tutorialStatus: tutorialStatus
    });

    // Allow force reset for debugging
    if (forceReset) {
      tutorialLog('Force resetting auto-trigger flag');
      hasTriggeredAutoTutorial.current = false;
    }

    // More robust check - only trigger if we have a valid tutorial status
    if (!tutorialStatus) {
      tutorialLog('No tutorial status available, skipping auto-trigger');
      return;
    }

    if (hasTriggeredAutoTutorial.current) {
      tutorialLog('Auto-trigger already called, skipping');
      return;
    }

    if (shouldAutoTriggerTutorial(tutorialStatus)) {
      tutorialLog('Auto-triggering tutorial for new user');
      hasTriggeredAutoTutorial.current = true;
      
      // Small delay to let the map screen settle
      setTimeout(() => {
        triggerTutorial();
      }, TUTORIAL_CONFIG.AUTO_TRIGGER_DELAY);
    } else {
      tutorialLog('Tutorial already completed, not auto-triggering', tutorialStatus);
    }
  }, [tutorialStatus, triggerTutorial]);

  /**
   * Manual trigger for interest selection - always works regardless of flags
   */
  const manualTriggerTutorial = useCallback(() => {
    tutorialLog('Manual tutorial trigger - resetting flags and triggering');
    hasTriggeredAutoTutorial.current = false; // Reset flag
    autoTriggerTutorial(true); // Force trigger with reset
  }, [autoTriggerTutorial]);

  

  /**
   * Handle welcome screen actions
   */
  const handleWelcomeStart = useCallback(async () => {
    tutorialLog('Welcome screen: starting tutorial');
    setShowWelcome(false);
    
    // First, center map on user's current location to ensure consistent starting point
    tutorialLog('Centering map on user location before starting tutorial');
    
    const mapStore = (global as any).mapStore;
    const cameraRef = (global as any).mapCameraRef;
    
    if (mapStore && cameraRef?.current) {
      // Try to get user location or fallback to PEI center
      const userLocation = mapStore.userLocation || { latitude: 46.2336, longitude: -63.1276 };
      
      tutorialLog('Setting tutorial baseline location:', userLocation);
      
      // Set consistent starting position and zoom for tutorial
      cameraRef.current.setCamera({
        centerCoordinate: [userLocation.longitude, userLocation.latitude],
        zoomLevel: 12, // Standard starting zoom for tutorial
        animationDuration: 800,
      });
      
      // Wait for camera to settle before starting tutorial steps
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    startTutorial();
  }, [startTutorial]);

const handleWelcomeSkip = useCallback(() => {
  tutorialLog('Welcome screen: skipping tutorial');

  // ðŸ”” analytics: tutorial_dismissed (welcome sheet)
  try {
    const now = Date.now();
    if (now - lastDismissClickAtRef.current >= 350) {
      lastDismissClickAtRef.current = now;

      const runInitiated = (global as any).__tutorialRunUserInitiated === true;
      const launchSource = (global as any).__tutorialRunLaunchSource || 'unknown';
      const dwellStart = (global as any).__tutorialStepDwellStartTs;
      const dwell = typeof dwellStart === 'number' ? Math.max(0, now - dwellStart) : 0;

      amplitudeTrack('tutorial_dismissed', {
        tutorial_id: 'main_onboarding_v1',
        tutorial_version: 1,
        total_steps: TUTORIAL_STEPS.length,
        source: 'tutorial_system',
        from_screen: pathname || '(unknown)',

        // No active step yet on welcome; omit step fields
        dwell_ms_on_step: dwell,

        user_initiated: runInitiated,
        launch_source: launchSource,
        is_guest: !user,
      });
    }
  } catch (e) {
    console.log('[analytics] tutorial_dismissed (welcome) failed:', e);
  }

  setShowWelcome(false);
  skipTutorial();
}, [skipTutorial, pathname, user]);


  /**
   * Update spotlight and tooltip position based on current step
   * This is the core positioning logic that runs for each tutorial step
   */
const updateTutorialPosition = useCallback(async () => {
  // Clear any pending spotlight setup from previous step
  if (pendingTimeoutRef.current) {
    clearTimeout(pendingTimeoutRef.current);
    pendingTimeoutRef.current = null;
    tutorialLog('🧹 Cleared pending spotlight timeout from previous step');
  }
  
  if (!isActive || !currentStep) {
    setSpotlightConfig(undefined);
    return;
  }

  // Clear any existing spotlight immediately when changing steps
  setSpotlightConfig(undefined);
  
  setIsPositioning(true);
  tutorialLog(`Positioning tutorial for step: ${currentStep.id}, substep: ${currentSubStep}`);

    const defaultPosition = { x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 };

    const step = currentStep.multiStep && currentStep.subSteps && currentSubStep >= 0
      ? currentStep.subSteps[currentSubStep]
      : currentStep;

// --- CLEANUP ALL FLAGS AT THE START OF THE FUNCTION ---
console.log('🧹 TUTORIAL CLEANUP: Resetting all highlight flags');
(global as any).tutorialHighlightFilterPills = false;
(global as any).tutorialHighlightEventDetails = false;
(global as any).tutorialHighlightVenueSelector = false;
(global as any).tutorialHighlightEventTabs = false;
(global as any).tutorialHighlightEventsTab = false;
(global as any).tutorialHighlightEventsListExplanation = false;
(global as any).tutorialHighlightEventsFilters = false;
(global as any).tutorialHighlightSpecialsTab = false;
(global as any).tutorialHighlightSpecialsListExplanation = false;
(global as any).tutorialHighlightSpecialsFilters = false;
(global as any).tutorialHighlightProfileFacebook = false;
// Don't clear facebook submission flag if we're positioning that step
if (currentStep?.id !== 'facebook-submission') {
  (global as any).tutorialHighlightFacebookSubmission = false;
}
    
    // Also clean stability flags when changing steps
    if (currentStep?.id !== 'facebook-submission') {
      console.log('ðŸ§¹ TUTORIAL CLEANUP: Not on facebook-submission, clearing stability flags');
      (global as any).facebookSubmissionStable = false;
      (global as any).facebookSubmissionLayout = null;
    }

    const createWaitForLayoutFunction = (flagName: string, layoutName: string, configCallback: (layout: ComponentMeasurement) => SpotlightConfig, tooltipCallback: (layout: ComponentMeasurement) => { x: number, y: number }, stepId?: string) => {
      (global as any)[flagName] = true;
      setSpotlightConfig(undefined);

      // Determine delay based on step - tabs need more time to stabilize
      // Determine delay based on step type
      const baseDelay = stepId === 'callout-tabs' ? 800 : 
                       stepId?.includes('callout') ? 400 : 
                       stepId === 'filter-pills' ? 280 : 
                       stepId === 'events-list-explanation' ? 3200 : // Wait for banner lifecycle: 1500ms visible + 800ms fade + 500ms settle
                       stepId === 'events-filters' ? 250 : // Similar to filter-pills timing
                       stepId === 'specials-tab' ? 50 : // Simple tab button like events-tab
                       stepId === 'specials-list-explanation' ? 3500 : // Same banner timing as events
                       stepId === 'specials-filters' ? 350 : // Same as filter-pills timing
                       stepId === 'profile-facebook' ? 50 : // Simple header button like tabs
                       stepId === 'facebook-submission' ? 1900 : // Wait for modal to settle
                       50;
      
tutorialLog(`Setting up ${stepId} with ${baseDelay}ms delay`);

const timeoutId = setTimeout(() => {
  const pollForLayout = (retries = 25, currentDelay = 100) => {
          if (retries <= 0) {
            tutorialLog(`TUTORIAL ERROR: Could not get layout for ${layoutName} after all retries.`);
            setIsPositioning(false);
            return;
          }

          // Check if callout is stable (for callout steps only)
          const isCalloutStep = stepId?.includes('callout');
          let calloutStable = true;
          
          if (isCalloutStep) {
            const mapStore = (global as any).mapStore;
            // Verify callout is open and stable
            calloutStable = mapStore?.selectedVenues?.length > 0;
            
            if (!calloutStable && retries > 15) {
              tutorialLog(`Callout not stable yet for ${stepId}, waiting...`);
              setTimeout(() => pollForLayout(retries - 1, currentDelay), currentDelay);
              return;
            }
          }

          // For non-callout steps (like filter-pills), skip complex validation
          if (!isCalloutStep) {
            const layout = (global as any)[layoutName];
            if (layout && layout.width > 0 && layout.height > 0) {
            // Normal successful measurement
            // Include the derived stable flag in the payload so it actually shows in logs
            // Example: "eventsFiltersLayout" â†’ stableKey "eventsFiltersStable"
            const _baseName = layoutName.split(' ')[0]; // strip " (non-callout)" etc.
            const _stableKey = _baseName.endsWith('Layout')
              ? `${_baseName.slice(0, -'Layout'.length)}Stable`
              : `${_baseName}Stable`;
            const _stableFlag = (global as any)?.[_stableKey];

            tutorialLog(
              `Layout found for ${layoutName}, drawing spotlight.`,
              { ...layout, _stableKey, _stableFlag }
            );
            setSpotlightConfig(configCallback(layout));
            setTooltipPosition(tooltipCallback(layout));
            setIsPositioning(false);

              return;
            }
            // Simple retry for non-callout steps
            setTimeout(() => pollForLayout(retries - 1, 100), 100);
            return;
          }

          const layout = (global as any)[layoutName];
          if (layout && calloutStable) {
            // Extra validation for consistent measurements
            const isLayoutValid = layout.width > 0 && layout.height > 0 && 
                                layout.x >= 0 && layout.y >= 0;
            
            if (!isLayoutValid) {
              tutorialLog(`Invalid layout for ${layoutName}, retrying...`, layout);
              setTimeout(() => pollForLayout(retries - 1, currentDelay), currentDelay);
              return;
            }

            // For tabs, do a stability check by comparing measurements
            if (stepId === 'callout-tabs' && retries > 20) {
              // Take two measurements 200ms apart to ensure stability
              setTimeout(() => {
                const layout2 = (global as any)[layoutName];
                if (layout2 && Math.abs(layout.y - layout2.y) < 5) {
                  // Stable! Use the measurement
                  tutorialLog(`Stable layout found for ${layoutName} after verification.`, layout2);
                  setSpotlightConfig(configCallback(layout2));
                  setTooltipPosition(tooltipCallback(layout2));
                  setIsPositioning(false);
                } else {
                  // Still moving, wait more
                  tutorialLog(`Layout still shifting for ${layoutName}, waiting more...`);
                  setTimeout(() => pollForLayout(retries - 2, currentDelay), currentDelay);
                }
              }, 200);
              return;
            }

            // Normal successful measurement
            // Enriched one-shot log: include the derived stable flag used by pollers (â€¦Stable)
            // Example: "eventsFiltersLayout" â†’ stableKey "eventsFiltersStable"
            const _baseName = layoutName.split(' ')[0]; // strip " (non-callout)" etc.
            const _stableKey = _baseName.endsWith('Layout')
              ? `${_baseName.slice(0, -'Layout'.length)}Stable`
              : `${_baseName}Stable`;
            const _stableFlag = (global as any)?.[_stableKey];

            tutorialLog(
              `Layout found for ${layoutName}, drawing spotlight. (stableKey=${_stableKey}, stable=${String(_stableFlag)})`,
              layout
            );
            setSpotlightConfig(configCallback(layout));
            setTooltipPosition(tooltipCallback(layout));
            setIsPositioning(false);
          } else {
            // Increase delay progressively for stubborn components
            const nextDelay = retries < 10 ? Math.min(currentDelay * 1.2, 300) : currentDelay;
            setTimeout(() => pollForLayout(retries - 1, nextDelay), nextDelay);
          }
    };
    pollForLayout();
  }, baseDelay);
  
  // Store timeout ID so it can be cleared if step changes
  pendingTimeoutRef.current = timeoutId;
};

     if (step.id === 'filter-pills') {
      createWaitForLayoutFunction(
        'tutorialHighlightFilterPills',
        'filterPillsLayout',
        (layout) => ({ ...layout, borderRadius: (layout.height / 2) - 1, showPulse: false }),
        (layout) => ({ x: SCREEN_WIDTH / 2, y: layout.y + layout.height + 20 }),
        'filter-pills'
      );
      return;
    }
    if (step.id === 'callout-event-details') {
      createWaitForLayoutFunction(
        'tutorialHighlightEventDetails',
        'eventDetailsLayout',
        (layout) => ({ ...layout, borderRadius: 16, showPulse: false }),
        (layout) => ({ x: SCREEN_WIDTH / 2, y: layout.y - 70 }),
        'callout-event-details'
      );
      return;
    }
    if (step.id === 'callout-venue-selector') {
      createWaitForLayoutFunction(
        'tutorialHighlightVenueSelector',
        'venueSelectorLayout',
        (layout) => ({ ...layout, borderRadius: 8, showPulse: false }),
        (layout) => ({ x: SCREEN_WIDTH / 2, y: layout.y + layout.height + 20 }),
        'callout-venue-selector'
      );
      return;
    }
    if (step.id === 'callout-tabs') {
      createWaitForLayoutFunction(
        'tutorialHighlightEventTabs',
        'eventTabsLayout',
        (layout) => ({ ...layout, borderRadius: 8, showPulse: false }),
        (layout) => ({ x: SCREEN_WIDTH / 2, y: layout.y + layout.height + 20 }),
        'callout-tabs'
      );
      return;
    }
    if (step.id === 'events-tab') {
      createWaitForLayoutFunction(
        'tutorialHighlightEventsTab',
        'eventsTabLayout',
        (layout) => ({ ...layout, borderRadius: 12, showPulse: false }),
        (layout) => ({ x: SCREEN_WIDTH / 2, y: layout.y - 90 }),
        'events-tab'
      );
      return;
    }
    
    if (step.id === 'events-list-explanation') {
      createWaitForLayoutFunction(
        'tutorialHighlightEventsListExplanation',
        'eventsListExplanationLayout',
        (layout) => ({ ...layout, borderRadius: 16, showPulse: false }),
        (layout) => ({ x: SCREEN_WIDTH / 2, y: layout.y - 120 }),
        'events-list-explanation'
      );
      return;
    }

    if (step.id === 'events-filters') {
      createWaitForLayoutFunction(
        'tutorialHighlightEventsFilters',
        'eventsFiltersLayout',
        (layout) => ({ ...layout, borderRadius: 12, showPulse: false }),
        (layout) => ({ x: SCREEN_WIDTH / 2, y: layout.y + layout.height + 20 }),
        'events-filters'
      );
      return;
    }

    if (step.id === 'specials-tab') {
      createWaitForLayoutFunction(
        'tutorialHighlightSpecialsTab',
        'specialsTabLayout',
        (layout) => ({ ...layout, borderRadius: 12, showPulse: false }),
        (layout) => ({ x: SCREEN_WIDTH / 2, y: layout.y - 90 }),
        'specials-tab'
      );
      return;
    }

    if (step.id === 'specials-list-explanation') {
      createWaitForLayoutFunction(
        'tutorialHighlightSpecialsListExplanation',
        'specialsListExplanationLayout',
        (layout) => ({ ...layout, borderRadius: 16, showPulse: false }),
        (layout) => ({ x: SCREEN_WIDTH / 2, y: layout.y - 120 }),
        'specials-list-explanation'
      );
      return;
    }

    if (step.id === 'specials-filters') {
      createWaitForLayoutFunction(
        'tutorialHighlightSpecialsFilters',
        'specialsFiltersLayout',
        (layout) => ({ ...layout, borderRadius: 12, showPulse: false }),
        (layout) => ({ x: SCREEN_WIDTH / 2, y: layout.y + layout.height + 20 }),
        'specials-filters'
      );
      return;
    }

    if (step.id === 'profile-facebook') {
      createWaitForLayoutFunction(
        'tutorialHighlightProfileFacebook',
        'profileFacebookLayout',
        (layout) => ({ 
          x: layout.x - 6, 
          y: layout.y - 6, 
          width: layout.width + 12, 
          height: layout.height + 12, 
          borderRadius: (Math.max(layout.width, layout.height) + 12) / 2, 
          showPulse: false 
        }),
        (layout) => ({ x: SCREEN_WIDTH / 2, y: layout.y + layout.height + 20 }),
        'profile-facebook'
      );
      return;
    }

    if (step.id === 'facebook-submission') {
      console.log('ðŸ“ FACEBOOK SUBMISSION: Setting flag for Profile.tsx to handle measurement');
      
      // CRITICAL: Clear any stale measurements before Profile.tsx measures
      console.log('ðŸ§¹ FACEBOOK SUBMISSION: Clearing any stale measurements');
      (global as any).facebookSubmissionLayout = null;
      (global as any).facebookSubmissionStable = false;
      
      // For facebook-submission, we ONLY set the flag
      // Profile.tsx handles ALL measurement and padding
      // DO NOT measure here - it would overwrite the padded measurements
      (global as any).tutorialHighlightFacebookSubmission = true;
      
      // No spotlight for main overlay - modal handles everything
      setSpotlightConfig(undefined);
      setTooltipPosition({ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 });
      setIsPositioning(false);
      
      console.log('ðŸ“ FACEBOOK SUBMISSION: Flag set, measurement delegated to Profile.tsx');
      return;
    }

    // --- HANDLE ALL OTHER SYNCHRONOUS STEPS BELOW ---
    
    try {
      let targetMeasurement: ComponentMeasurement | null = null;
      switch (step.id) {
        case 'welcome':
        case 'completion':
        case 'clear-filters':
          break;

          case 'cluster-click':
            tutorialLog('Finding cluster and repositioning map for tutorial');

            // Set the ignore flag FIRST, before any delays or state changes
            const cameraRef = (global as any).mapCameraRef;
            if (cameraRef) {
              (global as any).ignoreProgrammaticCameraRef = true;
              tutorialLog('Setting ignoreProgrammaticCameraRef = true BEFORE tutorial positioning');
            }

            await new Promise(resolve => setTimeout(resolve, 500));
            const mapStore = (global as any).mapStore;
            if (mapStore?.clusters?.length > 0) {
              if (cameraRef?.current) {
                 const targetCluster = mapStore.clusters.find((c: any) => c.eventCount > 0) || mapStore.clusters[0];
                 if (targetCluster && targetCluster.venues && targetCluster.venues[0]) {
                 const coordinates = [targetCluster.venues[0].longitude, targetCluster.venues[0].latitude];
                 
                 // --- ADJUSTMENT AREA ---
                 // This value controls the vertical shift of the target on screen.
                 // Larger value => map centers a bit lower => target appears HIGHER on screen.
                 // Keep iOS as-is; give Android a slightly larger nudge so the cluster
                 // sits inside the spotlight despite OS/status-bar/gesture-bar deltas.
                 /*
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  TUTORIAL: CAMERA NUDGE TO ALIGN CLUSTER IN SPOTLIGHT
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  Why:
    â€¢ iOS vs Android status/gesture bars shift perceived vertical placement.
    â€¢ We nudge the map center differently so the cluster sits inside the spotlight.

  How:
    â€¢ mapVisibleHeight is the visible latitude span (empirically ~0.022 at this zoom).
    â€¢ spotlightOffsetPercent is platform-specific:

    â€¢ latitudeOffset = spotlightOffsetPercent * mapVisibleHeight
      and camera centers to [lng, lat - latitudeOffset].

  Adjusting:
    â€¢ If cluster sits too low in the hole â†’ increase Android % slightly.
    â€¢ If cluster sits too high â†’ decrease it slightly.
*/
                  const mapVisibleHeight = 0.022;

                   const spotlightOffsetPercent =
                     Platform.OS === 'android'
                       ? 0.180 // try a slightly larger nudge on Android
                       : 0.220; // current iOS value
                   const latitudeOffset = spotlightOffsetPercent * mapVisibleHeight;
                 tutorialLog('cluster-click camera offset', {
                   platform: Platform.OS,
                   spotlightOffsetPercent,
                   mapVisibleHeight,
                   latitudeOffset
                 });
                    // Prevent cluster regeneration during tutorial camera zoom
                    const mapCameraRef = (global as any).mapCameraRef;
                    if (mapCameraRef === cameraRef) {
                      (global as any).ignoreProgrammaticCameraRef = true;
                      tutorialLog('Setting ignoreProgrammaticCameraRef = true for tutorial zoom');
                    }
                    cameraRef.current.setCamera({
                      centerCoordinate: [coordinates[0], coordinates[1] - latitudeOffset],
                      zoomLevel: 14.4, // TEMP: mid-band test to avoid cluster split on settle. This worked so dont change it. 
                      animationDuration: 1000,
                    });
                 }
              }
            }
            // Positive moves hole DOWN; negative moves hole UP
              // Wait for map idle event before drawing spotlight
   
const spotlightYAdjust = -12; // try -12px up; flip sign if you want to lower instead
targetMeasurement = {
  x: SCREEN_WIDTH / 2 - 40,
  y: SCREEN_HEIGHT * 0.25 - 35 + spotlightYAdjust,
  width: 80,
  height: 80
};

tutorialLog('cluster-click targetMeasurement adjusted', { spotlightYAdjust, targetMeasurement });
          break;
        default:
          tutorialLog(`No specific measurement for step: ${step.id}.`);
          break;
      }

/*
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  TUTORIAL: SPOTLIGHT SHAPE CONTRACT
  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  Why:
    â€¢ We want rectangular spotlights that match the measured component everywhere,
      except the cluster step which uses a circular spotlight with a pulsing ring.

  How:
    â€¢ For 'cluster-click' we set a large borderRadius (40 for an 80Ã—80 target) and
      forceCircle=true to render a perfect circle.
    â€¢ For all other steps, we preserve the stepâ€™s own radius (nonClusterRadius).

  Touch/visual notes:
    â€¢ The shape decision (rect vs circle) is visual. Tap-through is handled inside
      TutorialSpotlight (Android uses a no-mask overlay + transparent interceptors).
*/

      if (targetMeasurement) {
        setSpotlightConfig({
          ...targetMeasurement,
          borderRadius: step.id === 'cluster-click' ? 40 : 16,
          showPulse: true,
        });
        // Android-only override for the cluster step: pin tooltip below the spotlight
const effectivePlacement =
  (Platform.OS === 'android' && step.id === 'cluster-click')
    ? 'bottom'
    : (step.placement || 'bottom');

const computedPos = calculateTooltipPosition(targetMeasurement, effectivePlacement);

// Ensure a little breathing room when pinned below the spotlight on Android
const finalPos = (Platform.OS === 'android' && step.id === 'cluster-click' && effectivePlacement === 'bottom')
  ? { ...computedPos, y: computedPos.y + 16 } // tweak if you need more space
  : computedPos;

tutorialLog(
  `TOOLTIP POS â†’ step=${step.id}, platform=${Platform.OS}, placement=${effectivePlacement}, ` +
  `targetRect=${JSON.stringify(targetMeasurement)}, finalPos=${JSON.stringify(finalPos)}`
);

setTooltipPosition(finalPos);

// NOTE: For Android + cluster-click, the unified sheet is forced to bottom in render.
// This log helps confirm that behavior while still reporting the computed tooltipPosition.
if (Platform.OS === 'android' && step.id === 'cluster-click') {
  tutorialLog('Android cluster-click â†’ forcing sheetPosition=bottom in render');
}

      } else {
        setSpotlightConfig(undefined);
        setTooltipPosition(defaultPosition);
      }


    } catch (error) {
      console.error('Error positioning tutorial:', error);
      setSpotlightConfig(undefined);
      setTooltipPosition(defaultPosition);
    } finally {
      setIsPositioning(false);
    }
  }, [isActive, currentStep, currentSubStep]);
/**
 * Update positioning when step changes
 */
useEffect(() => {
  updateTutorialPosition();
}, [updateTutorialPosition]);

/**
 * Clear spotlight when tutorial becomes inactive
 */
useEffect(() => {
  if (!isActive) {
    console.log('🧹 Tutorial inactive - clearing spotlight config');
    setSpotlightConfig(undefined);
    setTooltipPosition({ x: 0, y: 0 });
  }
}, [isActive]);

/**
 * Analytics: fire tutorial_step_shown once per step appearance
 * - Guarded so each step logs only once per tutorial run
 * - Starts dwell timer for later (no additional events here)
 */
useEffect(() => {
  if (!isActive || showWelcome || !currentStep?.id) return;

  const key = currentStep.id;
  if (stepSeenRef.current.has(key)) return; // already logged this step this run

  // Mark seen early to avoid re-renders double-firing
  stepSeenRef.current.add(key);

  try {
    const stepIndex = TUTORIAL_STEPS.findIndex(s => s.id === key);

    // Dwell start for this step (used later by next/prev/dismiss/complete)
    (global as any).__tutorialStepDwellStartTs = Date.now();

    const runInitiated = (global as any).__tutorialRunUserInitiated === true;
    const launchSource = (global as any).__tutorialRunLaunchSource || 'unknown';

    amplitudeTrack('tutorial_step_shown', {
      tutorial_id: 'main_onboarding_v1',
      tutorial_version: 1,
      total_steps: TUTORIAL_STEPS.length,
      source: 'tutorial_system',
      from_screen: pathname || '(unknown)',

      // step details
      step_index: stepIndex,
      step_key: key,

      // run context
      user_initiated: runInitiated,
      launch_source: launchSource,
      is_guest: !user,
    });
  } catch (e) {
    console.log('[analytics] tutorial_step_shown failed:', e);
  }
}, [isActive, showWelcome, currentStep?.id, pathname, user]);

/**
 * Reset per-run guards once tutorial is fully closed
 */
useEffect(() => {
  if (!isActive && !showWelcome) {
    stepSeenRef.current.clear();
    stepCompletedRef.current.clear();
    (global as any).__tutorialStepDwellStartTs = undefined;
  }
}, [isActive, showWelcome]);


  /**
   * Auto-advance when cluster is clicked and callout opens
   */
  useEffect(() => {
    if (isActive && currentStep?.id === 'cluster-click') {
      // Poll for callout opening
      const interval = setInterval(() => {
        const mapStore = (global as any).mapStore;
        if (mapStore?.selectedVenues?.length > 0) {
tutorialLog('Cluster clicked - callout opened, auto-advancing tutorial');
clearInterval(interval);
setTimeout(() => {
  // ðŸ”” analytics: tutorial_step_completed (cluster-click)
  try {
    const now = Date.now();
    const stepKey = currentStep?.id || 'cluster-click'; // step we just completed
    const stepIndex = TUTORIAL_STEPS.findIndex(s => s.id === stepKey);
    const dwellStart = (global as any).__tutorialStepDwellStartTs;
    const dwell = typeof dwellStart === 'number' ? Math.max(0, now - dwellStart) : 0;

    const runInitiated = (global as any).__tutorialRunUserInitiated === true;
    const launchSource = (global as any).__tutorialRunLaunchSource || 'unknown';

    amplitudeTrack('tutorial_step_completed', {
      tutorial_id: 'main_onboarding_v1',
      tutorial_version: 1,
      total_steps: TUTORIAL_STEPS.length,
      source: 'tutorial_system',
      from_screen: (typeof pathname !== 'undefined' && pathname) || (global as any).currentRouteName || '(unknown)',

      step_index: stepIndex,
      step_key: stepKey,
      dwell_ms_on_step: dwell,

      user_initiated: runInitiated,
      launch_source: launchSource,
      is_guest: !user,
    });
  } catch (e) {
    console.log('[analytics] tutorial_step_completed (cluster-click) failed:', e);
  }

  nextStep();
}, 100);

        }
      }, 200);
      
      return () => clearInterval(interval);
    }
  }, [isActive, currentStep, nextStep]);

  /**
   * Auto-advance when events tab is clicked and user navigates to events screen
   */
  useEffect(() => {
    console.log('ðŸ” EVENTS DETECTION EFFECT:', {
      isActive,
      currentStepId: currentStep?.id,
      isEventsTab: currentStep?.id === 'events-tab'
    });
    
    if (isActive && currentStep?.id === 'events-tab') {
      tutorialLog('Setting up events screen detection via global flag');
      
      // Set up detection flag that the events screen can set
(global as any).onEventsScreenNavigated = () => {
  tutorialLog('Events screen navigation detected - auto-advancing tutorial');

  // ðŸ”” analytics: tutorial_click_events_tab (log the tap itself)
  try {
    const now = Date.now();
    const lastClick = (global as any).__tutorialEventsTabClickAt || 0;
    if (now - lastClick > 300) {
      (global as any).__tutorialEventsTabClickAt = now;

      const dwellStart = (global as any).__tutorialStepDwellStartTs;
      const dwell = typeof dwellStart === 'number' ? Math.max(0, now - dwellStart) : 0;

      amplitudeTrack('tutorial_click_events_tab', {
        tutorial_id: 'main_onboarding_v1',
        tutorial_version: 1,
        total_steps: TUTORIAL_STEPS.length,
        source: 'tutorial_system',
        from_screen: '/events', // navigation just occurred
        step_index: TUTORIAL_STEPS.findIndex(s => s.id === 'events-tab'),
        step_key: 'events-tab',
        dwell_ms_on_step: dwell,
        user_initiated: ((global as any).__tutorialRunUserInitiated === true),
        launch_source: (global as any).__tutorialRunLaunchSource || 'unknown',
        is_guest: !user,
      });
    }
  } catch (e) {
    console.log('[analytics] tutorial_click_events_tab failed:', e);
  }

  // ðŸŽ¯ analytics: tutorial_step_completed for 'events-tab' (bottom app tab)
  try {
    const now = Date.now();

    // tiny dedupe in case focus fires twice in quick succession
    const last = (global as any).__tutorialEventsTabCompletedAt || 0;
    if (now - last > 300) {
      (global as any).__tutorialEventsTabCompletedAt = now;

      const dwellStart = (global as any).__tutorialStepDwellStartTs;
      const dwell = typeof dwellStart === 'number' ? Math.max(0, now - dwellStart) : 0;

      amplitudeTrack('tutorial_step_completed', {
        tutorial_id: 'main_onboarding_v1',
        tutorial_version: 1,
        total_steps: TUTORIAL_STEPS.length,
        source: 'tutorial_system',

        // We are now on the Events screen (tab navigation)
        from_screen: '/events',

        step_index: TUTORIAL_STEPS.findIndex(s => s.id === 'events-tab'),
        step_key: 'events-tab',
        dwell_ms_on_step: dwell,

        user_initiated: ((global as any).__tutorialRunUserInitiated === true),
        launch_source: (global as any).__tutorialRunLaunchSource || 'unknown',
        is_guest: !user,
      });
    }
  } catch (e) {
    console.log('[analytics] tutorial_step_completed (events-tab) failed:', e);
  }

  setTimeout(() => {
    nextStep();
  }, 500);
};

      
      return () => {
        console.log('ðŸ” EVENTS DETECTION CLEANUP: Removing onEventsScreenNavigated');
        delete (global as any).onEventsScreenNavigated;
      };
    } else {
      console.log('ðŸ” EVENTS DETECTION: Not setting up (conditions not met)');
      // Clean up if conditions not met
      delete (global as any).onEventsScreenNavigated;
    }
  }, [isActive, currentStep, nextStep]);

  useEffect(() => {
    if (isActive && currentStep?.id === 'specials-tab') {
      tutorialLog('Setting up specials screen detection via global flag');
      
      // Set up detection flag that the specials screen can set
(global as any).onSpecialsScreenNavigated = () => {
  tutorialLog('Specials screen navigation detected - auto-advancing tutorial');

  // ðŸ”” analytics: tutorial_click_specials_tab (log the tap/navigation itself)
  try {
    const now = Date.now();
    const lastClick = (global as any).__tutorialSpecialsTabClickAt || 0;
    if (now - lastClick > 300) {
      (global as any).__tutorialSpecialsTabClickAt = now;

      const dwellStart = (global as any).__tutorialStepDwellStartTs;
      const dwell = typeof dwellStart === 'number' ? Math.max(0, now - dwellStart) : 0;

      amplitudeTrack('tutorial_click_specials_tab', {
        tutorial_id: 'main_onboarding_v1',
        tutorial_version: 1,
        total_steps: TUTORIAL_STEPS.length,
        source: 'tutorial_system',
        from_screen: '/specials', // navigation just occurred

        step_index: TUTORIAL_STEPS.findIndex(s => s.id === 'specials-tab'),
        step_key: 'specials-tab',
        dwell_ms_on_step: dwell,

        user_initiated: ((global as any).__tutorialRunUserInitiated === true),
        launch_source: (global as any).__tutorialRunLaunchSource || 'unknown',
        is_guest: !user,
      });
    }
  } catch (e) {
    console.log('[analytics] tutorial_click_specials_tab failed:', e);
  }

  // ðŸŽ¯ analytics: tutorial_step_completed for 'specials-tab' (bottom app tab)
  try {
    const now = Date.now();
    const last = (global as any).__tutorialSpecialsTabCompletedAt || 0;
    if (now - last > 300) {
      (global as any).__tutorialSpecialsTabCompletedAt = now;

      const dwellStart = (global as any).__tutorialStepDwellStartTs;
      const dwell = typeof dwellStart === 'number' ? Math.max(0, now - dwellStart) : 0;

      amplitudeTrack('tutorial_step_completed', {
        tutorial_id: 'main_onboarding_v1',
        tutorial_version: 1,
        total_steps: TUTORIAL_STEPS.length,
        source: 'tutorial_system',
        from_screen: '/specials',

        step_index: TUTORIAL_STEPS.findIndex(s => s.id === 'specials-tab'),
        step_key: 'specials-tab',
        dwell_ms_on_step: dwell,

        user_initiated: ((global as any).__tutorialRunUserInitiated === true),
        launch_source: (global as any).__tutorialRunLaunchSource || 'unknown',
        is_guest: !user,
      });
    }
  } catch (e) {
    console.log('[analytics] tutorial_step_completed (specials-tab) failed:', e);
  }

  setTimeout(() => {
    nextStep();
  }, 500);
};



      
      return () => {
        delete (global as any).onSpecialsScreenNavigated;
      };
    }
  }, [isActive, currentStep, nextStep]);

  /**
   * Auto-advance when profile/settings is clicked and user navigates to profile screen
   */
  useEffect(() => {
    // Keep callback active for both profile-facebook AND facebook-submission steps
    // This prevents the modal from being affected when the step advances
    if (isActive && (currentStep?.id === 'profile-facebook' || currentStep?.id === 'facebook-submission')) {
      tutorialLog('Setting up profile screen detection via global flag');
      
      // Set up detection flag that the profile screen can set
(global as any).onProfileScreenNavigated = () => {
  tutorialLog('Profile screen navigation detected - checking if should advance');

  // GUARD: Only process this callback if we're CURRENTLY on profile-facebook step
  // Once we've advanced to facebook-submission, ignore subsequent navigation events
  const currentStepNow = currentStep?.id;
  if (currentStepNow !== 'profile-facebook') {
    tutorialLog('Already advanced past profile-facebook, ignoring navigation callback');
    return;
  }

  tutorialLog('On profile-facebook step - auto-advancing tutorial');

  // 📊 analytics: tutorial_click_profile_tab
  try {
    const now = Date.now();
    const lastClick = (global as any).__tutorialProfileTabClickAt || 0;
    if (now - lastClick > 300) {
      (global as any).__tutorialProfileTabClickAt = now;

      const dwellStart = (global as any).__tutorialStepDwellStartTs;
      const dwell = typeof dwellStart === 'number' ? Math.max(0, now - dwellStart) : 0;

      amplitudeTrack('tutorial_click_profile_tab', {
        tutorial_id: 'main_onboarding_v1',
        tutorial_version: 1,
        total_steps: TUTORIAL_STEPS.length,
        source: 'tutorial_system',
        from_screen: '/profile',

        step_index: TUTORIAL_STEPS.findIndex(s => s.id === 'profile-facebook'),
        step_key: 'profile-facebook',
        dwell_ms_on_step: dwell,

        user_initiated: ((global as any).__tutorialRunUserInitiated === true),
        launch_source: (global as any).__tutorialRunLaunchSource || 'unknown',
        is_guest: !user,
      });
    }
  } catch (e) {
    console.log('[analytics] tutorial_click_profile_tab failed:', e);
  }

  // 🎯 analytics: tutorial_step_completed for 'profile-facebook'
  try {
    const now = Date.now();
    const last = (global as any).__tutorialProfileTabCompletedAt || 0;
    if (now - last > 300) {
      (global as any).__tutorialProfileTabCompletedAt = now;

      const dwellStart = (global as any).__tutorialStepDwellStartTs;
      const dwell = typeof dwellStart === 'number' ? Math.max(0, now - dwellStart) : 0;

      amplitudeTrack('tutorial_step_completed', {
        tutorial_id: 'main_onboarding_v1',
        tutorial_version: 1,
        total_steps: TUTORIAL_STEPS.length,
        source: 'tutorial_system',
        from_screen: '/profile',

        step_index: TUTORIAL_STEPS.findIndex(s => s.id === 'profile-facebook'),
        step_key: 'profile-facebook',
        dwell_ms_on_step: dwell,

        user_initiated: ((global as any).__tutorialRunUserInitiated === true),
        launch_source: (global as any).__tutorialRunLaunchSource || 'unknown',
        is_guest: !user,
      });
    }
  } catch (e) {
    console.log('[analytics] tutorial_step_completed (profile-facebook) failed:', e);
  }

  // Advance immediately so modal opens on the correct step
  nextStep();
};

      
      return () => {
        delete (global as any).onProfileScreenNavigated;
      };
    }
  }, [isActive, currentStep, nextStep]);



  /**
   * Get the current step for tooltip display
   * Handles both main steps and sub-steps
   */
  const getCurrentStepForTooltip = useCallback(() => {
  if (!currentStep) return null;
  
  return currentStep.multiStep && currentStep.subSteps && currentSubStep >= 0
    ? currentStep.subSteps[currentSubStep]
    : currentStep;
  }, [currentStep, currentSubStep]);

  const stepForTooltip = getCurrentStepForTooltip();

  /**
   * Handle next step progression
   * For interaction steps, we may need special handling
   */
const handleNext = useCallback(() => {
  if (!stepForTooltip) return;

  // ðŸ”” analytics: tutorial_next_clicked (guard against double-taps)
  try {
    const now = Date.now();
    if (now - lastNextClickAtRef.current < 350) {
      return; // drop accidental double-tap
    }
    lastNextClickAtRef.current = now;

    const stepKey = stepForTooltip.id;
    const stepIndex = TUTORIAL_STEPS.findIndex(s => s.id === stepKey);
    const dwellStart = (global as any).__tutorialStepDwellStartTs;
    const dwell = typeof dwellStart === 'number' ? Math.max(0, now - dwellStart) : 0;

    const runInitiated = (global as any).__tutorialRunUserInitiated === true;
    const launchSource = (global as any).__tutorialRunLaunchSource || 'unknown';

    amplitudeTrack('tutorial_next_clicked', {
      tutorial_id: 'main_onboarding_v1',
      tutorial_version: 1,
      total_steps: TUTORIAL_STEPS.length,
      source: 'tutorial_system',
      from_screen: pathname || '(unknown)',

      step_index: stepIndex,
      step_key: stepKey,
      dwell_ms_on_step: dwell,

      user_initiated: runInitiated,
      launch_source: launchSource,
      is_guest: !user,
    });
  } catch (e) {
    console.log('[analytics] tutorial_next_clicked failed:', e);
  }

  // ðŸŽ¯ analytics: tutorial_step_completed for the step weâ€™re leaving (on explicit Next)
// Guard so we donâ€™t double-log if an auto-completion also fired elsewhere
try {
  const stepKey = stepForTooltip.id;
  if (!stepCompletedRef.current.has(stepKey)) {
    stepCompletedRef.current.add(stepKey);

    const now2 = Date.now();
    const stepIndex2 = TUTORIAL_STEPS.findIndex(s => s.id === stepKey);
    const dwellStart2 = (global as any).__tutorialStepDwellStartTs;
    const dwell2 = typeof dwellStart2 === 'number' ? Math.max(0, now2 - dwellStart2) : 0;

    const runInitiated2 = (global as any).__tutorialRunUserInitiated === true;
    const launchSource2 = (global as any).__tutorialRunLaunchSource || 'unknown';

    amplitudeTrack('tutorial_step_completed', {
      tutorial_id: 'main_onboarding_v1',
      tutorial_version: 1,
      total_steps: TUTORIAL_STEPS.length,
      source: 'tutorial_system',
      from_screen: pathname || '(unknown)',

      step_index: stepIndex2,
      step_key: stepKey,
      dwell_ms_on_step: dwell2,

      user_initiated: runInitiated2,
      launch_source: launchSource2,
      is_guest: !user,
    });
  }
} catch (e) {
  console.log('[analytics] tutorial_step_completed (Next) failed:', e);
}

tutorialLog(`Next button pressed for step: ${stepForTooltip.id}`);


    // For cluster-click step, trigger cluster selection then advance
    if (stepForTooltip.id === 'cluster-click') {
      tutorialLog('Continue clicked - triggering cluster selection');
      
      const mapStore = (global as any).mapStore;
      const handleMarkerPress = (global as any).handleMarkerPress;
      
      if (mapStore?.clusters?.length > 0 && handleMarkerPress) {
        // Find best cluster for tutorial
        const targetCluster = mapStore.clusters.find((c: any) => c.eventCount > 0 || c.specialCount > 0) || mapStore.clusters[0];
        handleMarkerPress(targetCluster);
      }
      
      // Tutorial will auto-advance when callout opens via the polling effect
      return;
    }

    // For other interaction steps, we may need special handling
    if (stepForTooltip.action === 'interaction') {
      tutorialLog('Interaction step - proceeding to next step');
      nextStep();
    } else {
      nextStep();
    }
  }, [stepForTooltip, nextStep]);

  /**
   * Tutorial overlay function for modal screens
   */
  /**
 * Tutorial overlay function for modal screens - UPDATED TO USE NEW DESIGN
 * Replace the tutorialOverlayForModal function in TutorialManager.tsx (around line 400)
 */
/**
 * DEBUG VERSION - Tutorial overlay function for modal screens
 * Replace the tutorialOverlayForModal function temporarily to debug
 */
/**
 * DEBUG VERSION - Tutorial overlay function for modal screens
 * Replace the tutorialOverlayForModal function temporarily to debug
 */
/**
 * KEEP THE DEBUG VERSION THAT WORKS + ADD COMPLETION DEBUGGING
 * Replace tutorialOverlayForModal with this version that debugs the completion issue
 */
/**
 * KEEP THE DEBUG VERSION THAT WORKS + ADD COMPLETION DEBUGGING
 * Replace tutorialOverlayForModal with this version that debugs the completion issue
 */
/**
 * KEEP THE DEBUG VERSION THAT WORKS + ADD COMPLETION DEBUGGING
 * Replace tutorialOverlayForModal with this version that debugs the completion issue
 */
/**
 * KEEP THE DEBUG VERSION THAT WORKS + ADD COMPLETION DEBUGGING
 * Replace tutorialOverlayForModal with this version that debugs the completion issue
 */
const tutorialOverlayForModal = useCallback(() => {
  console.log('ðŸ” MODAL OVERLAY FUNCTION CALLED');
  console.log('ðŸ” Tutorial State Check:', {
    isActive,
    currentStepId: currentStep?.id,
    showWelcome,
    isPositioning,
    tutorialStatus: tutorialStatus?.completed,
    currentStepIndex: TUTORIAL_STEPS.findIndex(s => s.id === currentStep?.id),
  });

  // Only show overlay for facebook-submission step
  if (currentStep?.id === 'facebook-submission') {
    console.log('âœ… On facebook-submission step');
    
    // Get measurement and stability status
    const dynamicLayout = (global as any).facebookSubmissionLayout;
    const isStable = (global as any).facebookSubmissionStable;
    
    // Keep track of last good measurement globally (can't use useRef in callback)
    if (!(global as any).lastGoodFacebookLayout) {
      (global as any).lastGoodFacebookLayout = null;
    }
    
    // Detect if this is a stale unpadded measurement
    // Stale measurements will be close to the original component size (~322px wide, ~89px tall)
    // Padded measurements should be at least 30% larger (even if constrained by screen)
    const ORIGINAL_WIDTH = 322;
    const ORIGINAL_HEIGHT = 89;
    const TOLERANCE = 15; // Allow 15px variance
    
    const isLikelyStale = dynamicLayout && 
      Math.abs(dynamicLayout.width - ORIGINAL_WIDTH) < TOLERANCE && 
      Math.abs(dynamicLayout.height - ORIGINAL_HEIGHT) < TOLERANCE;
    
    console.log('ðŸ“Š MODAL OVERLAY: Stale check -', {
      width: dynamicLayout?.width,
      height: dynamicLayout?.height,
      widthDiff: dynamicLayout ? Math.abs(dynamicLayout.width - ORIGINAL_WIDTH) : null,
      heightDiff: dynamicLayout ? Math.abs(dynamicLayout.height - ORIGINAL_HEIGHT) : null,
      isStale: isLikelyStale
    });
    
    // If we have a good (padded) measurement, save it
    // Good measurements are NOT stale and have reasonable size
    if (dynamicLayout && !isLikelyStale && dynamicLayout.width > ORIGINAL_WIDTH + 20) {
      (global as any).lastGoodFacebookLayout = dynamicLayout;
      console.log('âœ… MODAL OVERLAY: Saved good measurement as backup:', dynamicLayout);
    }
    
    console.log('ðŸ“Š MODAL OVERLAY STABILITY CHECK:', {
      hasLayout: !!dynamicLayout,
      isStable: isStable,
      layout: dynamicLayout,
      isLikelyStale: isLikelyStale,
      hasGoodBackup: !!(global as any).lastGoodFacebookLayout
    });
    
    // Determine which layout to use
    let layoutToUse = dynamicLayout;
    
    if (isLikelyStale && (global as any).lastGoodFacebookLayout) {
      console.log('âš ï¸ MODAL OVERLAY: Detected stale measurement, using last good measurement instead');
      console.log('  - Stale:', dynamicLayout);
      console.log('  - Using:', (global as any).lastGoodFacebookLayout);
      layoutToUse = (global as any).lastGoodFacebookLayout;
      
      // Also restore the good measurement globally to prevent flickering
      (global as any).facebookSubmissionLayout = (global as any).lastGoodFacebookLayout;
      (global as any).facebookSubmissionStable = true;
    }
    
    // Only return null if we have NO measurements at all
    if (!layoutToUse || (!isStable && !(global as any).lastGoodFacebookLayout)) {
      console.log('â³ MODAL OVERLAY: Waiting for first measurement...');
      console.log('  - Layout exists:', !!layoutToUse);
      console.log('  - Is stable:', isStable);
      console.log('  - Has backup:', !!(global as any).lastGoodFacebookLayout);
      
      return null;
    }
    
    console.log('âœ… MODAL OVERLAY: Measurements stable! Rendering overlay with:', layoutToUse);
    
    // Use measurements directly - padding already applied in Profile.tsx
    // Create spotlight config with stable measurements
    const modalSpotlight = {
      x: layoutToUse.x,
      y: layoutToUse.y,
      width: layoutToUse.width,
      height: layoutToUse.height,
      borderRadius: 20,
      showPulse: false
    };

    console.log('ðŸŽ¯ MODAL OVERLAY: Using pre-padded spotlight config:', modalSpotlight);
    console.log('ðŸŽ¯ MODAL OVERLAY: No additional padding needed - Profile.tsx handles it');
    
    return (
      <TutorialOverlay
  isVisible={true}
  onRequestClose={() => {
    // ðŸ”” analytics: tutorial_dismissed (modal overlay close/backdrop)
    try {
      const now = Date.now();
      if (now - lastDismissClickAtRef.current >= 350) {
        lastDismissClickAtRef.current = now;

        const runInitiated = (global as any).__tutorialRunUserInitiated === true;
        const launchSource = (global as any).__tutorialRunLaunchSource || 'unknown';
        const dwellStart = (global as any).__tutorialStepDwellStartTs;
        const dwell = typeof dwellStart === 'number' ? Math.max(0, now - dwellStart) : 0;

        amplitudeTrack('tutorial_dismissed', {
          tutorial_id: 'main_onboarding_v1',
          tutorial_version: 1,
          total_steps: TUTORIAL_STEPS.length,
          source: 'tutorial_system',
          from_screen: pathname || '(unknown)',

          // Active step is the modal step; include step info if present
          step_index: TUTORIAL_STEPS.findIndex(s => s.id === (currentStep?.id || '')),
          step_key: currentStep?.id || undefined,
          dwell_ms_on_step: dwell,

          user_initiated: runInitiated,
          launch_source: launchSource,
          is_guest: !user,
        });
      }
    } catch (e) {
      console.log('[analytics] tutorial_dismissed (modal) failed:', e);
    }

    skipTutorial();
  }}
>
        <TutorialSpotlight spotlight={modalSpotlight}>
          <TutorialBottomSheet
            title="Submit Facebook Pages"
            content="Tap 'Suggest a Facebook Page' to expand this section and submit pages we should monitor."
            position={{ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT * 0.45 }}
            placement="top"
            onNext={() => {
              console.log('ðŸ” FINISH TUTORIAL CLICKED');
              
              // Clean up stability flags
              (global as any).facebookSubmissionStable = false;
              (global as any).facebookSubmissionLayout = null;
              (global as any).tutorialHighlightFacebookSubmission = false;
              
              completeTutorial();
              
              // Navigate back to map
              setTimeout(() => {
                const router = (global as any).router;
                if (router) {
                  router.replace('/(tabs)/map');
                }
              }, 100);
            }}
onSkip={() => {
  // ðŸ”” analytics: tutorial_dismissed (modal explicit Skip)
  try {
    const now = Date.now();
    if (now - lastDismissClickAtRef.current >= 350) {
      lastDismissClickAtRef.current = now;

      const runInitiated = (global as any).__tutorialRunUserInitiated === true;
      const launchSource = (global as any).__tutorialRunLaunchSource || 'unknown';
      const dwellStart = (global as any).__tutorialStepDwellStartTs;
      const dwell = typeof dwellStart === 'number' ? Math.max(0, now - dwellStart) : 0;

      amplitudeTrack('tutorial_dismissed', {
        tutorial_id: 'main_onboarding_v1',
        tutorial_version: 1,
        total_steps: TUTORIAL_STEPS.length,
        source: 'tutorial_system',
        from_screen: pathname || '(unknown)',
        step_index: TUTORIAL_STEPS.findIndex(s => s.id === (currentStep?.id || '')),
        step_key: currentStep?.id || undefined,
        dwell_ms_on_step: dwell,
        user_initiated: runInitiated,
        launch_source: launchSource,
        is_guest: !user,
      });
    }
  } catch (e) {
    console.log('[analytics] tutorial_dismissed (modal skip) failed:', e);
  }

  console.log('📍 SKIP CLICKED - Cleaning up');
  // Clean up stability flags
  (global as any).facebookSubmissionStable = false;
  (global as any).facebookSubmissionLayout = null;
  (global as any).tutorialHighlightFacebookSubmission = false;
  
  // Close the Profile modal
  const router = (global as any).router;
  if (router) {
    console.log('📍 SKIP: Closing Profile modal');
    router.back();
  }
  
  skipTutorial();
}}

            onPrevious={() => {
        console.log('ðŸ” PREVIOUS CLICKED - Cleaning up facebook-submission and closing modal');
        
        // Clean up stability flags
        (global as any).facebookSubmissionStable = false;
        (global as any).facebookSubmissionLayout = null;
        (global as any).tutorialHighlightFacebookSubmission = false;
        (global as any).lastGoodFacebookLayout = null; // Also clear the backup
        
        // Close the Profile modal FIRST
        const router = (global as any).router;
        if (router) {
          console.log('ðŸ” PREVIOUS: Closing Profile modal');
          router.back(); // This closes the modal
        }
        
        // Then go to previous tutorial step after modal closes
        setTimeout(() => {
          console.log('ðŸ” PREVIOUS: Moving to previous tutorial step');
          previousStep();
        }, 200); // Small delay to ensure modal closes first
      }}
            showPrevious={true}
            showNext={true}
            showSkip={true}
            nextText="Finish Tutorial"
            sheetPosition="center"
            stepNumber={TUTORIAL_STEPS.findIndex(s => s.id === currentStep?.id) + 1}
            totalSteps={TUTORIAL_STEPS.length}
          />
        </TutorialSpotlight>
      </TutorialOverlay>
    );
  }
  
  console.log('ðŸ” NOT SHOWING OVERLAY - Not on facebook-submission step');
  console.log('ðŸ” Current step:', currentStep?.id);
  
  return null;
}, [isActive, showWelcome, isPositioning, currentStep, tutorialStatus, completeTutorial, skipTutorial, previousStep]);


 

  /**
   * Expose tutorial functions globally for integration (moved after function declarations)
   */
  useEffect(() => {
    // @ts-ignore - Add to global for easy access from other components
    (global as any).triggerGathRTutorial = triggerTutorial;
    // @ts-ignore - Add to global for easy access from other components  
    (global as any).autoTriggerGathRTutorial = autoTriggerTutorial;
    // @ts-ignore - Add manual trigger for debugging/interest selection
    (global as any).manualTriggerGathRTutorial = manualTriggerTutorial;
    // @ts-ignore - Add restart trigger for profile replay
    (global as any).restartGathRTutorial = restartTutorial;
    // @ts-ignore - Add tutorial overlay for modal screens
    (global as any).tutorialOverlayForModal = tutorialOverlayForModal;
    
    tutorialLog('Global tutorial functions exposed', {
      triggerGathRTutorial: 'available',
      autoTriggerGathRTutorial: 'available', 
      manualTriggerGathRTutorial: 'available',
      restartGathRTutorial: 'available',
      tutorialOverlayForModal: 'available'
    });
    
    return () => {
      // @ts-ignore - Cleanup
      delete (global as any).triggerGathRTutorial;
      // @ts-ignore - Cleanup
      delete (global as any).autoTriggerGathRTutorial;
      // @ts-ignore - Cleanup  
      delete (global as any).manualTriggerGathRTutorial;
      // @ts-ignore - Cleanup
      delete (global as any).restartGathRTutorial;
      // @ts-ignore - Cleanup
      delete (global as any).tutorialOverlayForModal;
    };
  }, [triggerTutorial, autoTriggerTutorial, manualTriggerTutorial, restartTutorial, tutorialOverlayForModal]);

  /**
   * Check if we should show any tutorial UI
   */
  const shouldShowTutorialUI = showWelcome || (isActive && !showWelcome);

  return (
    <View style={{ flex: 1 }}>
      {/* Main app content */}
      {children}
      
      {/* Welcome Screen */}
      {showWelcome && (
        <TutorialOverlay isVisible={true} onRequestClose={handleWelcomeSkip}>
          <WelcomeScreen onStart={handleWelcomeStart} onSkip={handleWelcomeSkip} />
        </TutorialOverlay>
      )}

      {/* Tutorial Steps - Show for all steps except facebook-submission */}
      {isActive && !showWelcome && !isPositioning && 
       currentStep?.id !== 'facebook-submission' && (() => {
         console.log('ðŸ” MAIN OVERLAY RENDERING - isActive:', isActive, 'step:', currentStep?.id);
         return true;
       })() && (
        <TutorialOverlay isVisible={true} onRequestClose={skipTutorial}>
          <TutorialSpotlight spotlight={spotlightConfig}>
            {stepForTooltip && (
              <TutorialBottomSheet
                title={stepForTooltip.title}
                content={stepForTooltip.content}
                onNext={handleNext}
                onPrevious={() => {
                  // ðŸ”” analytics: tutorial_prev_clicked (guard against double-taps)
                  try {
                    const now = Date.now();
                    if (now - lastPrevClickAtRef.current < 350) {
                      return; // drop accidental double-tap
                    }
                    lastPrevClickAtRef.current = now;

                    const stepKey = stepForTooltip.id;         // step we are LEAVING
                    const stepIndex = TUTORIAL_STEPS.findIndex(s => s.id === stepKey);
                    const dwellStart = (global as any).__tutorialStepDwellStartTs;
                    const dwell = typeof dwellStart === 'number' ? Math.max(0, now - dwellStart) : 0;

                    const runInitiated = (global as any).__tutorialRunUserInitiated === true;
                    const launchSource = (global as any).__tutorialRunLaunchSource || 'unknown';

                    amplitudeTrack('tutorial_prev_clicked', {
                      tutorial_id: 'main_onboarding_v1',
                      tutorial_version: 1,
                      total_steps: TUTORIAL_STEPS.length,
                      source: 'tutorial_system',
                      from_screen: pathname || '(unknown)',

                      step_index: stepIndex,
                      step_key: stepKey,
                      dwell_ms_on_step: dwell,

                      user_initiated: runInitiated,
                      launch_source: launchSource,
                      is_guest: !user,
                    });
                  } catch (e) {
                    console.log('[analytics] tutorial_prev_clicked failed:', e);
                  }

                  // Get the previous step to determine what screen it's on
                  const currentStepIndex = TUTORIAL_STEPS.findIndex(step => step.id === stepForTooltip.id);
                  const previousStepId = currentStepIndex > 0 ? TUTORIAL_STEPS[currentStepIndex - 1].id : null;
                  
                  const router = (global as any).router;
                  
                  // Define which steps are on which screens
                  const eventsScreenSteps = ['events-list-explanation', 'events-filters'];
                  const specialsScreenSteps = ['specials-list-explanation', 'specials-filters'];
                  const profileScreenSteps = ['profile-facebook', 'facebook-submission'];
                  const mapScreenSteps = ['welcome', 'cluster-click', 'callout-venue-selector', 'callout-tabs', 'callout-event-details', 'filter-pills', 'clear-filters', 'events-tab', 'specials-tab'];
                  
                  // Current step screen
                  const currentOnEvents = eventsScreenSteps.includes(stepForTooltip.id);
                  const currentOnSpecials = specialsScreenSteps.includes(stepForTooltip.id);
                  const currentOnProfile = profileScreenSteps.includes(stepForTooltip.id);
                  
                  // Previous step screen
                  const previousOnMap = previousStepId && mapScreenSteps.includes(previousStepId);
                  const previousOnEvents = previousStepId && eventsScreenSteps.includes(previousStepId);
                  const previousOnSpecials = previousStepId && specialsScreenSteps.includes(previousStepId);
                  
                  // Navigate if changing screens
                  if (currentOnEvents && previousOnMap) {
                    router?.replace('/(tabs)/map');
                    setTimeout(() => previousStep(), 100);
                  }
                  else if (currentOnSpecials && previousOnEvents) {
                    router?.replace('/(tabs)/events');
                    setTimeout(() => previousStep(), 100);
                  }
                  else if (currentOnSpecials && previousOnMap) {
                    router?.replace('/(tabs)/map');
                    setTimeout(() => previousStep(), 100);
                  }
                  else if (stepForTooltip.id === 'facebook-submission') {
                    // Special case: going back from facebook-submission to profile-facebook
                    // Close modal and return to specials screen
                    router?.back(); // Close modal
                    setTimeout(() => {
                      router?.replace('/(tabs)/specials'); // Go to specials screen
                      setTimeout(() => previousStep(), 100);
                    }, 100);
                  }
                  else if (currentOnProfile) {
                    // Handle other profile backwards navigation
                    router?.back();
                    setTimeout(() => {
                      if (previousOnSpecials) router?.replace('/(tabs)/specials');
                      else if (previousOnEvents) router?.replace('/(tabs)/events');
                      else if (previousOnMap) router?.replace('/(tabs)/map');
                      setTimeout(() => previousStep(), 100);
                    }, 100);
                  }
                  else {
                    // Same screen, just go back
                    previousStep();
                  }
                }}

                onSkip={() => {
  // ðŸ”” analytics: tutorial_dismissed (bottom sheet Skip)
  try {
    const now = Date.now();
    if (now - lastDismissClickAtRef.current >= 350) {
      lastDismissClickAtRef.current = now;

      const runInitiated = (global as any).__tutorialRunUserInitiated === true;
      const launchSource = (global as any).__tutorialRunLaunchSource || 'unknown';
      const dwellStart = (global as any).__tutorialStepDwellStartTs;
      const dwell = typeof dwellStart === 'number' ? Math.max(0, now - dwellStart) : 0;

      amplitudeTrack('tutorial_dismissed', {
        tutorial_id: 'main_onboarding_v1',
        tutorial_version: 1,
        total_steps: TUTORIAL_STEPS.length,
        source: 'tutorial_system',
        from_screen: pathname || '(unknown)',
        step_index: TUTORIAL_STEPS.findIndex(s => s.id === (currentStep?.id || '')),
        step_key: currentStep?.id || undefined,
        dwell_ms_on_step: dwell,
        user_initiated: runInitiated,
        launch_source: launchSource,
        is_guest: !user,
      });
    }
  } catch (e) {
    console.log('[analytics] tutorial_dismissed (sheet skip) failed:', e);
  }

  skipTutorial();
}}
                showPrevious={currentStep?.id !== 'welcome'}
                showNext={stepForTooltip.id !== 'cluster-click' && stepForTooltip.id !== 'events-tab' && stepForTooltip.id !== 'specials-tab' && stepForTooltip.id !== 'profile-facebook'}
                showSkip={true}
                nextText={stepForTooltip.action === 'interaction' ? 'Continue' : 'Next'}
                                position={tooltipPosition}
                placement={
  Platform.OS === 'android' && stepForTooltip.id === 'cluster-click'
    ? 'bottom'
    : (stepForTooltip.placement || 'bottom')
}

                sheetPosition={
  Platform.OS === 'android' && stepForTooltip.id === 'cluster-click'
    ? 'bottom'
    : (stepForTooltip.sheetPosition || 'bottom')
}
                stepNumber={TUTORIAL_STEPS.findIndex(s => s.id === stepForTooltip.id) + 1}
                totalSteps={TUTORIAL_STEPS.length}

              />
            )}
          </TutorialSpotlight>
        </TutorialOverlay>
      )}
    </View>
  );
};