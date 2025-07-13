/**
 * GathR Tutorial System - Utility Functions (UPDATED)
 * 
 * Updated to work with the actual map.tsx implementation and cluster structure
 */

import { Dimensions } from 'react-native';
import { ComponentMeasurement, TutorialStatus } from '../types/tutorial';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Measure a component by its CSS class, test ID, or component reference
 * 
 * UPDATED: Added better positioning for actual map components
 */
export const measureComponent = async (selector: string): Promise<ComponentMeasurement | null> => {
  return new Promise((resolve) => {
    
    switch (selector) {
      case 'closest-cluster':
        // The closest cluster marker on the map - positioned in center area
        resolve({ 
          x: SCREEN_WIDTH * 0.5 - 40, // Center horizontally
          y: SCREEN_HEIGHT * 0.4 - 40, // Slightly above center  
          width: 80, 
          height: 80 
        });
        break;
        
      case 'filter-pills':
      case '.filter-pills':
        // FilterPills component at top of map screen - matches the testID in map.tsx
        resolve({ 
          x: 0, 
          y: 80, // Account for status bar and header
          width: SCREEN_WIDTH, 
          height: 60 
        });
        break;
        
      case '.venue-selector':
        // Venue selector in EventCallout - positioned at bottom when callout is open
        resolve({ 
          x: 20, 
          y: SCREEN_HEIGHT - 400, 
          width: SCREEN_WIDTH - 40, 
          height: 80 
        });
        break;
        
      case '.event-tabs':
        // Event/Special tabs in EventCallout
        resolve({ 
          x: 20, 
          y: SCREEN_HEIGHT - 320, 
          width: SCREEN_WIDTH - 40, 
          height: 50 
        });
        break;
        
      case '.event-list-item':
        // Individual event card in EventCallout
        resolve({ 
          x: 20, 
          y: SCREEN_HEIGHT - 250, 
          width: SCREEN_WIDTH - 40, 
          height: 100 
        });
        break;
        
      case 'events-tab':
      case '[data-testid="events-tab"]':
        // Events tab in bottom navigation
        resolve({ 
          x: 0, 
          y: SCREEN_HEIGHT - 80, 
          width: SCREEN_WIDTH / 3, 
          height: 80 
        });
        break;
        
      case 'specials-tab':
      case '[data-testid="specials-tab"]':
        // Specials tab in bottom navigation
        resolve({ 
          x: (SCREEN_WIDTH / 3) * 2, 
          y: SCREEN_HEIGHT - 80, 
          width: SCREEN_WIDTH / 3, 
          height: 80 
        });
        break;
        
      case 'profile-tab':
      case '[data-testid="profile-tab"]':
        // Profile/Settings button in header
        resolve({ 
          x: SCREEN_WIDTH - 60, 
          y: 20, 
          width: 40, 
          height: 40 
        });
        break;
        
      case '.events-filter-section':
        // Filter section in Events list screen
        resolve({ 
          x: 0, 
          y: 120, 
          width: SCREEN_WIDTH, 
          height: 100 
        });
        break;
        
      case '.specials-filter-section':
        // Filter section in Specials list screen
        resolve({ 
          x: 0, 
          y: 120, 
          width: SCREEN_WIDTH, 
          height: 100 
        });
        break;
        
      case '.filter-clear-button':
        // Clear filter button in FilterPills - positioned on the right side
        resolve({ 
          x: SCREEN_WIDTH - 100, 
          y: 90, 
          width: 80, 
          height: 30 
        });
        break;
        
      default:
        console.warn(`Tutorial: Unknown selector "${selector}"`);
        resolve(null);
    }
  });
};

/**
 * Find the nearest cluster for tutorial highlighting
 * 
 * UPDATED: Works with actual map store structure from map.tsx
 */
