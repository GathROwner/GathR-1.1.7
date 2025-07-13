/**
 * GathR Tutorial System - Main Tutorial Hook
 * 
 * This hook provides the core state management for the tutorial system.
 * It handles tutorial progression, Firestore integration, and coordinates
 * the entire tutorial flow across different screens and steps.
 * 
 * Created: Step 2B1 of tutorial implementation  
 * Dependencies: React, Firebase, tutorial types and config
 * Used by: TutorialManager and any components that need tutorial state
 */

import { useState, useEffect, useCallback } from 'react';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { auth, firestore } from '../config/firebaseConfig';
import { 
  TutorialStatus, 
  TutorialStep, 
  TutorialManager as TutorialManagerInterface 
} from '../types/tutorial';
import { 
  TUTORIAL_STEPS, 
  hasSubSteps, 
  getTutorialStepById 
} from '../config/tutorialSteps';
import { 
  getNextStepIndex, 
  getPreviousStepIndex, 
  tutorialLog 
} from '../utils/tutorialUtils';

/**
 * Main tutorial hook that manages all tutorial state and operations
 */
export const useTutorial = (): TutorialManagerInterface => {

  // Core tutorial state
  const [isActive, setIsActive] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [currentSubStep, setCurrentSubStep] = useState(-1); // Start at -1 for multi-step tutorials
  const [tutorialStatus, setTutorialStatus] = useState<TutorialStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Derived state
  const currentStep = TUTORIAL_STEPS[currentStepIndex] || null;

  /**
   * Load tutorial status from Firestore
   * Called on hook initialization and auth state changes
   */
  const loadTutorialStatus = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      tutorialLog('No authenticated user, skipping tutorial status load');
      return;
    }

    setIsLoading(true);
    
    try {
      tutorialLog('Loading tutorial status for user:', user.uid);
      const userDoc = await getDoc(doc(firestore, 'users', user.uid));
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const status = userData.tutorialStatus || {
          completed: false,
          currentStep: 0,
          completedSteps: []
        };
        
        setTutorialStatus(status);
        tutorialLog('Tutorial status loaded:', status);
      } else {
        tutorialLog('User document not found, creating default tutorial status');
        // User document doesn't exist, create default status
        const defaultStatus: TutorialStatus = {
          completed: false,
          currentStep: 0,
          completedSteps: []
        };
        setTutorialStatus(defaultStatus);
      }
    } catch (error) {
      console.error('Error loading tutorial status:', error);
      tutorialLog('Error loading tutorial status:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Save tutorial status to Firestore
   * Updates both local state and remote database
   */
  const saveTutorialStatus = useCallback(async (status: TutorialStatus) => {
    const user = auth.currentUser;
    if (!user) {
      tutorialLog('No authenticated user, cannot save tutorial status');
      return;
    }

    try {
      tutorialLog('Saving tutorial status:', status);
      
      const updateData = {
        tutorialStatus: {
          ...status,
          lastTutorialDate: new Date()
        }
      };

      await updateDoc(doc(firestore, 'users', user.uid), updateData);
      setTutorialStatus(status);
      
      tutorialLog('Tutorial status saved successfully');
    } catch (error) {
      console.error('Error saving tutorial status:', error);
      tutorialLog('Error saving tutorial status:', error);
    }
  }, []);

  /**
   * Initialize tutorial status on hook mount and auth changes
   */
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        loadTutorialStatus();
      } else {
        setTutorialStatus(null);
        setIsActive(false);
      }
    });

    return () => unsubscribe();
  }, [loadTutorialStatus]);

  /**
   * Start the tutorial from the beginning
   */
  const startTutorial = useCallback(() => {
  tutorialLog('Starting tutorial');
  setIsActive(true);
  setCurrentStepIndex(0);
  setCurrentSubStep(-1); // Start at -1 for proper multi-step flow
  
  // Update tutorial status to indicate start
  if (tutorialStatus) {
    const updatedStatus = {
      ...tutorialStatus,
      currentStep: 0
    };
    saveTutorialStatus(updatedStatus);
  }
  }, [tutorialStatus, saveTutorialStatus]);

  /**
   * Move to the next tutorial step or sub-step
   */
  const nextStep = useCallback(() => {
    if (!currentStep) {
      tutorialLog('No current step, cannot proceed to next');
      return;
    }

    tutorialLog(`Moving to next step from ${currentStep.id} (substep ${currentSubStep})`);

    // Check if current step has sub-steps
    const hasSubStepsInCurrentStep = hasSubSteps(currentStep.id);
    const totalSubSteps = currentStep.subSteps?.length || 0;

    // Calculate next position
    const { stepIndex, subStep } = getNextStepIndex(
      currentStepIndex,
      currentSubStep,
      TUTORIAL_STEPS.length,
      hasSubStepsInCurrentStep,
      totalSubSteps
    );

    // Check if tutorial is complete
    if (stepIndex >= TUTORIAL_STEPS.length) {
      tutorialLog('Tutorial completed');
      completeTutorial();
      return;
    }

    // Update step position
    setCurrentStepIndex(stepIndex);
    setCurrentSubStep(subStep);

    // Save progress
    if (tutorialStatus) {
      const updatedStatus = {
        ...tutorialStatus,
        currentStep: stepIndex,
        completedSteps: [...new Set([...tutorialStatus.completedSteps, currentStep.id])]
      };
      saveTutorialStatus(updatedStatus);
    }

    tutorialLog(`Moved to step ${stepIndex}, substep ${subStep}`);
  }, [currentStep, currentStepIndex, currentSubStep, tutorialStatus, saveTutorialStatus]);

  /**
   * Move to the previous tutorial step or sub-step
   */
  const previousStep = useCallback(() => {
    if (currentStepIndex === 0 && currentSubStep === 0) {
      tutorialLog('Already at first step, cannot go back');
      return;
    }

    tutorialLog(`Moving to previous step from ${currentStepIndex} (substep ${currentSubStep})`);

    // Get previous step info
    const prevStepIndex = currentStepIndex - 1;
    const prevStep = prevStepIndex >= 0 ? TUTORIAL_STEPS[prevStepIndex] : null;
    const prevStepHasSubSteps = prevStep ? hasSubSteps(prevStep.id) : false;
    const prevStepSubStepsCount = prevStep?.subSteps?.length || 0;

    // Calculate previous position
    const { stepIndex, subStep } = getPreviousStepIndex(
      currentStepIndex,
      currentSubStep,
      prevStepHasSubSteps,
      prevStepSubStepsCount
    );

    // Update step position
    setCurrentStepIndex(stepIndex);
    setCurrentSubStep(subStep);

    // Save progress
    if (tutorialStatus) {
      const updatedStatus = {
        ...tutorialStatus,
        currentStep: stepIndex
      };
      saveTutorialStatus(updatedStatus);
    }

    tutorialLog(`Moved to step ${stepIndex}, substep ${subStep}`);
  }, [currentStepIndex, currentSubStep, tutorialStatus, saveTutorialStatus]);

  /**
   * Skip the tutorial without completing it
   */
  const skipTutorial = useCallback(() => {
    tutorialLog('Skipping tutorial');
    setIsActive(false);
    
    if (tutorialStatus) {
      const skippedStatus = {
        ...tutorialStatus,
        completed: false, // Mark as skipped, not completed
        currentStep: 0
      };
      saveTutorialStatus(skippedStatus);
    }
  }, [tutorialStatus, saveTutorialStatus]);

  /**
   * Complete the tutorial and mark as finished
   */
  const completeTutorial = useCallback(() => {
    tutorialLog('Completing tutorial');
    
    const completedStatus: TutorialStatus = {
      completed: true,
      currentStep: TUTORIAL_STEPS.length,
      completedSteps: TUTORIAL_STEPS.map(step => step.id)
    };
    
    saveTutorialStatus(completedStatus);
    
    // Force tutorial to close immediately
    setIsActive(false);
    
    tutorialLog('Tutorial marked as completed and deactivated');
  }, [saveTutorialStatus]);

  /**
   * Restart the tutorial from the beginning
   * Used from profile page for users who want to replay
   */
  const restartTutorial = useCallback(() => {
    tutorialLog('Restarting tutorial');
    
    const resetStatus: TutorialStatus = {
      completed: false,
      currentStep: 0,
      completedSteps: []
    };
    
    saveTutorialStatus(resetStatus);
    startTutorial();
  }, [saveTutorialStatus, startTutorial]);

  /**
   * Mark a specific step as completed
   * Used for tracking individual step completion
   */
  const markStepCompleted = useCallback((stepId: string) => {
    if (!tutorialStatus) {
      tutorialLog('No tutorial status, cannot mark step completed');
      return;
    }

    tutorialLog(`Marking step completed: ${stepId}`);

    const updatedStatus: TutorialStatus = {
      ...tutorialStatus,
      completedSteps: [...new Set([...tutorialStatus.completedSteps, stepId])],
      currentStep: currentStepIndex + 1
    };
    
    saveTutorialStatus(updatedStatus);
  }, [tutorialStatus, currentStepIndex, saveTutorialStatus]);

  return {
    // State
    isActive,
    currentStep,
    currentSubStep,
    tutorialStatus,
    
    // Actions
    startTutorial,
    nextStep,
    previousStep,
    skipTutorial,
    completeTutorial,
    restartTutorial,
    markStepCompleted
  };
};

