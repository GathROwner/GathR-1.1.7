// ===============================================================
// FILE: GathR/hooks/useGuestInteraction.ts
// PURPOSE: Custom hook for tracking guest user interactions and managing limitations
// DESCRIPTION: This hook provides a simple interface for components to track
//              user interactions and automatically handle guest limitations.
//              It integrates with the guest limitation store and auth context.
// ENHANCED: Added comprehensive Firebase Analytics integration
// ===============================================================

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext'; // Adjust import path as needed
import { useGuestLimitationStore } from '../store/guestLimitationStore';
import { InteractionType } from '../types/guestLimitations';

// 🔥 ANALYTICS INTEGRATION: Import analytics service
import * as Analytics from '../utils/analytics';

/**
 * Configuration for debouncing rapid interactions
 */
interface InteractionConfig {
  debounceMs?: number;          // Milliseconds to debounce rapid interactions (default: 500)
  maxPerSecond?: number;        // Maximum interactions per second (default: 3)
  enableLogging?: boolean;      // Whether to log interactions for debugging (default: false)
}

/**
 * Return type for the useGuestInteraction hook
 */
interface GuestInteractionHookReturn {
  // State information
  isGuest: boolean;                                    // Whether user is in guest mode
  isLimited: boolean;                                  // Whether user is currently limited
  interactionCount: number;                            // Current interaction count
  interactionLimit: number;                            // Current interaction limit
  canInteract: boolean;                                // Whether interactions are allowed
  
  // Interaction methods
  trackInteraction: (type: InteractionType) => boolean; // Track an interaction, returns if allowed
  checkInteraction: (type: InteractionType) => boolean; // Check if interaction would be allowed
  resetInteractions: () => void;                        // Reset interaction counter
  
  // Utility methods
  getRemainingInteractions: () => number;               // Get remaining interactions before limit
  getDebugInfo: () => object;                          // Get debug information
  
  // Advanced methods
  trackInteractionAsync: (type: InteractionType) => Promise<boolean>; // Async version with logging
  batchTrackInteractions: (types: InteractionType[]) => boolean;      // Track multiple interactions
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<InteractionConfig> = {
  debounceMs: 500,
  maxPerSecond: 3,
  enableLogging: false
};

/**
 * Interaction tracking cache for debouncing
 */
const interactionCache = new Map<string, number>();

/**
 * Rate limiting cache for tracking interaction frequencies
 */
const rateLimitCache = new Map<string, number[]>();

/**
 * Global initialization flag to prevent multiple hook instances from initializing
 */
let isGloballyInitialized = false;

/**
 * useGuestInteraction Hook
 * 
 * A comprehensive hook for managing guest user interactions and limitations.
 * This hook should be used by any component that performs actions that should
 * be limited for guest users.
 * 
 * Usage Examples:
 * 
 * // Basic usage in a component
 * const { isGuest, trackInteraction, canInteract } = useGuestInteraction();
 * 
 * const handleClusterClick = () => {
 *   if (trackInteraction(InteractionType.CLUSTER_CLICK)) {
 *     // Interaction allowed - proceed with action
 *     expandCluster();
 *   }
 *   // If false returned, interaction was blocked and prompt shown
 * };
 * 
 * // Check before allowing interaction
 * const handleScroll = () => {
 *   if (!canInteract) return; // Don't even attempt if limited
 *   
 *   if (trackInteraction(InteractionType.LIST_SCROLL)) {
 *     loadMoreItems();
 *   }
 * };
 * 
 * // Advanced usage with custom configuration
 * const { trackInteraction } = useGuestInteraction({
 *   debounceMs: 1000,
 *   enableLogging: true
 * });
 */
export const useGuestInteraction = (config: InteractionConfig = {}): GuestInteractionHookReturn => {
  
  // =============================================
  // HOOKS AND STATE
  // =============================================
  
  const { user } = useAuth();
  const guestStore = useGuestLimitationStore();
  
  // Merge configuration with defaults
  const finalConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);
  
  // Determine if user is in guest mode
  const isGuest = useMemo(() => !user, [user]);
  
  // Get current limitation state
  const isLimited = useMemo(() => 
    isGuest && guestStore.isPromptVisible, 
    [isGuest, guestStore.isPromptVisible]
  );
  
  const canInteract = useMemo(() => 
    !isGuest || !isLimited, 
    [isGuest, isLimited]
  );

