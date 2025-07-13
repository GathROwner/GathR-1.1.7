// ===============================================================
// FILE: GathR/stores/guestLimitationStore.ts
// PURPOSE: Zustand store for managing guest user limitations and registration prompts
// DESCRIPTION: This store tracks user interactions, manages prompt display logic,
//              and determines when guest users should be prompted to register
// FIXED: Applied module-level pattern to prevent rendering loops
// ENHANCED: Added comprehensive Firebase Analytics integration
// ===============================================================

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GuestLimitationStore,
  InteractionType,
  GuestLimitationConfig,
  DEFAULT_GUEST_LIMITATION_CONFIG,
  InteractionHistoryEntry
} from '../types/guestLimitations';

// 🔥 ANALYTICS INTEGRATION: Import analytics service
import * as Analytics from '../utils/analytics';

// Storage keys for persisting data across app sessions
const STORAGE_KEYS = {
  INTERACTION_COUNT: 'guest_interaction_count',
  HAS_SEEN_FIRST_PROMPT: 'guest_has_seen_first_prompt',
  LAST_PROMPT_DATE: 'guest_last_prompt_date',
  SESSION_START: 'guest_session_start',
  DAILY_PROMPT_COUNT: 'guest_daily_prompt_count',
  SCROLL_SESSIONS: 'guest_scroll_sessions'
};

// =============================================
// MODULE-LEVEL SCROLL SESSION MANAGEMENT
// (Following the same pattern as the rendering loop fix)
// =============================================

/**
 * Interface for tracking scroll sessions per tab
 */
interface ScrollSession {
  hasScrolled: boolean;
  sessionId: string;
  startTime: number;
}

/**
 * Interface for managing scroll sessions across different tabs/screens
 */
interface ScrollSessions {
  events: ScrollSession;
  specials: ScrollSession;
}

/**
 * Generate a unique session ID for tracking purposes
 */
const generateSessionId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

/**
 * Create a new scroll session
 */
const createNewScrollSession = (): ScrollSession => ({
  hasScrolled: false,
  sessionId: generateSessionId(),
  startTime: Date.now()
});

/**
 * Module-level scroll sessions (OUTSIDE the store to prevent recreation)
 */
let moduleScrollSessions: ScrollSessions = {
  events: createNewScrollSession(),
  specials: createNewScrollSession()
};

/**
 * Module-level initialization flag to prevent multiple store initializations
 */
let isStoreInitialized = false;

/**
 * Check if it's a new day since the last prompt
 */
const isNewDay = (lastDate: string): boolean => {
  const today = new Date().toDateString();
  const last = new Date(lastDate).toDateString();
  return today !== last;
};

/**
 * Guest Limitation Store
 * 
 * CLEAN STORE - No scroll session state inside (prevents rendering loops)
 * ENHANCED - Comprehensive analytics tracking for guest behavior
 */