/**
 * HOOK ARCHITECTURE NOTES:
 * 
 * 1. State Management:
 *    - Uses React hooks for local state management
 *    - Integrates with Firestore for persistence
 *    - Handles both main steps and sub-steps
 * 
 * 2. Firestore Integration:
 *    - Loads tutorial status on auth state change
 *    - Saves progress after each step
 *    - Handles network errors gracefully
 * 
 * 3. Step Navigation:
 *    - Complex logic for multi-step navigation
 *    - Handles sub-steps within main steps
 *    - Tracks completion progress
 * 
 * 4. Error Handling:
 *    - Comprehensive error logging
 *    - Graceful fallbacks for network issues
 *    - Debug logging for development
 * 
 * 5. Performance:
 *    - Uses useCallback for all functions
 *    - Minimizes re-renders with proper dependencies
 *    - Efficient Firestore operations
 * 
 * INTEGRATION POINTS:
 * 
 * 1. Authentication:
 *    - Listens to auth state changes
 *    - Handles user login/logout scenarios
 * 
 * 2. Firestore Document Structure:
 *    - Adds tutorialStatus field to user documents
 *    - Maintains backward compatibility
 * 
 * 3. External Triggers:
 *    - Can be triggered from interest selection
 *    - Can be restarted from profile page
 * 
 * 4. Cross-Screen Coordination:
 *    - Maintains state across navigation
 *    - Handles app backgrounding/foregrounding
 */