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
import { TutorialOverlay } from './TutorialOverlay';
import { TutorialSpotlight } from './TutorialSpotlight';
import { TutorialTooltip } from './TutorialTooltip';
import { WelcomeScreen } from './WelcomeScreen';
import { TutorialBottomSheet } from './TutorialBottomSheet';
import { 
  SpotlightConfig, 
  ComponentMeasurement 
} from '../../types/tutorial';
import { 
  findNearestCluster, 
  measureComponent, 
  calculateTooltipPosition,
  tutorialLog,
  shouldAutoTriggerTutorial
} from '../../utils/tutorialUtils';
import { TUTORIAL_CONFIG } from '../../config/tutorialSteps';

import { 
  TUTORIAL_STEPS, 
  hasSubSteps, 
  getTutorialStepById 
} from '../../config/tutorialSteps';
import { TutorialStep } from '../../types/tutorial';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface TutorialManagerProps {
  children: React.ReactNode;
}

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
  }, []);

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
    setShowWelcome(false);
    skipTutorial();
  }, [skipTutorial]);

  /**
   * Update spotlight and tooltip position based on current step
   * This is the core positioning logic that runs for each tutorial step
   */
  const updateTutorialPosition = useCallback(async () => {
    if (!isActive || !currentStep) {
      setSpotlightConfig(undefined);
      return;
    }

    setIsPositioning(true);
    tutorialLog(`Positioning tutorial for step: ${currentStep.id}, substep: ${currentSubStep}`);

    // Define default position at function scope
    const defaultPosition = { x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 };

    try {
      let targetMeasurement: ComponentMeasurement | null = null;

      // Get current step (main step or sub-step)
      // For multi-step tutorials: currentSubStep -1 = main step, 0+ = sub-steps
      const step = currentStep.multiStep && currentStep.subSteps && currentSubStep >= 0
        ? currentStep.subSteps[currentSubStep]
        : currentStep;

      // Handle different step types
      switch (step.id) {
        case 'welcome':
        case 'completion':
          // Center-positioned steps don't need spotlight
          setSpotlightConfig(undefined);
          setTooltipPosition(defaultPosition);
          tutorialLog(`Center-positioned step: ${step.id}`);
          break;

        case 'cluster-click':
          tutorialLog('Finding cluster and repositioning map for tutorial');
          
          // Wait for map to be ready
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Get cluster from map store and reposition camera
          const mapStore = (global as any).mapStore;
          
          tutorialLog('Map store clusters available:', mapStore?.clusters?.length || 0);
          if (mapStore?.clusters?.length > 0) {
            tutorialLog('First few clusters:', mapStore.clusters.slice(0, 3).map((c: any) => ({
              id: c.id,
              eventCount: c.eventCount,
              specialCount: c.specialCount,
              venues: c.venues?.length || 0
            })));
            // Find best cluster for tutorial
            const clusters = mapStore.clusters;
           // Find best cluster for tutorial - prefer PEI area clusters
            const peiClusters = clusters.filter((c: any) => {
              if (!c.venues || c.venues.length === 0) return false;
              
              // Check if cluster is in PEI area (roughly -64 to -62 longitude, 45 to 47 latitude)
              const avgLng = c.venues.reduce((sum: number, venue: any) => sum + venue.longitude, 0) / c.venues.length;
              const avgLat = c.venues.reduce((sum: number, venue: any) => sum + venue.latitude, 0) / c.venues.length;
              
              return avgLng >= -64 && avgLng <= -62 && avgLat >= 45 && avgLat <= 47;
            });
            
            tutorialLog('Found PEI clusters:', peiClusters.length);
            
            // Find best PEI cluster for tutorial, fallback to any cluster with events
            const targetCluster = peiClusters.find((c: any) => c.eventCount > 0 || c.specialCount > 0) 
              || clusters.find((c: any) => c.eventCount > 0 || c.specialCount > 0) 
              || clusters[0];
            
            // Calculate cluster center coordinates
            const coordinates = targetCluster.venues?.length > 0
              ? targetCluster.venues.length === 1
                ? [targetCluster.venues[0].longitude, targetCluster.venues[0].latitude]
                : [
                    targetCluster.venues.reduce((sum: number, venue: any) => sum + venue.longitude, 0) / targetCluster.venues.length,
                    targetCluster.venues.reduce((sum: number, venue: any) => sum + venue.latitude, 0) / targetCluster.venues.length
                  ]
              : [-63.1276, 46.2336]; // Fallback to PEI center
            
            tutorialLog('Moving camera to cluster coordinates:', coordinates);
            
            // Access camera through global reference
            const cameraRef = (global as any).mapCameraRef;
            if (cameraRef?.current) {
              // Calculate precise offset to position cluster at spotlight location
              // Spotlight is at ~20% from top, screen center is 50% from top
              // Account for zoom animation transition and slight overshoot
              const spotlightOffsetPercent = 0.27; // Increased from 0.30 to 0.35
              const mapVisibleHeight = 0.022; // Slightly increased for zoom transition
              const latitudeOffset = spotlightOffsetPercent * mapVisibleHeight;
              
              cameraRef.current.setCamera({
                centerCoordinate: [coordinates[0], coordinates[1] - latitudeOffset],
                zoomLevel: 14,
                animationDuration: 1000,
              });
              
              tutorialLog('Camera offset applied:', { 
                originalCoords: coordinates,
                offset: latitudeOffset,
                finalCoords: [coordinates[0], coordinates[1] - latitudeOffset]
              });
              
              // Wait for camera animation to complete
              await new Promise(resolve => setTimeout(resolve, 1200));
            }
          }
          
          // Now position spotlight where the cluster should be (25% from top, centered horizontally)
          targetMeasurement = {
            x: SCREEN_WIDTH / 2 - 40,
            y: SCREEN_HEIGHT * 0.25 - 35, // Move spotlight up slightly to match cluster
            width: 80,
            height: 80
          };
          break;

        case 'callout-venue-selector':
          console.log('🔍 TUTORIAL DEBUG: Using relative venue selector coordinates');
          
          // Calculate relative to screen size - venue selector is typically:

          targetMeasurement = {
            x: 20,
            y: SCREEN_HEIGHT * 0.465,  // 72% down from top (where venue selector typically appears)
            width: SCREEN_WIDTH - 39, // Full width minus 20px margins
            height: 96
          };
          console.log('🔍 TUTORIAL DEBUG: Calculated venue selector position:', targetMeasurement);
          break;

        case 'callout-tabs':
          console.log('🔍 TUTORIAL DEBUG: Using relative tabs coordinates');
          
          // Tabs are typically in the middle area of the callout
          // Between venue selector and content area
          targetMeasurement = {
            x: 10,
            y: SCREEN_HEIGHT * 0.59,  // Higher up than venue selector (around tabs area)
            width: SCREEN_WIDTH - 20,
            height: 45  // Tabs are shorter than venue selector
          };
          console.log('🔍 TUTORIAL DEBUG: Calculated tabs position:', targetMeasurement);
          break;

        case 'callout-event-details':
          console.log('🔍 TUTORIAL DEBUG: Using relative event details coordinates');
          
          // Event items are in the scrollable content area below the tabs
          // Should be around 65-70% down from top of screen
          targetMeasurement = {
            x: 5,
            y: SCREEN_HEIGHT * 0.65,  // Below tabs, in the content area
            width: SCREEN_WIDTH - 15,
            height: 280  // Event items are taller than tabs
          };
          console.log('🔍 TUTORIAL DEBUG: Calculated event details position:', targetMeasurement);
          break;

        case 'filter-pills':
          console.log('🔍 TUTORIAL DEBUG: Using relative filter pills coordinates');
          
          // Filter pills are at top of map, but need to avoid status bar clipping
          targetMeasurement = {
            x: 20,
            y: 120,  // Move down from 80 to avoid clipping
            width: SCREEN_WIDTH - 40,
            height: 55
          };
          console.log('🔍 TUTORIAL DEBUG: Calculated filter pills position:', targetMeasurement);
          break;

        case 'clear-filters':
          // Center-positioned reminder, no spotlight needed
          setSpotlightConfig(undefined);
          setTooltipPosition({ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2 });
          tutorialLog('Center-positioned step: clear-filters');
          break;

        case 'events-tab':
          console.log('🔍 TUTORIAL DEBUG: Using relative events tab coordinates');
          
          // Events tab is in bottom navigation bar
          // Usually around 90-95% down from top of screen
          targetMeasurement = {
            x: 32,                    // Adjust left/right position
            y: SCREEN_HEIGHT * 0.908,  // Near bottom of screen
            width: 70,               // Width of individual tab
            height: 60                // Height of tab area
          };
          console.log('🔍 TUTORIAL DEBUG: Calculated events tab position:', targetMeasurement);
          break;

        case 'events-list-explanation':
          console.log('🔍 TUTORIAL DEBUG: Using relative events list coordinates');
          
          // Events list takes up most of the screen below the header and filters
          targetMeasurement = {
            x: 10,
            y: SCREEN_HEIGHT * 0.26,   // Below header and filter area
            width: SCREEN_WIDTH - 20,
            height: SCREEN_HEIGHT * 0.63 // Large area covering the events list
          };
          console.log('🔍 TUTORIAL DEBUG: Calculated events list position:', targetMeasurement);
          break;

        case 'events-filters':
          console.log('🔍 TUTORIAL DEBUG: Using relative events filters coordinates');
          
          // Events filters are at the top of the events screen
          // Similar position to filter-pills but adjusted for events screen
          targetMeasurement = {
            x: 4,
            y: SCREEN_HEIGHT * 0.115,  // Near top of screen, below header
            width: SCREEN_WIDTH - 10,
            height: 130                // Height to cover filter section
          };
          console.log('🔍 TUTORIAL DEBUG: Calculated events filters position:', targetMeasurement);
          break;

        case 'specials-tab':
          console.log('🔍 TUTORIAL DEBUG: Using relative specials tab coordinates');
          
          // Specials tab is in bottom navigation bar, probably middle or right position
          targetMeasurement = {
            x: 300,                    // Adjust based on specials tab position
            y: SCREEN_HEIGHT * 0.908,  // Same as events tab
            width: 70,
            height: 60
          };
          console.log('🔍 TUTORIAL DEBUG: Calculated specials tab position:', targetMeasurement);
          break;

        case 'specials-list-explanation':
          console.log('🔍 TUTORIAL DEBUG: Using relative specials list coordinates');
          
          // Specials list takes up most of the screen below the header and filters
          targetMeasurement = {
            x: 10,
            y: SCREEN_HEIGHT * 0.26,   // Below header and filter area
            width: SCREEN_WIDTH - 20,
            height: SCREEN_HEIGHT * 0.63 // Large area covering the specials list
          };
          console.log('🔍 TUTORIAL DEBUG: Calculated specials list position:', targetMeasurement);
          break;

        case 'specials-filters':
          console.log('🔍 TUTORIAL DEBUG: Using relative specials filters coordinates');
          
          // Specials filters are at the top of the specials screen
          targetMeasurement = {
            x: 4,
            y: SCREEN_HEIGHT * 0.115,  // Same as events filters
            width: SCREEN_WIDTH - 10,
            height: 130
          };
          console.log('🔍 TUTORIAL DEBUG: Calculated specials filters position:', targetMeasurement);
          break;

        case 'profile-facebook':
          console.log('🔍 TUTORIAL DEBUG: Using relative profile/settings coordinates');
          
          // Settings cog in top-right corner of header
          targetMeasurement = {
            x: SCREEN_WIDTH - 43,    // Position from right edge (icon + margin)
            y: Platform.OS === 'ios' ? 66 : 65,  // Different heights for iOS/Android status bars
            width: 30,               // More precise touch target
            height: 30
          };
          console.log('🔍 TUTORIAL DEBUG: Calculated settings button position:', targetMeasurement);
          break;

       case 'facebook-submission':
  console.log('🔍 TUTORIAL DEBUG: Using relative facebook submission coordinates');
  
  targetMeasurement = {
    x: 20,
    y: SCREEN_HEIGHT * 0.65,
    width: SCREEN_WIDTH - 40,
    height: 100  // Change this to 300 - very obvious difference
  };
  console.log('🔍 TUTORIAL DEBUG: Calculated facebook submission position:', targetMeasurement);
  break;
      }

      // Configure spotlight and tooltip position
      if (targetMeasurement) {
        tutorialLog('Target measurement found:', targetMeasurement);
        
        // Set spotlight configuration
        setSpotlightConfig({
          x: targetMeasurement.x,
          y: targetMeasurement.y,
          width: targetMeasurement.width,
          height: targetMeasurement.height,
          borderRadius: step.id === 'cluster-click' ? 40 : 8 // Round border for clusters
        });
        
        // Calculate tooltip position with custom overrides
let tooltipPos;
if (step.id === 'events-list-explanation') {
  // Custom positioning for events list - keep spotlight where it is, move tooltip higher
  tooltipPos = {
    x: SCREEN_WIDTH / 2,
    y: SCREEN_HEIGHT * 0.05  // ← Adjust this Y value to position tooltip where you want
  };
} else {
  tooltipPos = calculateTooltipPosition(
    targetMeasurement,
    step.placement || 'bottom',
    350,
    step.id
  );
}
setTooltipPosition(tooltipPos);
        
        tutorialLog('Positioning complete:', { spotlight: targetMeasurement, tooltip: tooltipPos });
      } else {
        tutorialLog('No target measurement, using default position');
        setSpotlightConfig(undefined);
        setTooltipPosition(defaultPosition);
      }
    } catch (error) {
      console.error('Error positioning tutorial:', error);
      tutorialLog('Error positioning tutorial:', error);
      
      // Fallback to center position
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
    console.log('🔍 EVENTS DETECTION EFFECT:', {
      isActive,
      currentStepId: currentStep?.id,
      isEventsTab: currentStep?.id === 'events-tab'
    });
    
    if (isActive && currentStep?.id === 'events-tab') {
      tutorialLog('Setting up events screen detection via global flag');
      
      // Set up detection flag that the events screen can set
      (global as any).onEventsScreenNavigated = () => {
        tutorialLog('Events screen navigation detected - auto-advancing tutorial');
        setTimeout(() => {
          nextStep();
        }, 500);
      };
      
      return () => {
        console.log('🔍 EVENTS DETECTION CLEANUP: Removing onEventsScreenNavigated');
        delete (global as any).onEventsScreenNavigated;
      };
    } else {
      console.log('🔍 EVENTS DETECTION: Not setting up (conditions not met)');
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
    if (isActive && currentStep?.id === 'profile-facebook') {
      tutorialLog('Setting up profile screen detection via global flag');
      
      // Set up detection flag that the profile screen can set
      (global as any).onProfileScreenNavigated = () => {
        tutorialLog('Profile screen navigation detected - auto-advancing tutorial');
        // No setTimeout delay to prevent double-triggering
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
  // ENHANCED DEBUG LOGGING
  console.log('🔍 MODAL OVERLAY DEBUG - FULL STATE:', {
    isActive,
    showWelcome,
    isPositioning,
    currentStepId: currentStep?.id,
    currentStepIndex: TUTORIAL_STEPS.findIndex(s => s.id === currentStep?.id),
    tutorialCompleted: tutorialStatus?.completed,
    tutorialStatus: tutorialStatus,
    allSteps: TUTORIAL_STEPS.map(s => s.id),
  });
  
  // Show for facebook-submission step only when tutorial is active
  if (isActive && currentStep?.id === 'facebook-submission') {
    console.log('🔍 SHOWING FACEBOOK SUBMISSION OVERLAY');
    
    const modalSpotlight = {
      x: 30,
      y: SCREEN_HEIGHT * 0.66,
      width: SCREEN_WIDTH - 60,
      height: 105,
      borderRadius: 16
    };
    
    return (
      <TutorialOverlay isVisible={true} onRequestClose={skipTutorial}>
        <TutorialSpotlight spotlight={modalSpotlight}>
          <TutorialBottomSheet
            title="Submit Facebook Pages"
            content="Tap 'Suggest a Facebook Page' to expand this section and submit pages we should monitor."
            position={{ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT * 0.45 }}
            placement="top"
            onNext={() => {
              console.log('🔍 FINISH TUTORIAL CLICKED - About to complete tutorial');
              console.log('🔍 Current tutorial state before completion:', {
                isActive,
                currentStep: currentStep?.id,
                tutorialStatus
              });
              
              tutorialLog('Completing tutorial from facebook submission');
              
              // Complete the tutorial
              completeTutorial();
              
              // Add a small delay to let the state update
              setTimeout(() => {
                console.log('🔍 Tutorial state after completion:', {
                  isActive,
                  currentStep: currentStep?.id, 
                  tutorialStatus
                });
              }, 100);
              
              // Close profile modal and navigate to map
              setTimeout(() => {
                // Use router to go back to map tab
                const router = (global as any).router;
                if (router) {
                  router.replace('/(tabs)/map');
                }
                
                // Show completion message after navigation
                setTimeout(() => {
                  const Alert = (global as any).Alert;
                  if (Alert) {
                    Alert.alert(
                      '🎉 Tutorial Complete!', 
                      'You\'ve completed the tutorial! Enjoy exploring amazing local events and specials with GathR.',
                      [{ text: 'Start Exploring', style: 'default' }]
                    );
                  }
                  
                  // Center map on user location if available
                  const mapStore = (global as any).mapStore;
                  if (mapStore && mapStore.centerOnUserLocation) {
                    mapStore.centerOnUserLocation();
                  }
                }, 500);
              }, 100);
            }}
            onSkip={skipTutorial}
            onPrevious={() => {
              tutorialLog('Facebook submission: Previous clicked, closing modal');
              const router = (global as any).router;
              router?.back();
              setTimeout(() => {
                router?.replace('/(tabs)/specials');
                setTimeout(() => previousStep(), 100);
              }, 100);
            }}
            showPrevious={true}
            showNext={true}
            showSkip={true}
            nextText="Finish Tutorial"
            sheetPosition="center"
            stepNumber={TUTORIAL_STEPS.findIndex(s => s.id === 'facebook-submission') + 1}
            totalSteps={TUTORIAL_STEPS.length}
          />
        </TutorialSpotlight>
      </TutorialOverlay>
    );
  }
  
  console.log('🔍 NOT SHOWING OVERLAY - Current step is not facebook-submission');
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

      {/* Tutorial Steps - Show for all steps except facebook-submission which has its own modal overlay */}
      {isActive && !showWelcome && !isPositioning && 
       currentStep?.id !== 'facebook-submission' && (
        <TutorialOverlay isVisible={true} onRequestClose={skipTutorial}>
          <TutorialSpotlight spotlight={spotlightConfig}>
            {stepForTooltip && (
  <TutorialBottomSheet
    title={stepForTooltip.title}
    content={stepForTooltip.content}
    onNext={handleNext}
    onPrevious={() => {
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
    onSkip={skipTutorial}
    showPrevious={currentStep?.id !== 'welcome'}
    showNext={stepForTooltip.id !== 'cluster-click' && stepForTooltip.id !== 'events-tab' && stepForTooltip.id !== 'specials-tab' && stepForTooltip.id !== 'profile-facebook'}
    showSkip={true}
    nextText={stepForTooltip.action === 'interaction' ? 'Continue' : 'Next'}
    position={tooltipPosition}
    placement={stepForTooltip.placement || 'bottom'}
    sheetPosition={stepForTooltip.sheetPosition || 'bottom'}
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