/**
 * GathR Tutorial System - Step Configuration
 * 
 * This file defines all tutorial steps and their content. Each step represents
 * a specific part of the user onboarding flow with detailed instructions and
 * targeting information for UI elements.
 * 
 * Created: Step 1B of tutorial implementation
 * Dependencies: tutorial.ts types
 * Used by: TutorialManager hook, tutorial components
 */

import React from 'react';
import { TutorialStep } from '../types/tutorial';
import { ClusterExplanationContent } from '../components/tutorial/ClusterExplanationContent';



/**
 * Complete tutorial step configuration
 * 
 * TUTORIAL FLOW:
 * 1. Welcome Screen - Introduction and start/skip options
 * 2. Cluster Clicking - Teach users about map clusters and icons
 * 3. Event Callouts - Multi-step explanation of venue selector, tabs, event details
 * 4. Filter Pills - How to use filtering system
 * 5. Clear Filters - Important step to reset filters
 * 6. Events Tab - Navigate to events list with filters explanation
 * 7. Specials Tab - Navigate to specials list with filters explanation  
 * 8. Profile Facebook - Venue suggestion feature
 * 9. Completion - Celebrate completion and start exploring
 */
export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to GathR!',
    content: 'Let\'s take a quick tour to help you discover amazing local events and specials.',
    placement: 'center',
    sheetPosition: 'center',
    action: 'next'
  },
  
  {
    id: 'cluster-click',
    title: 'Event Clusters - Tap the Marker!',
    content: 'These numbered circles contain information about Events and Specials. \n',
    target: 'closest-cluster', // Will be dynamically set to nearest cluster
    placement: 'bottom',
    sheetPosition: 'bottom',
    action: 'interaction' // User must tap cluster to proceed
  },
  
  {
    id: 'callout-venue-selector',
    title: 'Venue Selection',
    content: 'Venues inside the cluster will be listed here.',
    target: 'venue-selector',
    placement: 'center',
    sheetPosition: 'center',
    action: 'next'
  },

  {
    id: 'callout-tabs',
    title: 'Event Categories',
    content: 'Toggle Between Events, Specials, and Venue Info.',
    target: 'event-tabs',
    placement: 'top',
    sheetPosition: 'top',
    action: 'next'
  },

  {
    id: 'callout-event-details',
    title: 'Event Details',
    content: 'Self Explainatory, click it for more details.',
    target: 'event-list-item',
    placement: 'top',
    sheetPosition: 'top',
    action: 'next'
  },
  
  {
    id: 'filter-pills',
    title: 'Smart Filters',
    content: 'Tapping the Large Button Toggles the group on or off, clicking the down arrow brings customizations.\n\nNotice that you can combine multiple filters!',
    target: 'filter-pills',
    placement: 'bottom',
    sheetPosition: 'center',
    action: 'interaction' // User should try using filters
  },
  
  {
    id: 'clear-filters',
    title: 'Remember:',
    content: 'Don\'t forget to clear your filters!',
    placement: 'center',
    sheetPosition: 'center',
    action: 'next'
  },
  
  {
    id: 'events-tab',
    title: 'Events Tab',
    content: 'If you prefer a news feed style, Tap Events here now to Check them out!',
    target: 'events-tab',
    placement: 'top',
    sheetPosition: 'center',
    action: 'interaction'
  },

  {
    id: 'events-list-explanation',
    title: 'Events Feed',
     content: 'Fully customized to your preferences and location',
    target: 'events-list-area',
    placement: 'top',
    sheetPosition: 'top',
    action: 'next'
  },

  {
    id: 'events-filters',
    title: 'Event Filters',
    content: 'You can combine filters here too!',
    target: 'events-filter-section',
    placement: 'bottom',
    sheetPosition: 'center',
    action: 'next'
  },
  
  {
    id: 'specials-tab',
    title: 'Food & Drink Specials Tab',
    content: 'You can find food and drink specials here! Tap Specials here now to Check them out!.',
    target: 'specials-tab',
    placement: 'top',
    sheetPosition: 'bottom',
    action: 'interaction'
  },

  {
    id: 'specials-list-explanation',
    title: 'Specials Feed',
    content: 'Fully customized to your preferences and location.',
    target: 'specials-list-area',
    placement: 'top',
    sheetPosition: 'top',
    action: 'next'
  },

  {
    id: 'specials-filters',
    title: 'Special Filters',
    content: 'You can combine filters here too!',
    target: 'specials-filter-section',
    placement: 'top',
    sheetPosition: 'bottom',
    action: 'next'
  },
  
  {
    id: 'profile-facebook',
    title: 'Suggest Venues - Tap for Settings!',
    content: 'Last but not least! If you don\'t see your favorite Venues here, you can add their Facebook pages to our list through your profile screen and we\'ll keep an eye on them for you.',
    target: 'profile-button',
    placement: 'bottom',
    sheetPosition: 'center',
    action: 'interaction' // User should navigate to profile
  },
  
  {
    id: 'facebook-submission',
    title: 'Submit Facebook Pages',
    content: 'Tap "Suggest a Facebook Page" to expand this section and submit pages we should monitor.',
    target: 'facebook-submission-component',
    placement: 'top',
    sheetPosition: 'bottom',
    action: 'next'
  },
  
  {
    id: 'completion',
    title: 'You\'re All Set! 🎉',
    content: 'Enjoy discovering amazing local events and specials with GathR!',
    placement: 'center',
    sheetPosition: 'center',
    action: 'next'
  }
];

/**
 * Helper function to get a tutorial step by ID
 */
export const getTutorialStepById = (stepId: string): TutorialStep | undefined => {
  return TUTORIAL_STEPS.find(step => step.id === stepId);
};

/**
 * Helper function to get all step IDs in order
 */
export const getAllStepIds = (): string[] => {
  return TUTORIAL_STEPS.map(step => step.id);
};

/**
 * Helper function to check if a step has sub-steps
 */
export const hasSubSteps = (stepId: string): boolean => {
  const step = getTutorialStepById(stepId);
  return Boolean(step?.multiStep && step?.subSteps?.length);
};

/**
 * Tutorial configuration constants
 */
export const TUTORIAL_CONFIG = {
  // Animation durations
  FADE_DURATION: 300,
  SPOTLIGHT_PULSE_DURATION: 1000,
  TOOLTIP_SLIDE_DURATION: 400,
  
  // Colors
  SPOTLIGHT_COLOR: '#1E90FF',
  OVERLAY_COLOR: 'rgba(0, 0, 0, 0.85)',
  PRIMARY_COLOR: '#1E90FF',
  
  // Spacing and sizes
  TOOLTIP_PADDING: 20,
  SPOTLIGHT_BORDER_WIDTH: 3,
  TOOLTIP_MAX_WIDTH: 360,
  TOOLTIP_BORDER_RADIUS: 16,
  
  // Tutorial behavior
  AUTO_TRIGGER_DELAY: 1000, // Delay before auto-triggering tutorial after interest selection
  CACHE_EXPIRE_TIME: 24 * 60 * 60 * 1000, // 24 hours for any cached data
} as const;