  // 🔥 ANALYTICS: Add refs for tracking performance and behavior patterns
  const hookInitTime = useRef<number>(Date.now());
  const interactionTimings = useRef<Map<InteractionType, number[]>>(new Map());
  const sessionStats = useRef({
    totalInteractions: 0,
    blockedInteractions: 0,
    debouncedInteractions: 0,
    rateLimitedInteractions: 0
  });
  
  // =============================================
  // INITIALIZATION
  // =============================================
  
  useEffect(() => {
    // Only initialize once globally across all hook instances
    if (!isGloballyInitialized) {
      isGloballyInitialized = true;
      
      // 🔥 ANALYTICS: Track hook initialization
      Analytics.logEvent('guest_interaction_hook_initialized', {
        is_guest: isGuest,
        config_debounce_ms: finalConfig.debounceMs,
        config_max_per_second: finalConfig.maxPerSecond,
        config_logging_enabled: finalConfig.enableLogging
      });
      
      // Initialize the guest limitation store
      guestStore.initializeFromStorage().catch(error => {
        console.error('[useGuestInteraction] Failed to initialize store:', error);
        
        // 🔥 ANALYTICS: Track initialization failures
        Analytics.trackError('guest_interaction_init_error',
          error instanceof Error ? error.message : 'Unknown initialization error',
          {
            error_type: 'store_initialization',
            hook_component: 'useGuestInteraction'
          }
        );
        
        // Reset flag on error so it can be retried
        isGloballyInitialized = false;
      });
    }

    // 🔥 ANALYTICS: Track hook usage patterns
    Analytics.trackFeatureEngagement('guest_interaction_hook_usage', {
      user_type: isGuest ? 'guest' : 'registered',
      hook_instance_created: true,
      time_since_app_start: Date.now() - hookInitTime.current
    });
  }, []); // Empty dependency array - only run once on mount
  
  // =============================================
  // DEBOUNCING UTILITIES
  // =============================================
  
  /**
   * Check if interaction should be debounced
   * 🔥 ENHANCED: Added analytics tracking for debouncing patterns
   * @param type - The interaction type
   * @returns boolean - true if interaction should be debounced
   */
  const shouldDebounce = useCallback((type: InteractionType): boolean => {
    const now = Date.now();
    const key = `${type}_last_interaction`;
    const lastInteraction = interactionCache.get(key) || 0;
    
    if (now - lastInteraction < finalConfig.debounceMs) {
      sessionStats.current.debouncedInteractions++;
      
      if (finalConfig.enableLogging) {
        console.log(`[useGuestInteraction] Debouncing ${type}`);
      }
      
      // 🔥 ANALYTICS: Track debouncing events for UX optimization
      Analytics.logEvent('guest_interaction_debounced', {
        interaction_type: type,
        time_since_last_ms: now - lastInteraction,
        debounce_threshold_ms: finalConfig.debounceMs,
        session_debounced_count: sessionStats.current.debouncedInteractions,
        is_rapid_clicking: (now - lastInteraction) < 200
      });
      
      return true;
    }
    
    interactionCache.set(key, now);
    return false;
  }, [finalConfig.debounceMs, finalConfig.enableLogging]);
  
  /**
   * Check rate limiting for interactions
   * 🔥 ENHANCED: Added analytics tracking for rate limiting patterns
   * @param type - The interaction type
   * @returns boolean - true if rate limit exceeded
   */
  const isRateLimited = useCallback((type: InteractionType): boolean => {
    const now = Date.now();
    const key = `${type}_rate_count`;
    const windowStart = now - 1000; // 1 second window
    
    // Get existing interactions for this type
    const existingInteractions = rateLimitCache.get(key) || [];
    
    // Filter out old interactions and count recent ones
    const recentInteractions = existingInteractions.filter((timestamp: number) => timestamp > windowStart);
    const recentCount = recentInteractions.length;
    
    // Add current interaction and update cache
    const updatedInteractions = [...recentInteractions, now];
    rateLimitCache.set(key, updatedInteractions);
    
    const exceeded = recentCount >= finalConfig.maxPerSecond;
    
    if (exceeded) {
      sessionStats.current.rateLimitedInteractions++;
      
      if (finalConfig.enableLogging) {
        console.log(`[useGuestInteraction] Rate limit exceeded for ${type}: ${recentCount}/${finalConfig.maxPerSecond}`);
      }
      
      // 🔥 ANALYTICS: Track rate limiting for UX and potential abuse detection
      Analytics.logEvent('guest_interaction_rate_limited', {
        interaction_type: type,
        interactions_per_second: recentCount,
        rate_limit_threshold: finalConfig.maxPerSecond,
        session_rate_limited_count: sessionStats.current.rateLimitedInteractions,
        user_behavior_pattern: recentCount > finalConfig.maxPerSecond * 2 ? 'aggressive' : 'rapid'
      });
      
      // Track potential abuse patterns
      if (recentCount > finalConfig.maxPerSecond * 3) {
        Analytics.trackFeatureEngagement('potential_abuse_detection', {
          interaction_type: type,
          interactions_attempted: recentCount,
          detection_confidence: 'high'
        });
      }
    }
    
    return exceeded;
  }, [finalConfig.maxPerSecond, finalConfig.enableLogging]);
  