export const useGuestLimitationStore = create<GuestLimitationStore>((set, get) => ({
  // =============================================
  // STATE PROPERTIES (CLEAN - NO SCROLL SESSIONS)
  // =============================================
  
  // Core interaction tracking
  interactionCount: 0,
  hasSeenFirstPrompt: false,
  isPromptVisible: false,
  lastInteractionTime: Date.now(),
  
  // Session management
  sessionStartTime: Date.now(),
  totalSessionInteractions: 0,
  
  // =============================================
  // CORE ACTION METHODS
  // =============================================
  
  /**
   * Increment interaction count and check if prompt should be shown
   * 🔥 ENHANCED: Added comprehensive analytics tracking
   */
  incrementInteraction: (type: InteractionType): boolean => {
    const state = get();
    const config = DEFAULT_GUEST_LIMITATION_CONFIG;
    
    // Log the interaction for debugging
    console.log(`[GuestLimitation] Interaction: ${type}, Count: ${state.interactionCount + 1}`);
    
    // Update interaction counts
    const newCount = state.interactionCount + 1;
    const newTotalCount = state.totalSessionInteractions + 1;
    
    set({
      interactionCount: newCount,
      totalSessionInteractions: newTotalCount,
      lastInteractionTime: Date.now()
    });
    
    // Persist the updated count
    AsyncStorage.setItem(STORAGE_KEYS.INTERACTION_COUNT, newCount.toString());
    
    // 🔥 ANALYTICS: Track guest interaction with detailed context
    Analytics.logEvent('guest_interaction', {
      interaction_type: type,
      interaction_count: newCount,
      total_session_interactions: newTotalCount,
      has_seen_first_prompt: state.hasSeenFirstPrompt,
      is_prompt_visible: state.isPromptVisible,
      session_duration_ms: Date.now() - state.sessionStartTime,
      interaction_limit: state.getInteractionLimit(),
      interactions_remaining: state.getInteractionLimit() - newCount,
      time_since_last_interaction_ms: Date.now() - state.lastInteractionTime
    });
    
    // Check if we should show prompt
    if (state.checkShouldShowPrompt()) {
      console.log('[GuestLimitation] Showing registration prompt');
      
      // 🔥 ANALYTICS: Track limitation hit with detailed context
      Analytics.logEvent('guest_limitation_hit', {
        trigger_interaction: type,
        interaction_count: newCount,
        interaction_limit: state.getInteractionLimit(),
        is_first_prompt: !state.hasSeenFirstPrompt,
        session_duration_ms: Date.now() - state.sessionStartTime,
        total_session_interactions: newTotalCount,
        last_interaction_gap_ms: Date.now() - state.lastInteractionTime
      });
      
      // Track limitation effectiveness for optimization
      Analytics.trackFeatureEngagement('guest_limitation_system', {
        limitation_triggered: true,
        interactions_to_limit: newCount,
        prompt_type: state.hasSeenFirstPrompt ? 'subsequent' : 'initial',
        user_engagement_level: newTotalCount > 10 ? 'high' : newTotalCount > 5 ? 'medium' : 'low'
      });
      
      state.showPrompt();
      return false; // Block the interaction
    }
    
    // 🔥 ANALYTICS: Track allowed interactions for baseline metrics
    Analytics.logEvent('guest_interaction_allowed', {
      interaction_type: type,
      interaction_count: newCount,
      limit_proximity: (state.getInteractionLimit() - newCount) <= 1 ? 'close' : 'safe'
    });
    
    return true; // Allow the interaction
  },
  
  /**
   * Reset the interaction counter (called after prompt is shown)
   * 🔥 ENHANCED: Added analytics tracking
   */
  resetInteractionCount: (): void => {
    const state = get();
    const previousCount = state.interactionCount;
    
    console.log('[GuestLimitation] Resetting interaction count');
    set({ interactionCount: 0 });
    AsyncStorage.setItem(STORAGE_KEYS.INTERACTION_COUNT, '0');
    
    // 🔥 ANALYTICS: Track interaction resets
    Analytics.logEvent('guest_interaction_reset', {
      previous_count: previousCount,
      total_session_interactions: state.totalSessionInteractions,
      session_duration_ms: Date.now() - state.sessionStartTime,
      reset_reason: 'prompt_dismissed'
    });
  },
  
  /**
   * Show the registration prompt overlay
   * 🔥 ENHANCED: Added analytics tracking for prompt effectiveness
   */
  showPrompt: (): void => {
    const state = get();
    const promptStartTime = Date.now();
    
    console.log('[GuestLimitation] Showing prompt');
    
    set({ 
      isPromptVisible: true,
      hasSeenFirstPrompt: true 
    });
    
    // Persist that user has seen first prompt
    AsyncStorage.setItem(STORAGE_KEYS.HAS_SEEN_FIRST_PROMPT, 'true');
    AsyncStorage.setItem(STORAGE_KEYS.LAST_PROMPT_DATE, new Date().toISOString());
    
    // Update daily prompt count
    state._incrementDailyPromptCount();
    
    // 🔥 ANALYTICS: Track prompt display with comprehensive context
    Analytics.logEvent('guest_prompt_shown', {
      prompt_type: state.hasSeenFirstPrompt ? 'subsequent' : 'initial',
      interaction_count: state.interactionCount,
      session_duration_ms: Date.now() - state.sessionStartTime,
      total_session_interactions: state.totalSessionInteractions,
      daily_prompt_count: state._getDailyPromptCount(),
      prompt_timing: Date.now() - state.lastInteractionTime < 5000 ? 'immediate' : 'delayed'
    });
    
    // Track registration prompt funnel for conversion analysis
    Analytics.trackFeatureEngagement('registration_prompt_displayed', {
      user_engagement_score: state.totalSessionInteractions,
      session_length_category: (Date.now() - state.sessionStartTime) > 300000 ? 'long' : 'short',
      prompt_frequency: state.hasSeenFirstPrompt ? 'repeat' : 'first_time'
    });
    
    // Set up analytics tracking for prompt interaction timing
    setTimeout(() => {
      if (get().isPromptVisible) {
        Analytics.logEvent('guest_prompt_lingering', {
          display_duration_ms: Date.now() - promptStartTime,
          likely_reading: Date.now() - promptStartTime > 3000
        });
      }
    }, 5000); // Track if prompt is still visible after 5 seconds
  },
  
  /**
   * Hide the registration prompt overlay
   * 🔥 ENHANCED: Added analytics tracking for prompt outcomes
   */
  hidePrompt: (): void => {
    const state = get();
    const promptDisplayTime = Date.now() - state.lastInteractionTime;
    
    console.log('[GuestLimitation] Hiding prompt');
    set({ isPromptVisible: false });
    
    // 🔥 ANALYTICS: Track prompt dismissal with interaction data
    Analytics.logEvent('guest_prompt_dismissed', {
      display_duration_ms: promptDisplayTime,
      interaction_count_when_dismissed: state.interactionCount,
      total_session_interactions: state.totalSessionInteractions,
      session_duration_ms: Date.now() - state.sessionStartTime,
      dismissal_speed: promptDisplayTime < 2000 ? 'fast' : promptDisplayTime < 10000 ? 'normal' : 'slow',
      user_engagement_level: state.totalSessionInteractions > 15 ? 'high' : 
                            state.totalSessionInteractions > 8 ? 'medium' : 'low'
    });
    
    // Track conversion funnel step
    Analytics.trackFeatureEngagement('registration_prompt_dismissed', {
      conversion_success: false,
      engagement_before_dismissal: state.totalSessionInteractions,
      time_to_dismissal_ms: promptDisplayTime
    });
    
    // Reset interaction count after prompt is dismissed
    get().resetInteractionCount();
  },
  
  /**
   * Mark that the user has seen their first prompt
   * 🔥 ENHANCED: Added analytics tracking
   */
  markFirstPromptSeen: (): void => {
    const state = get();
    
    set({ hasSeenFirstPrompt: true });
    AsyncStorage.setItem(STORAGE_KEYS.HAS_SEEN_FIRST_PROMPT, 'true');
    
    // 🔥 ANALYTICS: Track first prompt milestone
    Analytics.logEvent('guest_first_prompt_milestone', {
      interactions_to_first_prompt: state.interactionCount,
      session_duration_to_first_prompt_ms: Date.now() - state.sessionStartTime,
      total_session_interactions: state.totalSessionInteractions
    });
  },
  
  /**
   * Start a new user session
   * 🔥 ENHANCED: Added analytics tracking for session management
   */
  startNewSession: (): void => {
    const sessionId = generateSessionId();
    const previousSessionDuration = Date.now() - get().sessionStartTime;
    
    console.log(`[GuestLimitation] Starting new session: ${sessionId}`);
    
    set({
      sessionStartTime: Date.now(),
      totalSessionInteractions: 0,
      lastInteractionTime: Date.now()
    });
    
    // Reset module-level scroll sessions
    moduleScrollSessions = {
      events: createNewScrollSession(),
      specials: createNewScrollSession()
    };
    
    AsyncStorage.setItem(STORAGE_KEYS.SESSION_START, Date.now().toString());
    
    // 🔥 ANALYTICS: Track session boundaries for user behavior analysis
    if (previousSessionDuration > 0) {
      Analytics.logEvent('guest_session_ended', {
        session_duration_ms: previousSessionDuration,
        total_interactions: get().totalSessionInteractions
      });
    }
    
    Analytics.logEvent('guest_session_started', {
      session_id: sessionId,
      has_seen_first_prompt: get().hasSeenFirstPrompt,
      is_returning_user: get().hasSeenFirstPrompt
    });
    
    // Track session start as feature engagement
    Analytics.trackFeatureEngagement('guest_session_management', {
      session_type: 'new_session',
      previous_session_duration_ms: previousSessionDuration > 0 ? previousSessionDuration : null
    });
  },
  
  // =============================================
  // LOGIC AND UTILITY METHODS
  // =============================================
  
  /**
   * Check if the registration prompt should be shown
   * 🔥 ENHANCED: Added analytics for prompt decision logic
   */
  checkShouldShowPrompt: (): boolean => {
    const state = get();
    const config = DEFAULT_GUEST_LIMITATION_CONFIG;
    
    // Don't show if prompt is already visible
    if (state.isPromptVisible) return false;
    
    // Check daily prompt limit
    const dailyCount = state._getDailyPromptCount();
    if (dailyCount >= config.maxDailyPrompts) {
      console.log('[GuestLimitation] Daily prompt limit reached');
      
      // 🔥 ANALYTICS: Track daily limit hits for optimization
      Analytics.logEvent('guest_daily_limit_reached', {
        daily_prompt_count: dailyCount,
        daily_limit: config.maxDailyPrompts,
        current_interaction_count: state.interactionCount,
        session_duration_ms: Date.now() - state.sessionStartTime
      });
      
      return false;
    }
    
    // Determine interaction limit based on whether user has seen first prompt
    const limit = state.hasSeenFirstPrompt 
      ? config.subsequentInteractionLimit 
      : config.initialInteractionLimit;
    
    console.log(`[GuestLimitation] Checking prompt: ${state.interactionCount}/${limit}, hasSeenFirst: ${state.hasSeenFirstPrompt}`);
    
    const shouldShow = state.interactionCount >= limit;
    
    // 🔥 ANALYTICS: Track prompt decision logic for optimization
    Analytics.logEvent('guest_prompt_decision', {
      should_show_prompt: shouldShow,
      interaction_count: state.interactionCount,
      interaction_limit: limit,
      has_seen_first_prompt: state.hasSeenFirstPrompt,
      daily_prompt_count: dailyCount,
      proximity_to_limit: limit - state.interactionCount
    });
    
    return shouldShow;
  },
  
  /**
   * Get the current interaction limit
   */
  getInteractionLimit: (): number => {
    const state = get();
    const config = DEFAULT_GUEST_LIMITATION_CONFIG;
    
    return state.hasSeenFirstPrompt 
      ? config.subsequentInteractionLimit 
      : config.initialInteractionLimit;
  },
  
  /**
   * Check if a specific interaction type can be performed
   * 🔥 ENHANCED: Added analytics for interaction permission checking
   */
  canPerformInteraction: (type: InteractionType): boolean => {
    const state = get();
    
    // If prompt is visible, no interactions are allowed
    if (state.isPromptVisible) {
      // 🔥 ANALYTICS: Track blocked interactions due to visible prompt
      Analytics.logEvent('interaction_blocked_by_prompt', {
        attempted_interaction: type,
        interaction_count: state.interactionCount
      });
      return false;
    }
    
    // Check if next interaction would trigger prompt
    const wouldTriggerPrompt = (state.interactionCount + 1) >= state.getInteractionLimit();
    
    if (wouldTriggerPrompt) {
      // 🔥 ANALYTICS: Track interactions that would trigger limitations
      Analytics.logEvent('interaction_would_trigger_limit', {
        interaction_type: type,
        current_count: state.interactionCount,
        limit: state.getInteractionLimit()
      });
    }
    
    return !wouldTriggerPrompt;
  },
  
  // =============================================
  // PRIVATE/INTERNAL METHODS
  // =============================================
  
  /**
   * Get the daily prompt count from storage
   */
  _getDailyPromptCount: (): number => {
    // This would typically be implemented with AsyncStorage
    // For now, return 0 to allow prompts
    return 0;
  },
  
  /**
   * Increment the daily prompt count
   * 🔥 ENHANCED: Added analytics tracking
   */
  _incrementDailyPromptCount: (): void => {
    // Implementation would increment daily counter in AsyncStorage
    console.log('[GuestLimitation] Incrementing daily prompt count');
    
    // 🔥 ANALYTICS: Track daily prompt frequency
    Analytics.logEvent('daily_prompt_count_incremented', {
      new_daily_count: get()._getDailyPromptCount() + 1,
      session_prompt_number: 1 // Would track multiple prompts per session
    });
  },
  
  // =============================================
  // INITIALIZATION AND PERSISTENCE
  // =============================================
  
  /**
   * Initialize the store from persisted data
   * 🔥 ENHANCED: Added analytics for initialization tracking
   */
  initializeFromStorage: async (): Promise<void> => {
    try {
      console.log('[GuestLimitation] Initializing from storage');
      
      const initStartTime = Date.now();
      
      // Load persisted values
      const [
        interactionCount,
        hasSeenFirstPrompt,
        sessionStart,
        scrollSessionsData
      ] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.INTERACTION_COUNT),
        AsyncStorage.getItem(STORAGE_KEYS.HAS_SEEN_FIRST_PROMPT),
        AsyncStorage.getItem(STORAGE_KEYS.SESSION_START),
        AsyncStorage.getItem(STORAGE_KEYS.SCROLL_SESSIONS)
      ]);
      
      // Parse and set values
      const count = interactionCount ? parseInt(interactionCount, 10) : 0;
      const hasSeenPrompt = hasSeenFirstPrompt === 'true';
      const sessionTime = sessionStart ? parseInt(sessionStart, 10) : Date.now();
      
      // Parse scroll sessions and set at module level (not in store state)
      try {
        const parsedScrollSessions = scrollSessionsData 
          ? JSON.parse(scrollSessionsData)
          : null;
        
        if (parsedScrollSessions && parsedScrollSessions.events && parsedScrollSessions.specials) {
          moduleScrollSessions = parsedScrollSessions;
        } else {
          // Create new sessions if invalid data
          moduleScrollSessions = {
            events: createNewScrollSession(),
            specials: createNewScrollSession()
          };
        }
      } catch (error) {
        console.warn('[GuestLimitation] Invalid scroll sessions data, creating new:', error);
        moduleScrollSessions = {
          events: createNewScrollSession(),
          specials: createNewScrollSession()
        };
      }
      
      set({
        interactionCount: count,
        hasSeenFirstPrompt: hasSeenPrompt,
        sessionStartTime: sessionTime,
        lastInteractionTime: Date.now()
      });
      
      console.log(`[GuestLimitation] Initialized - Count: ${count}, HasSeenPrompt: ${hasSeenPrompt}`);
      
      // 🔥 ANALYTICS: Track successful initialization
      const initDuration = Date.now() - initStartTime;
      Analytics.logEvent('guest_limitation_initialized', {
        initialization_duration_ms: initDuration,
        persisted_interaction_count: count,
        has_seen_first_prompt: hasSeenPrompt,
        is_returning_session: count > 0 || hasSeenPrompt,
        data_recovery_success: true
      });
      
      // Track user type classification for analytics
      Analytics.trackFeatureEngagement('guest_user_classification', {
        user_type: hasSeenPrompt ? 'returning_guest' : 'new_guest',
        interaction_history_count: count,
        has_previous_sessions: sessionTime < Date.now() - 86400000 // More than 24h ago
      });
      
    } catch (error) {
      console.error('[GuestLimitation] Error initializing from storage:', error);
      
      // 🔥 ANALYTICS: Track initialization failures
      Analytics.trackError('guest_limitation_init_error',
        error instanceof Error ? error.message : 'Unknown initialization error',
        {
          error_type: 'storage_initialization',
          recovery_action: 'fresh_state'
        }
      );
      
      // If there's an error, start with fresh state
      get().startNewSession();
    }
  },
  
  /**
   * Clear all persisted data (useful for testing or reset)
   * 🔥 ENHANCED: Added analytics tracking
   */
  clearStorage: async (): Promise<void> => {
    try {
      const previousState = get();
      
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.INTERACTION_COUNT),
        AsyncStorage.removeItem(STORAGE_KEYS.HAS_SEEN_FIRST_PROMPT),
        AsyncStorage.removeItem(STORAGE_KEYS.LAST_PROMPT_DATE),
        AsyncStorage.removeItem(STORAGE_KEYS.SESSION_START),
        AsyncStorage.removeItem(STORAGE_KEYS.DAILY_PROMPT_COUNT),
        AsyncStorage.removeItem(STORAGE_KEYS.SCROLL_SESSIONS)
      ]);
      
      // Reset state
      set({
        interactionCount: 0,
        hasSeenFirstPrompt: false,
        isPromptVisible: false,
        sessionStartTime: Date.now(),
        totalSessionInteractions: 0
      });
      
      // Reset module-level scroll sessions
      moduleScrollSessions = {
        events: createNewScrollSession(),
        specials: createNewScrollSession()
      };
      
      console.log('[GuestLimitation] Storage cleared');
      
      // 🔥 ANALYTICS: Track storage clearing (useful for debugging and user support)
      Analytics.logEvent('guest_limitation_storage_cleared', {
        previous_interaction_count: previousState.interactionCount,
        previous_has_seen_prompt: previousState.hasSeenFirstPrompt,
        previous_session_duration_ms: Date.now() - previousState.sessionStartTime,
        clear_reason: 'manual_reset' // Could be extended for different reasons
      });
      
    } catch (error) {
      console.error('[GuestLimitation] Error clearing storage:', error);
      
      // 🔥 ANALYTICS: Track storage clearing errors
      Analytics.trackError('guest_limitation_clear_error',
        error instanceof Error ? error.message : 'Unknown clear error',
        { operation: 'storage_clear' }
      );
    }
  }
}));

