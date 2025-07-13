/**
 * GathR Tutorial System - Type Definitions
 * 
 * This file defines all the TypeScript interfaces and types used throughout
 * the tutorial system. These types ensure type safety and provide clear
 * contracts for tutorial components.
 * 
 * Created: Step 1A of tutorial implementation
 * Dependencies: None - foundational types
 * Used by: All tutorial components, hooks, and configuration
 */

export interface TutorialStatus {
  completed: boolean;
  currentStep: number;
  completedSteps: string[];
  lastTutorialDate?: Date;
}

export interface TutorialStep {
  id: string;
  title: string;
  content?: string;
  target?: string; // CSS selector or component identifier for spotlight
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  sheetPosition?: 'top' | 'bottom' | 'center' | number; // ← NEW: Controls bottom sheet positioning
  action?: 'click' | 'next' | 'interaction';
  multiStep?: boolean; // Indicates if this step has sub-steps
  subSteps?: TutorialSubStep[];
}

export interface TutorialSubStep {
  id: string;
  title: string;
  content?: string;
  target: string; // Required for sub-steps
  action: 'click' | 'next';
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  sheetPosition?: 'top' | 'bottom' | 'center' | number; // ← NEW: Also available for sub-steps
}

/**
 * All possible tutorial step IDs used throughout the system
 * This helps with type safety when referencing specific steps
 */
export type TutorialStepId = 
  | 'welcome'
  | 'cluster-click'
  | 'callout-venue-selector'
  | 'callout-tabs'
  | 'callout-event-details'
  | 'filter-pills'
  | 'clear-filters'
  | 'events-tab'
  | 'events-list-explanation'
  | 'events-filters'
  | 'specials-tab'
  | 'specials-list-explanation'
  | 'specials-filters'
  | 'profile-facebook'
  | 'facebook-submission'
  | 'completion';

/**
 * Component measurement interface for positioning tutorial elements
 */
export interface ComponentMeasurement {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Spotlight configuration for highlighting UI elements
 */
export interface SpotlightConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius?: number;
}

/**
 * Tutorial manager hook return interface
 */
export interface TutorialManager {
  isActive: boolean;
  currentStep: TutorialStep | null;
  currentSubStep: number;
  tutorialStatus: TutorialStatus | null;
  startTutorial: () => void;
  nextStep: () => void;
  previousStep: () => void;
  skipTutorial: () => void;
  completeTutorial: () => void;
  restartTutorial: () => void;
  markStepCompleted: (stepId: string) => void;
}

/**
 * Props for tutorial overlay components
 */
export interface TutorialOverlayProps {
  isVisible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
}

export interface TutorialSpotlightProps {
  spotlight?: SpotlightConfig;
  children?: React.ReactNode;
}

export interface TutorialTooltipProps {
  title: string;
  content?: string;
  onNext?: () => void;
  onPrevious?: () => void;
  onSkip?: () => void;
  showPrevious?: boolean;
  showNext?: boolean;
  showSkip?: boolean;
  nextText?: string;
  position: {
    x: number;
    y: number;
  };
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center';
  sheetPosition?: 'top' | 'bottom' | 'center' | number; // ← NEW: For bottom sheet positioning
}

export interface WelcomeScreenProps {
  onStart: () => void;
  onSkip: () => void;
}

/**
 * Firestore integration types for user document updates
 */
export interface FirestoreUserUpdate {
  tutorialStatus: TutorialStatus;
  lastTutorialDate?: Date;
}