  // =============================================
  // CORE INTERACTION METHODS
  // =============================================
  
  /**
   * Track a user interaction
   * 🔥 ENHANCED: Added comprehensive analytics tracking
   * @param type - The type of interaction being tracked
   * @returns boolean - true if interaction is allowed, false if blocked
   */
  const trackInteraction = useCallback((type: InteractionType): boolean => {
    const interactionStartTime = Date.now();
    sessionStats.current.totalInteractions++;
    
    // Always allow interactions for registered users
    if (!isGuest) {
      if (finalConfig.enableLogging) {
        console.log(`[useGuestInteraction] Allowing ${type} for registered user`);
      }
      
      // 🔥 ANALYTICS: Track registered user interactions for comparison
      Analytics.logEvent('registered_user_interaction', {
        interaction_type: type,
        session_total_interactions: sessionStats.current.totalInteractions
      });
      
      return true;
    }
    
    // Check debouncing
    if (shouldDebounce(type)) {
      // 🔥 ANALYTICS: Additional context for debounced interactions
      Analytics.trackFeatureEngagement('interaction_debouncing', {
        interaction_type: type,
        user_behavior: 'too_rapid',
        prevention_success: true
      });
      
      return false; // Silently ignore debounced interactions
    }
    
    // Check rate limiting
    if (isRateLimited(type)) {
      // 🔥 ANALYTICS: Additional context for rate limited interactions
      Analytics.trackFeatureEngagement('interaction_rate_limiting', {
        interaction_type: type,
        user_behavior: 'excessive_frequency',
        prevention_success: true
      });
      
      return false; // Silently ignore rate-limited interactions
    }
    
    // Track interaction timing patterns
    const timings = interactionTimings.current.get(type) || [];
    timings.push(interactionStartTime);
    if (timings.length > 10) timings.shift(); // Keep only last 10 timings
    interactionTimings.current.set(type, timings);
    
    // Track the interaction through the store
    const allowed = guestStore.incrementInteraction(type);
    
    if (!allowed) {
      sessionStats.current.blockedInteractions++;
    }
    
    const interactionDuration = Date.now() - interactionStartTime;
    
    // 🔥 ANALYTICS: Track interaction outcome with comprehensive data
    Analytics.logEvent('guest_interaction_processed', {
      interaction_type: type,
      interaction_allowed: allowed,
      interaction_blocked: !allowed,
      processing_duration_ms: interactionDuration,
      current_interaction_count: guestStore.interactionCount,
      interaction_limit: guestStore.getInteractionLimit(),
      remaining_interactions: guestStore.getInteractionLimit() - guestStore.interactionCount,
      session_total_interactions: sessionStats.current.totalInteractions,
      session_blocked_interactions: sessionStats.current.blockedInteractions,
      session_success_rate: ((sessionStats.current.totalInteractions - sessionStats.current.blockedInteractions) / sessionStats.current.totalInteractions) * 100,
      user_engagement_pattern: sessionStats.current.totalInteractions > 20 ? 'high' : 
                              sessionStats.current.totalInteractions > 10 ? 'medium' : 'low'
    });
    
    // Track interaction patterns for UX optimization
    if (timings.length >= 3) {
      const avgTimeBetweenInteractions = timings.reduce((sum, time, index) => {
        if (index === 0) return 0;
        return sum + (time - timings[index - 1]);
      }, 0) / (timings.length - 1);
      
      Analytics.trackFeatureEngagement('interaction_pattern_analysis', {
        interaction_type: type,
        avg_time_between_interactions_ms: avgTimeBetweenInteractions,
        interaction_frequency: avgTimeBetweenInteractions < 2000 ? 'rapid' : 
                              avgTimeBetweenInteractions < 10000 ? 'normal' : 'slow',
        pattern_stability: timings.length >= 5 ? 'stable' : 'establishing'
      });
    }
    
    // Track limitation effectiveness
    if (!allowed) {
      Analytics.trackFeatureEngagement('guest_limitation_effectiveness', {
        limitation_triggered: true,
        interactions_before_limit: guestStore.interactionCount,
        user_engagement_before_limit: sessionStats.current.totalInteractions,
        limitation_timing: sessionStats.current.totalInteractions < 5 ? 'early' : 
                          sessionStats.current.totalInteractions < 15 ? 'mid' : 'late'
      });
    }
    
    if (finalConfig.enableLogging) {
      console.log(`[useGuestInteraction] Tracked ${type}, allowed: ${allowed}`);
    }
    
    return allowed;
  }, [isGuest, shouldDebounce, isRateLimited, guestStore, finalConfig.enableLogging]);
  