// =============================================
// MODULE-LEVEL SCROLL SESSION FUNCTIONS
// (Following the same pattern as the rendering loop fix)
// 🔥 ENHANCED: Added analytics tracking to all functions
// =============================================

/**
 * Reset scroll session for a specific tab (called when tab is selected)
 * 🔥 ENHANCED: Added analytics tracking
 */
export const resetScrollSession = (tabName: 'events' | 'specials'): void => {
  console.log(`[GuestLimitation] Resetting scroll session for ${tabName}`);
  
  const previousSession = moduleScrollSessions[tabName];
  const sessionDuration = Date.now() - previousSession.startTime;
  
  const newSession = createNewScrollSession();
  moduleScrollSessions[tabName] = newSession;
  
  // Persist scroll sessions
  AsyncStorage.setItem(STORAGE_KEYS.SCROLL_SESSIONS, JSON.stringify(moduleScrollSessions));
  
  // 🔥 ANALYTICS: Track scroll session resets
  Analytics.logEvent('guest_scroll_session_reset', {
    tab_name: tabName,
    previous_session_duration_ms: sessionDuration,
    previous_session_had_scroll: previousSession.hasScrolled,
    new_session_id: newSession.sessionId
  });
  
  // Track tab switching behavior
  Analytics.trackFeatureEngagement('guest_tab_navigation', {
    tab_selected: tabName,
    session_reset: true,
    previous_engagement: previousSession.hasScrolled ? 'scrolled' : 'no_scroll'
  });
};

