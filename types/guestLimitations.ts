// ===============================================================
// FILE: src/types/guestLimitations.ts
// PURPOSE: Define TypeScript types and enums for guest limitation system
// DESCRIPTION: This file contains all the type definitions needed for tracking
//              guest user interactions and managing registration prompts
// ===============================================================

/**
 * Enum defining all possible user interactions that count toward the guest limitation
 * Each interaction represents a meaningful engagement with the app that should
 * encourage guest users to register for full access
 */
export enum InteractionType {
  // Map Cluster Interactions - When users interact with event clusters on the map
  CLUSTER_CLICK = 'cluster_click',           // User clicks on a cluster to expand it
  CLUSTER_SCROLL = 'cluster_scroll',         // User scrolls through events within a cluster
  CLUSTER_ITEM_CLICK = 'cluster_item_click', // User clicks on specific event in cluster
  CLUSTER_VENUE_CHANGE = 'cluster_venue_change', // User changes venue within cluster view
  CLUSTER_TAB_CHANGE = 'cluster_tab_change', // User switches between Events/Specials/Venue tabs
  
  // List View Interactions - When users interact with the list views
  LIST_TAB_SELECT = 'list_tab_select',       // User selects Events or Specials tab in bottom nav
  LIST_FILTER = 'list_filter',               // User applies any filter to the list
  LIST_SCROLL = 'list_scroll',               // User scrolls through the event/special list
  LIST_ITEM_CLICK = 'list_item_click',       // User clicks on an event/special item
  LIST_PAGINATION = 'list_pagination'        // User navigates to next page of results
}

/**
 * Interface for the guest limitation store state
 * Manages interaction counting and prompt display logic
 */
export interface GuestLimitationState {
  // Core interaction tracking
  interactionCount: number;           // Total interactions since last prompt reset
  hasSeenFirstPrompt: boolean;        // Whether user has seen the initial registration prompt
  isPromptVisible: boolean;           // Whether the registration prompt is currently showing
  lastInteractionTime: number;        // Timestamp of last interaction (for session management)
  
  // Session management
  sessionStartTime: number;           // When the current session started
  totalSessionInteractions: number;   // Total interactions in current session
}

/**
 * Interface for the guest limitation store actions
 * Defines all methods available for managing guest limitations
 */
export interface GuestLimitationActions {
  // Interaction management
  incrementInteraction: (type: InteractionType) => boolean; // Returns true if interaction allowed
  resetInteractionCount: () => void;                        // Reset counter (after prompt)
  
  // Prompt management
  showPrompt: () => void;                                   // Show the registration prompt
  hidePrompt: () => void;                                   // Hide the registration prompt
  markFirstPromptSeen: () => void;                          // Mark that user has seen first prompt
  
  // Session management
  startNewSession: () => void;                              // Start a new user session
  checkShouldShowPrompt: () => boolean;                     // Check if prompt should be shown
  
  // Utility methods
  getInteractionLimit: () => number;                        // Get current interaction limit
  canPerformInteraction: (type: InteractionType) => boolean; // Check if interaction is allowed
  
  // Private/internal methods (exposed for internal store use)
  _getDailyPromptCount: () => number;                       // Get daily prompt count
  _incrementDailyPromptCount: () => void;                   // Increment daily prompt count
  
  // Initialization methods
  initializeFromStorage: () => Promise<void>;               // Initialize from AsyncStorage
  clearStorage: () => Promise<void>;                        // Clear all stored data
}

/**
 * Combined interface for the complete guest limitation store
 * This is what components will use when accessing the store
 */
export interface GuestLimitationStore extends GuestLimitationState, GuestLimitationActions {}

/**
 * Configuration interface for guest limitation settings
 * Allows easy adjustment of limitation parameters
 */
export interface GuestLimitationConfig {
  initialInteractionLimit: number;     // Interactions allowed before first prompt (default: 3)
  subsequentInteractionLimit: number;  // Interactions allowed after first prompt (default: 5)
  sessionTimeoutMinutes: number;       // Minutes before session expires (default: 30)
  maxDailyPrompts: number;            // Maximum prompts per day (default: 3)
}

/**
 * Interface for registration prompt configuration
 * Defines the content and behavior of the registration prompt
 */
export interface RegistrationPromptConfig {
  title: string;                      // Main prompt title
  subtitle: string;                   // Prompt subtitle/description
  benefits: string[];                 // List of registration benefits to display
  primaryButtonText: string;          // Text for main registration button
  secondaryButtonText?: string;       // Text for secondary action (if any)
  showDismissOption: boolean;         // Whether to show "Maybe later" option
}

/**
 * Interface for content limitation settings
 * Defines how content should be truncated for guest users
 */
export interface ContentLimitationConfig {
  // Text truncation settings
  maxDescriptionLength: number;       // Max characters in event descriptions
  maxTitleLength: number;            // Max characters in event titles
  
  // List view limitations
  maxListItems: number;              // Max items to show in lists before limitation
  showPreviewCount: number;          // Number of items to show as preview
  
  // Map limitations
  showVenueNamesOnly: boolean;       // Whether to show only venue names in clusters
  maxClusterEventsPreview: number;   // Max events to preview in cluster popup
}

/**
 * Type for tracking interaction history
 * Used for analytics and optimization
 */
export interface InteractionHistoryEntry {
  type: InteractionType;             // Type of interaction
  timestamp: number;                 // When it occurred
  sessionId: string;                 // Session identifier
  promptShown: boolean;              // Whether this interaction triggered a prompt
}

/**
 * Default configuration values
 * These can be imported and used as fallbacks
 */
export const DEFAULT_GUEST_LIMITATION_CONFIG: GuestLimitationConfig = {
  initialInteractionLimit: 3,
  subsequentInteractionLimit: 5,
  sessionTimeoutMinutes: 30,
  maxDailyPrompts: 3
};

export const DEFAULT_REGISTRATION_PROMPT_CONFIG: RegistrationPromptConfig = {
  title: "Unlock Full Access",
  subtitle: "Register now to unlock all features",
  benefits: [
    "Unlock Event Details",
    "Customize Your Recommendations",
    "Save Favorite Events",
    "Get Personalized Filters"
  ],
  primaryButtonText: "Register Now",
  secondaryButtonText: "Maybe Later",
  showDismissOption: true
};

export const DEFAULT_CONTENT_LIMITATION_CONFIG: ContentLimitationConfig = {
  maxDescriptionLength: 100,
  maxTitleLength: 50,
  maxListItems: 10,
  showPreviewCount: 3,
  showVenueNamesOnly: true,
  maxClusterEventsPreview: 2
};