  /**
   * Check if an interaction would be allowed without actually tracking it
   * 🔥 ENHANCED: Added analytics for interaction checking patterns
   * @param type - The type of interaction to check
   * @returns boolean - true if interaction would be allowed
   */
  const checkInteraction = useCallback((type: InteractionType): boolean => {
    // Always allow for registered users
    if (!isGuest) return true;
    
    // Check if prompt is currently visible
    if (guestStore.isPromptVisible) {
      // 🔥 ANALYTICS: Track when users try to check interactions while limited
      Analytics.logEvent('interaction_check_while_limited', {
        interaction_type: type,
        prompt_visible: true,
        user_attempting_action: true
      });
      
      return false;
    }
    
    // Check if this interaction would trigger the limit
    const wouldBeAllowed = guestStore.canPerformInteraction(type);
    
    // 🔥 ANALYTICS: Track interaction checking patterns (helpful for UX)
    Analytics.logEvent('guest_interaction_check', {
      interaction_type: type,
      would_be_allowed: wouldBeAllowed,
      current_interaction_count: guestStore.interactionCount,
      interaction_limit: guestStore.getInteractionLimit(),
      check_timing: wouldBeAllowed ? 'safe' : 'at_limit'
    });
    
    return wouldBeAllowed;
  }, [isGuest, guestStore]);
  
  /**
   * Reset the interaction counter
   * 🔥 ENHANCED: Added analytics tracking
   */
  const resetInteractions = useCallback(() => {
    const previousCount = guestStore.interactionCount;
    const sessionInteractions = sessionStats.current.totalInteractions;
    
    if (finalConfig.enableLogging) {
      console.log('[useGuestInteraction] Resetting interactions');
    }
    
    guestStore.resetInteractionCount();
    
    // Reset session stats
    sessionStats.current = {
      totalInteractions: 0,
      blockedInteractions: 0,
      debouncedInteractions: 0,
      rateLimitedInteractions: 0
    };
    
    // 🔥 ANALYTICS: Track interaction resets
    Analytics.logEvent('guest_interactions_reset', {
      previous_interaction_count: previousCount,
      session_interactions_before_reset: sessionInteractions,
      reset_trigger: 'manual_reset'
    });
    
    Analytics.trackFeatureEngagement('guest_interaction_management', {
      action: 'reset_interactions',
      effectiveness_before_reset: sessionInteractions > 0 ? (sessionInteractions - sessionStats.current.blockedInteractions) / sessionInteractions : 1
    });
  }, [guestStore, finalConfig.enableLogging]);
  
  // =============================================
  // UTILITY METHODS
  // =============================================
  
  /**
   * Get the number of remaining interactions before hitting the limit
   * @returns number - remaining interactions
   */
  const getRemainingInteractions = useCallback((): number => {
    if (!isGuest) return Number.MAX_SAFE_INTEGER;
    
    const limit = guestStore.getInteractionLimit();
    const current = guestStore.interactionCount;
    return Math.max(0, limit - current);
  }, [isGuest, guestStore]);
  