/**
 * Mark that user has scrolled in a specific tab session
 * 🔥 ENHANCED: Added analytics tracking
 */
export const markTabScrolled = (tabName: 'events' | 'specials'): void => {
  console.log(`[GuestLimitation] Marking ${tabName} as scrolled`);
  
  const session = moduleScrollSessions[tabName];
  const timeToFirstScroll = Date.now() - session.startTime;
  
  moduleScrollSessions[tabName].hasScrolled = true;
  
  // Persist scroll sessions
  AsyncStorage.setItem(STORAGE_KEYS.SCROLL_SESSIONS, JSON.stringify(moduleScrollSessions));
  
  // 🔥 ANALYTICS: Track first scroll in session
  Analytics.logEvent('guest_first_scroll_in_session', {
    tab_name: tabName,
    time_to_first_scroll_ms: timeToFirstScroll,
    session_id: session.sessionId,
    scroll_timing: timeToFirstScroll < 1000 ? 'immediate' : 
                   timeToFirstScroll < 5000 ? 'quick' : 'delayed'
  });
  
  // Track scroll engagement patterns
  Analytics.trackFeatureEngagement('guest_content_engagement', {
    engagement_type: 'scroll_start',
    content_type: tabName,
    engagement_speed: timeToFirstScroll < 2000 ? 'fast' : 'normal'
  });
};