export const findNearestCluster = async (): Promise<ComponentMeasurement | null> => {
  try {
    // Access the global map store that's exposed in map.tsx
    const mapStore = (global as any).mapStore;
    
    if (!mapStore || !mapStore.clusters || mapStore.clusters.length === 0) {
      tutorialLog('No clusters available from map store, using fallback position');
      // Fallback to a reasonable position if no clusters
      return {
        x: SCREEN_WIDTH * 0.4,
        y: SCREEN_HEIGHT * 0.3, 
        width: 80,
        height: 80
      };
    }
    
    const clusters = mapStore.clusters;
    tutorialLog(`Found ${clusters.length} clusters in map store`);
    
    // Filter for clusters that would actually be visible on the map
    // Use the same visibility logic that the map uses
    const visibleClusters = clusters.filter((cluster: any) => {
      // Check if cluster has any events or specials
      const hasContent = (cluster.eventCount > 0) || (cluster.specialCount > 0);
      
      // Check if cluster would pass current filter criteria
      const filterCriteria = mapStore.filterCriteria || {};
      
      // Apply basic filter logic (simplified version of map's logic)
      if (!filterCriteria.showEvents && !filterCriteria.showSpecials) {
        return hasContent; // Show all if no specific filters
      }
      
      if (!filterCriteria.showEvents && cluster.eventCount > 0 && cluster.specialCount === 0) {
        return false; // Events hidden and this cluster only has events
      }
      
      if (!filterCriteria.showSpecials && cluster.specialCount > 0 && cluster.eventCount === 0) {
        return false; // Specials hidden and this cluster only has specials
      }
      
      return hasContent;
    });
    
    if (visibleClusters.length === 0) {
      tutorialLog('No visible clusters found, using fallback');
      return {
        x: SCREEN_WIDTH * 0.4,
        y: SCREEN_HEIGHT * 0.3, 
        width: 80,
        height: 80
      };
    }
    
    // Prioritize clusters for tutorial effectiveness
    const prioritizedClusters = visibleClusters
      .sort((a: any, b: any) => {
        // Priority 1: Clusters with events happening now
        if (a.timeStatus === 'now' && b.timeStatus !== 'now') return -1;
        if (b.timeStatus === 'now' && a.timeStatus !== 'now') return 1;
        
        // Priority 2: Clusters with events happening today
        if (a.timeStatus === 'today' && b.timeStatus === 'future') return -1;
        if (b.timeStatus === 'today' && a.timeStatus === 'future') return 1;
        
        // Priority 3: Clusters with more total events/specials
        const aTotalCount = (a.eventCount || 0) + (a.specialCount || 0);
        const bTotalCount = (b.eventCount || 0) + (b.specialCount || 0);
        return bTotalCount - aTotalCount;
      });
    
    const targetCluster = prioritizedClusters[0];
    tutorialLog('Selected cluster for tutorial:', {
      id: targetCluster.id,
      eventCount: targetCluster.eventCount,
      specialCount: targetCluster.specialCount,
      timeStatus: targetCluster.timeStatus,
      venues: targetCluster.venues?.length || 0
    });
    
    // Calculate cluster position on screen
    // The cluster position depends on the map's current view and zoom level
    
    // For tutorial purposes, we'll position the cluster in an optimal location
    // that allows for good tooltip placement
    
    // Get first venue coordinates as cluster center
    const firstVenue = targetCluster.venues?.[0];
    if (!firstVenue) {
      tutorialLog('No venues in cluster, using fallback');
      return {
        x: SCREEN_WIDTH * 0.4,
        y: SCREEN_HEIGHT * 0.3, 
        width: 80,
        height: 80
      };
    }
    
    // Position cluster in tutorial-friendly location
    // We want it visible but not overlapping with UI elements
    const clusterPosition = {
      x: SCREEN_WIDTH * 0.4 - 40, // Center horizontally with offset
      y: SCREEN_HEIGHT * 0.35 - 40, // Position in upper-middle area
      width: 80, // Generous size for easy tapping
      height: 80
    };
    
    tutorialLog('Cluster position calculated:', clusterPosition);
    return clusterPosition;
    
  } catch (error) {
    tutorialLog('Error finding cluster:', error);
    
    // Fallback position - safe area for tutorial
    return {
      x: SCREEN_WIDTH * 0.4 - 40,
      y: SCREEN_HEIGHT * 0.35 - 40,
      width: 80,
      height: 80
    };
  }
};

/**
 * Check if tutorial should auto-trigger for new users
 */
export const shouldAutoTriggerTutorial = (tutorialStatus: TutorialStatus | null | undefined): boolean => {
  // Auto-trigger if:
  // 1. User has no tutorial status (new user)
  // 2. User has tutorial status but hasn't completed it
  return !tutorialStatus || !tutorialStatus.completed;
};

/**
 * Calculate optimal tooltip position based on target element and screen bounds
 * 
 * UPDATED: Better positioning logic for different screen sizes
 */