  /**
   * Get debug information about the current state
   * 🔥 ENHANCED: Added analytics data to debug information
   * @returns object - debug information
   */
  const getDebugInfo = useCallback(() => {
    const debugInfo = {
      isGuest,
      isLimited,
      canInteract,
      interactionCount: guestStore.interactionCount,
      interactionLimit: guestStore.getInteractionLimit(),
      remainingInteractions: getRemainingInteractions(),
      hasSeenFirstPrompt: guestStore.hasSeenFirstPrompt,
      isPromptVisible: guestStore.isPromptVisible,
      config: finalConfig,
      // 🔥 ANALYTICS: Session statistics
      sessionStats: sessionStats.current,
      sessionDuration: Date.now() - hookInitTime.current,
      interactionTimings: Object.fromEntries(interactionTimings.current),
      cacheStats: {
        interactionCacheSize: interactionCache.size,
        rateLimitCacheSize: rateLimitCache.size
      }
    };
    
    // 🔥 ANALYTICS: Track debug info access in development
    if (__DEV__) {
      Analytics.logEvent('guest_interaction_debug_accessed', {
        session_total_interactions: sessionStats.current.totalInteractions,
        session_success_rate: sessionStats.current.totalInteractions > 0 
          ? ((sessionStats.current.totalInteractions - sessionStats.current.blockedInteractions) / sessionStats.current.totalInteractions) * 100 
          : 100,
        debug_timing: Date.now() - hookInitTime.current
      });
    }
    
    return debugInfo;
  }, [
    isGuest, 
    isLimited, 
    canInteract, 
    guestStore, 
    getRemainingInteractions, 
    finalConfig
  ]);
  
  // =============================================
  // ADVANCED METHODS
  // =============================================
  
  /**
   * Async version of trackInteraction with additional logging
   * 🔥 ENHANCED: Added comprehensive performance and analytics tracking
   * @param type - The interaction type
   * @returns Promise<boolean> - whether interaction was allowed
   */
  const trackInteractionAsync = useCallback(async (type: InteractionType): Promise<boolean> => {
    const startTime = Date.now();
    const result = trackInteraction(type);
    const duration = Date.now() - startTime;
    
    if (finalConfig.enableLogging) {
      console.log(`[useGuestInteraction] Async tracked ${type} in ${duration}ms, result: ${result}`);
    }
    
    // 🔥 ANALYTICS: Track async interaction performance
    Analytics.logEvent('guest_interaction_async_processing', {
      duration_ms: duration,
      interaction_type: type,
      interaction_result: result,
      processing_speed: duration < 10 ? 'fast' : duration < 50 ? 'normal' : 'slow'
    });
    
    // Could add async analytics tracking here for future external integrations
    try {
      // Simulate async analytics call (could be real external service)
      await new Promise(resolve => setTimeout(resolve, 1));
      
      // 🔥 ANALYTICS: Track successful async processing
      Analytics.logEvent('guest_interaction_async_complete', {
        interaction_type: type,
        total_duration_ms: Date.now() - startTime,
        sync_processing_ms: duration,
        async_processing_ms: Date.now() - startTime - duration
      });
      
    } catch (error) {
      // 🔥 ANALYTICS: Track async processing errors
      Analytics.trackError('guest_interaction_async_error',
        error instanceof Error ? error.message : 'Unknown async error',
        {
          interaction_type: type,
          processing_stage: 'async_analytics'
        }
      );
    }
    
    return result;
  }, [trackInteraction, finalConfig.enableLogging]);
  
  /**
   * Track multiple interactions as a batch
   * 🔥 ENHANCED: Added analytics for batch interaction patterns
   * @param types - Array of interaction types
   * @returns boolean - true if all interactions were allowed
   */
  const batchTrackInteractions = useCallback((types: InteractionType[]): boolean => {
    const batchStartTime = Date.now();
    
    if (!isGuest) {
      // 🔥 ANALYTICS: Track batch interactions for registered users
      Analytics.logEvent('registered_user_batch_interaction', {
        interaction_types: types.join(','),
        batch_size: types.length
      });
      
      return true;
    }
    
    // 🔥 ANALYTICS: Track batch interaction attempt
    Analytics.logEvent('guest_batch_interaction_attempt', {
      interaction_types: types.join(','),
      batch_size: types.length,
      current_interaction_count: guestStore.interactionCount,
      interaction_limit: guestStore.getInteractionLimit()
    });
    
    let successCount = 0;
    let firstBlockedType: InteractionType | null = null;
    
    // For guests, only track the first interaction that would trigger the limit
    for (const type of types) {
      if (!trackInteraction(type)) {
        firstBlockedType = type;
        break; // First blocked interaction stops the batch
      }
      successCount++;
    }
    
    const batchDuration = Date.now() - batchStartTime;
    const allSucceeded = successCount === types.length;
    
    // 🔥 ANALYTICS: Track batch interaction results
    Analytics.logEvent('guest_batch_interaction_result', {
      batch_size: types.length,
      successful_interactions: successCount,
      failed_interactions: types.length - successCount,
      first_blocked_type: firstBlockedType,
      batch_success_rate: (successCount / types.length) * 100,
      batch_processing_duration_ms: batchDuration,
      limitation_triggered: !allSucceeded
    });
    
    // Track batch interaction patterns for UX optimization
    Analytics.trackFeatureEngagement('guest_batch_interaction_patterns', {
      batch_type: types.length > 3 ? 'large' : types.length > 1 ? 'medium' : 'single',
      interaction_diversity: new Set(types).size / types.length, // Ratio of unique to total interactions
      batch_efficiency: allSucceeded ? 'complete' : successCount > 0 ? 'partial' : 'blocked'
    });
    
    return allSucceeded;
  }, [isGuest, trackInteraction, guestStore]);
  