/**
 * Check if user has already scrolled in the current tab session
 */
export const hasScrolledInSession = (tabName: 'events' | 'specials'): boolean => {
  return moduleScrollSessions[tabName].hasScrolled;
};

/**
 * Track tab selection interaction and reset scroll session
 * 🔥 ENHANCED: Added analytics tracking
 */
export const trackTabSelect = (tabName: 'events' | 'specials'): boolean => {
  console.log(`[GuestLimitation] Tab select: ${tabName}`);
  
  const store = useGuestLimitationStore.getState();
  
  // 🔥 ANALYTICS: Track tab selection before interaction counting
  Analytics.logEvent('guest_tab_selected', {
    tab_name: tabName,
    current_interaction_count: store.interactionCount,
    session_duration_ms: Date.now() - store.sessionStartTime,
    total_session_interactions: store.totalSessionInteractions,
    has_seen_first_prompt: store.hasSeenFirstPrompt
  });
  
  // Reset scroll session for this tab
  resetScrollSession(tabName);
  
  // Track the tab selection as an interaction
  const interactionAllowed = store.incrementInteraction(InteractionType.LIST_TAB_SELECT);
  
  // 🔥 ANALYTICS: Track tab selection outcome
  Analytics.logEvent('guest_tab_interaction_result', {
    tab_name: tabName,
    interaction_allowed: interactionAllowed,
    triggered_limitation: !interactionAllowed,
    interaction_count_after: store.interactionCount
  });
  
  return interactionAllowed;
};