export const calculateTooltipPosition = (
  targetPosition: ComponentMeasurement,
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center',
  tooltipWidth: number = 350,
  stepId?: string
): { x: number; y: number } => {
  
  if (placement === 'center') {
    return {
      x: SCREEN_WIDTH / 2,
      y: SCREEN_HEIGHT / 2
    };
  }
  
  // Special positioning for callout steps - position just below filter pills
  if (stepId && ['callout-venue-selector', 'callout-tabs', 'callout-event-details'].includes(stepId)) {
    return {
      x: SCREEN_WIDTH / 2, // Center horizontally
      y: 120 // Just below filter pills (filter pills end around y: 140)
    };
  }
  
  const targetCenterX = targetPosition.x + targetPosition.width / 2;
  const targetCenterY = targetPosition.y + targetPosition.height / 2;
  
  // Calculate base position
  let x = targetCenterX;
  let y = targetCenterY;
  
  // Adjust based on placement with better spacing
  switch (placement) {
    case 'top':
      y = targetPosition.y - 30; // More space above target
      break;
    case 'bottom':
      y = targetPosition.y + targetPosition.height + 30; // More space below target
      break;
    case 'left':
      x = targetPosition.x - 30; // More space left of target
      break;
    case 'right':
      x = targetPosition.x + targetPosition.width + 30; // More space right of target
      break;
  }
  
  // Keep tooltip within screen bounds with better margins
  const margin = 30;
  const tooltipHeight = 200; // Estimate tooltip height
  
  x = Math.max(margin, Math.min(x, SCREEN_WIDTH - tooltipWidth - margin));
  y = Math.max(margin, Math.min(y, SCREEN_HEIGHT - tooltipHeight - margin));
  
  return { x, y };
};

/**
 * Generate a tutorial step completion key for Firestore
 */
export const generateStepKey = (stepId: string, subStepIndex?: number): string => {
  return subStepIndex !== undefined ? `${stepId}-${subStepIndex}` : stepId;
};

/**
 * Check if a tutorial step is an interaction step that requires user action
 */
export const isInteractionStep = (stepId: string): boolean => {
  const interactionSteps = [
    'cluster-click',
    'filter-pills',
    'clear-filters',
    'events-tab',
    'specials-tab',
    'profile-facebook'
  ];
  
  return interactionSteps.includes(stepId);
};

/**
 * Get the next tutorial step index
 */
export const getNextStepIndex = (
  currentStepIndex: number,
  currentSubStep: number,
  totalSteps: number,
  currentStepHasSubSteps: boolean,
  totalSubSteps: number
): { stepIndex: number; subStep: number } => {
  
  // If current step has sub-steps and we haven't finished them
  if (currentStepHasSubSteps && currentSubStep < totalSubSteps - 1) {
    return {
      stepIndex: currentStepIndex,
      subStep: currentSubStep + 1
    };
  }
  
  // Move to next main step
  if (currentStepIndex < totalSteps - 1) {
    return {
      stepIndex: currentStepIndex + 1,
      subStep: 0
    };
  }
  
  // Tutorial completed
  return {
    stepIndex: totalSteps,
    subStep: 0
  };
};

/**
 * Get the previous tutorial step index
 */
export const getPreviousStepIndex = (
  currentStepIndex: number,
  currentSubStep: number,
  previousStepHasSubSteps: boolean,
  previousStepSubStepsCount: number
): { stepIndex: number; subStep: number } => {
  
  // If we're in sub-steps, go to previous sub-step
  if (currentSubStep > 0) {
    return {
      stepIndex: currentStepIndex,
      subStep: currentSubStep - 1
    };
  }
  
  // Move to previous main step
  if (currentStepIndex > 0) {
    const newStepIndex = currentStepIndex - 1;
    
    // If previous step has sub-steps, go to its last sub-step
    if (previousStepHasSubSteps) {
      return {
        stepIndex: newStepIndex,
        subStep: previousStepSubStepsCount - 1
      };
    } else {
      return {
        stepIndex: newStepIndex,
        subStep: 0
      };
    }
  }
  
  // Already at first step
  return {
    stepIndex: 0,
    subStep: 0
  };
};

/**
 * Debug logging for tutorial system
 */
export const tutorialLog = (message: string, data?: any) => {
  console.log(`[GathR Tutorial] ${message}`, data || '');
};

/**
 * Screen dimension utilities
 */
export const SCREEN_DIMENSIONS = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  centerX: SCREEN_WIDTH / 2,
  centerY: SCREEN_HEIGHT / 2
} as const;

/**
 * Common tutorial element sizes
 */
export const TUTORIAL_SIZES = {
  tooltipMaxWidth: 350,
  tooltipMinWidth: 280,
  spotlightMinSize: 40,
  buttonHeight: 44,
  iconSize: 24
} as const;