  // =============================================
  // CLEANUP AND ANALYTICS REPORTING
  // =============================================
  
  useEffect(() => {
    // Cleanup and final analytics on unmount
    return () => {
      const sessionDuration = Date.now() - hookInitTime.current;
      
      // 🔥 ANALYTICS: Track hook session summary
      Analytics.logEvent('guest_interaction_hook_session_summary', {
        session_duration_ms: sessionDuration,
        total_interactions: sessionStats.current.totalInteractions,
        blocked_interactions: sessionStats.current.blockedInteractions,
        debounced_interactions: sessionStats.current.debouncedInteractions,
        rate_limited_interactions: sessionStats.current.rateLimitedInteractions,
        success_rate: sessionStats.current.totalInteractions > 0 
          ? ((sessionStats.current.totalInteractions - sessionStats.current.blockedInteractions) / sessionStats.current.totalInteractions) * 100 
          : 100,
        user_type: isGuest ? 'guest' : 'registered'
      });
      
      // Clear caches
      interactionCache.clear();
      rateLimitCache.clear();
    };
  }, [isGuest]);
  
  // =============================================
  // RETURN HOOK VALUES
  // =============================================
  
  return {
    // State information
    isGuest,
    isLimited,
    interactionCount: guestStore.interactionCount,
    interactionLimit: guestStore.getInteractionLimit(),
    canInteract,
    
    // Interaction methods
    trackInteraction,
    checkInteraction,
    resetInteractions,
    
    // Utility methods
    getRemainingInteractions,
    getDebugInfo,
    
    // Advanced methods
    trackInteractionAsync,
    batchTrackInteractions
  };
};

// =============================================
// HELPER HOOKS
// =============================================

/**
 * Hook for components that need to track a specific interaction type
 * 🔥 ENHANCED: Added analytics tracking for specific interaction hooks
 * @param type - The interaction type this component always tracks
 * @param config - Optional configuration
 */
export const useSpecificInteraction = (
  type: InteractionType, 
  config?: InteractionConfig
) => {
  const guestInteraction = useGuestInteraction(config);
  
  // 🔥 ANALYTICS: Track specific interaction hook usage
  useEffect(() => {
    Analytics.trackFeatureEngagement('specific_interaction_hook_usage', {
      interaction_type: type,
      hook_specialized: true
    });
  }, [type]);
  
  const trackThisInteraction = useCallback(() => {
    return guestInteraction.trackInteraction(type);
  }, [guestInteraction, type]);
  
  const checkThisInteraction = useCallback(() => {
    return guestInteraction.checkInteraction(type);
  }, [guestInteraction, type]);
  
  return {
    ...guestInteraction,
    trackThisInteraction,
    checkThisInteraction
  };
};

/**
 * Hook for debugging guest interactions
 * Only use this in development
 * 🔥 ENHANCED: Added comprehensive analytics for debugging
 */
export const useGuestInteractionDebug = () => {
  const guestInteraction = useGuestInteraction({ enableLogging: true });
  
  useEffect(() => {
    if (__DEV__) {
      const debugInfo = guestInteraction.getDebugInfo() as any;
      console.log('[Debug] Guest Interaction State:', debugInfo);
      
      // 🔥 ANALYTICS: Track debug hook usage with detailed state
      Analytics.logEvent('guest_interaction_debug_hook_used', {
        interaction_count: debugInfo.interactionCount,
        is_limited: debugInfo.isLimited,
        session_stats: JSON.stringify(debugInfo.sessionStats),
        session_duration_ms: debugInfo.sessionDuration,
        cache_sizes: JSON.stringify(debugInfo.cacheStats)
      });
    }
  }, [guestInteraction]);
  
  return guestInteraction;
};

export default useGuestInteraction;