/**
 * Track scroll interaction for a specific tab (once per session)
 * 🔥 ENHANCED: Added analytics tracking
 */
export const trackScrollInteraction = (tabName: 'events' | 'specials'): boolean => {
  const store = useGuestLimitationStore.getState();
  
  // Check if already scrolled this session
  if (hasScrolledInSession(tabName)) {
    console.log(`[GuestLimitation] Already scrolled in ${tabName} session - no interaction tracked`);
    
    // 🔥 ANALYTICS: Track subsequent scrolls (not counted as interactions)
    Analytics.logEvent('guest_scroll_subsequent', {
      tab_name: tabName,
      session_id: moduleScrollSessions[tabName].sessionId,
      session_duration_ms: Date.now() - moduleScrollSessions[tabName].startTime,
      interaction_not_counted: true
    });
    
    return true; // Allow scroll but don't track as interaction
  }
  
  // Mark as scrolled first
  markTabScrolled(tabName);
  
  // Track the scroll as an interaction
  console.log(`[GuestLimitation] First scroll in ${tabName} session - tracking interaction`);
  
  // 🔥 ANALYTICS: Track scroll interaction attempt
  Analytics.logEvent('guest_scroll_interaction_attempt', {
    tab_name: tabName,
    current_interaction_count: store.interactionCount,
    session_id: moduleScrollSessions[tabName].sessionId,
    is_first_scroll_in_session: true
  });
  
  const interactionAllowed = store.incrementInteraction(InteractionType.LIST_SCROLL);
  
  // 🔥 ANALYTICS: Track scroll interaction outcome
  Analytics.logEvent('guest_scroll_interaction_result', {
    tab_name: tabName,
    interaction_allowed: interactionAllowed,
    triggered_limitation: !interactionAllowed,
    session_scroll_timing: Date.now() - moduleScrollSessions[tabName].startTime
  });
  
  // Track scroll engagement success/failure
  Analytics.trackFeatureEngagement('guest_scroll_engagement', {
    tab_name: tabName,
    engagement_success: interactionAllowed,
    limitation_hit: !interactionAllowed,
    session_type: 'first_scroll'
  });
  
  return interactionAllowed;
};

// =============================================
// ADDITIONAL HELPER FUNCTIONS
// =============================================

/**
 * Hook to check if user is in guest mode and has limitations
 */
export const useIsGuestLimited = (): boolean => {
  return true; // Replace with actual guest mode check
};

/**
 * Hook to get formatted interaction status for debugging
 * 🔥 ENHANCED: Added analytics data to debug info
 */
export const useGuestLimitationDebug = () => {
  const store = useGuestLimitationStore();
  
  // 🔥 ANALYTICS: Track debug info access (useful for developer analytics)
  if (__DEV__) {
    Analytics.logEvent('guest_limitation_debug_accessed', {
      interaction_count: store.interactionCount,
      is_prompt_visible: store.isPromptVisible,
      session_duration_ms: Date.now() - store.sessionStartTime
    });
  }
  
  return {
    interactionCount: store.interactionCount,
    limit: store.getInteractionLimit(),
    hasSeenFirstPrompt: store.hasSeenFirstPrompt,
    isPromptVisible: store.isPromptVisible,
    canInteract: !store.isPromptVisible,
    nextPromptIn: store.getInteractionLimit() - store.interactionCount,
    scrollSessions: moduleScrollSessions, // Get from module level, not store
    // 🔥 ANALYTICS: Additional debug data
    sessionDuration: Date.now() - store.sessionStartTime,
    totalSessionInteractions: store.totalSessionInteractions,
    lastInteractionTime: store.lastInteractionTime
  };
};