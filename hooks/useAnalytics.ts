import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { usePathname } from 'expo-router';
import * as Analytics from '../utils/analytics';
import type { 
  BaseEventParams, 
  UserProperties, 
  EventData, 
  ErrorContext,
  ContentDiscoveryData,
  EngagementDepthData,
  UserJourneyData,
  PerformanceMetrics
} from '../utils/analytics';

/**
 * Enhanced Custom React Hook for Firebase Analytics Integration
 * Phase 4: Complete analytics API with advanced features
 */

interface AnalyticsAPI {
  // Core analytics methods
  initializeUser: (userId: string, properties?: UserProperties) => void;
  trackUserRegistration: (method?: string) => void;
  trackUserLogin: (method?: string) => void;
  trackInterestSelection: (interests?: string[]) => void;
  trackEventView: (event?: EventData) => void;
  trackEventFilter: (filterType: string, filterValue: string | string[], additionalData?: BaseEventParams) => void;
  trackMapInteraction: (type: string, data?: BaseEventParams) => void;
  trackScreenView: (screenName: string, params?: BaseEventParams) => void;
  trackError: (type: string, message: string, context?: ErrorContext) => void;
  trackSessionStart: () => void;
  trackSessionEnd: (duration?: number) => void;
  trackFeatureEngagement: (feature: string, data?: BaseEventParams) => void;
  logEvent: (eventName: string, parameters?: BaseEventParams) => void;
  
  // Enhanced methods with hook context
  trackEventViewWithContext: (event: EventData) => void;
  trackUserAction: (action: string, data?: BaseEventParams) => void;
  trackPerformance: (metric: string, value: number, context?: BaseEventParams) => void;
  trackConversion: (type: string, data?: BaseEventParams) => void;
  
  // Advanced Phase 4 methods
  trackContentDiscovery: (discoveryData: ContentDiscoveryData) => void;
  trackEngagementDepth: (screenName: string, timeSpent: number, engagementData?: Partial<EngagementDepthData>) => void;
  trackUserJourney: (journeyData: UserJourneyData) => void;
  trackPerformanceMetric: (performanceData: PerformanceMetrics) => void;
  trackABTestEvent: (testName: string, variant: string, outcome: string, data?: BaseEventParams) => void;
  trackBusinessMetric: (metricName: string, value: number, category: string, context?: BaseEventParams) => void;
  
  // Advanced context-aware methods
  trackContentDiscoveryWithContext: (method: ContentDiscoveryData['method'], contentType: ContentDiscoveryData['contentType'], results: number, additionalData?: Partial<ContentDiscoveryData>) => void;
  trackEngagementWithContext: (engagementData?: Partial<EngagementDepthData>) => void;
  trackJourneyStep: (toScreen: string, action?: string) => void;
  trackPerformanceWithThreshold: (metric: string, value: number, threshold: number, category: PerformanceMetrics['category']) => void;
  
  // Session and journey tracking
  startEngagementTracking: () => void;
  endEngagementTracking: () => void;
  addJourneyTouchpoint: (screen: string, action?: string) => void;
  trackFeatureUsage: (feature: string, duration?: number) => void;
  
  // Utility methods
  getSessionDuration: () => number;
  getCurrentScreen: () => string;
  getJourneyPath: () => string[];
  getEngagementMetrics: () => { interactions: number; featuresUsed: string[]; timeSpent: number };
  manualTrackScreen: (screenName: string, params?: BaseEventParams) => void;
  
  // Business intelligence methods
  trackUserSegment: (segment: string, characteristics?: BaseEventParams) => void;
  trackFeatureFunnel: (funnelName: string, step: string, completed: boolean) => void;
  trackRetentionEvent: (event: string, daysSinceInstall: number) => void;
  trackRevenueEvent: (revenue: number, currency: string, source: string) => void;
}

const useAnalytics = (): AnalyticsAPI => {
  // Session tracking references
  const sessionStartTime = useRef<number | null>(null);
  const currentScreen = useRef<string | null>(null);
  const appStateListener = useRef<any>(null);
  
  // Enhanced tracking references for Phase 4
  const engagementStartTime = useRef<number | null>(null);
  const interactionCount = useRef<number>(0);
  const featuresUsed = useRef<Set<string>>(new Set());
  const journeyPath = useRef<string[]>([]);
  const touchpointCount = useRef<number>(0);
  const screenEngagementStart = useRef<number | null>(null);
  
  // Get current pathname for screen tracking
  const pathname = usePathname();
  
  /**
   * Calculate session duration in seconds
   */
  const getSessionDuration = useCallback((): number => {
    if (!sessionStartTime.current) return 0;
    return Math.floor((Date.now() - sessionStartTime.current) / 1000);
  }, []);
  
  /**
   * Get current engagement metrics
   */
  const getEngagementMetrics = useCallback(() => {
    return {
      interactions: interactionCount.current,
      featuresUsed: Array.from(featuresUsed.current),
      timeSpent: engagementStartTime.current ? Date.now() - engagementStartTime.current : 0
    };
  }, []);
  
  /**
   * Get current journey path
   */
  const getJourneyPath = useCallback((): string[] => {
    return [...journeyPath.current];
  }, []);
  
  /**
   * Handle app state changes for session tracking
   */
  const handleAppStateChange = useCallback((nextAppState: AppStateStatus): void => {
    try {
      if (nextAppState === 'active') {
        sessionStartTime.current = Date.now();
        engagementStartTime.current = Date.now();
        Analytics.trackSessionStart();
        console.log('📱 App became active - session started');
      } else if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (sessionStartTime.current) {
          const duration = getSessionDuration();
          const engagementMetrics = getEngagementMetrics();
          
          // Track comprehensive session end
          Analytics.trackSessionEnd(duration);
          
          // Track session engagement summary
          Analytics.trackEngagementDepth('session_summary', engagementMetrics.timeSpent, {
            interactions: engagementMetrics.interactions,
            featuresUsed: engagementMetrics.featuresUsed,
            conversionEvents: 0 // Can be enhanced based on business logic
          });
          
          // Track user journey for the session
          if (journeyPath.current.length > 1) {
            Analytics.trackUserJourney({
              fromScreen: journeyPath.current[0],
              toScreen: journeyPath.current[journeyPath.current.length - 1],
              path: journeyPath.current,
              sessionDuration: engagementMetrics.timeSpent,
              touchpoints: touchpointCount.current
            });
          }
          
          console.log(`📱 App went to background - session ended (${duration}s)`);
          
          // Reset tracking
          interactionCount.current = 0;
          featuresUsed.current.clear();
          journeyPath.current = [];
          touchpointCount.current = 0;
        }
      }
    } catch (error) {
      console.warn('Error handling app state change:', error instanceof Error ? error.message : 'Unknown error');
    }
  }, [getSessionDuration, getEngagementMetrics]);
  
  /**
   * Track screen view when pathname changes
   */
  const trackCurrentScreen = useCallback((): void => {
    try {
      if (pathname && pathname !== currentScreen.current) {
        const screenName = pathname === '/' ? 'home' : pathname.replace('/', '');
        
        // Track screen engagement for previous screen
        if (currentScreen.current && screenEngagementStart.current) {
          const timeSpent = Date.now() - screenEngagementStart.current;
          Analytics.trackEngagementDepth(currentScreen.current, timeSpent, {
            interactions: interactionCount.current,
            featuresUsed: Array.from(featuresUsed.current)
          });
        }
        
        // Track new screen view
        Analytics.trackScreenView(screenName, {
          session_duration: getSessionDuration(),
          journey_position: journeyPath.current.length + 1,
          previous_screen: currentScreen.current || 'none'
        });
        
        // Update tracking state
        currentScreen.current = pathname;
        screenEngagementStart.current = Date.now();
        journeyPath.current.push(screenName);
        touchpointCount.current += 1;
        
        console.log(`📺 Screen view tracked: ${screenName}`);
      }
    } catch (error) {
      console.warn('Error tracking screen view:', error instanceof Error ? error.message : 'Unknown error');
    }
  }, [pathname, getSessionDuration]);
  
  /**
   * Initialize analytics tracking on component mount
   */
  useEffect(() => {
    try {
      sessionStartTime.current = Date.now();
      engagementStartTime.current = Date.now();
      screenEngagementStart.current = Date.now();
      
      Analytics.trackSessionStart();
      
      appStateListener.current = AppState.addEventListener('change', handleAppStateChange);
      
      console.log('🚀 Enhanced Analytics hook initialized');
      
      return () => {
        try {
          if (appStateListener.current) {
            appStateListener.current.remove();
          }
          
          if (sessionStartTime.current) {
            const duration = getSessionDuration();
            const engagementMetrics = getEngagementMetrics();
            
            Analytics.trackSessionEnd(duration);
            
            // Track final engagement summary
            if (engagementMetrics.timeSpent > 1000) { // Only track if meaningful engagement
              Analytics.trackEngagementDepth('app_cleanup', engagementMetrics.timeSpent, {
                interactions: engagementMetrics.interactions,
                featuresUsed: engagementMetrics.featuresUsed
              });
            }
          }
          
          console.log('🔄 Enhanced Analytics hook cleaned up');
        } catch (error) {
          console.warn('Error during analytics cleanup:', error instanceof Error ? error.message : 'Unknown error');
        }
      };
    } catch (error) {
      console.warn('Error initializing enhanced analytics hook:', error instanceof Error ? error.message : 'Unknown error');
    }
  }, [handleAppStateChange, getSessionDuration, getEngagementMetrics]);
  
  /**
   * Track screen views when pathname changes
   */
  useEffect(() => {
    trackCurrentScreen();
  }, [trackCurrentScreen]);
  
  /**
   * Enhanced Analytics API object
   */
  const analyticsAPI: AnalyticsAPI = {
    // Core analytics methods
    initializeUser: Analytics.initializeUser,
    trackUserRegistration: Analytics.trackUserRegistration,
    trackUserLogin: Analytics.trackUserLogin,
    trackInterestSelection: Analytics.trackInterestSelection,
    trackEventView: Analytics.trackEventView,
    trackEventFilter: Analytics.trackEventFilter,
    trackMapInteraction: Analytics.trackMapInteraction,
    trackScreenView: Analytics.trackScreenView,
    trackError: Analytics.trackError,
    trackSessionStart: Analytics.trackSessionStart,
    trackSessionEnd: Analytics.trackSessionEnd,
    trackFeatureEngagement: Analytics.trackFeatureEngagement,
    logEvent: Analytics.logEvent,
    
    // Advanced Phase 4 methods
    trackContentDiscovery: Analytics.trackContentDiscovery,
    trackEngagementDepth: Analytics.trackEngagementDepth,
    trackUserJourney: Analytics.trackUserJourney,
    trackPerformanceMetric: Analytics.trackPerformanceMetric,
    trackABTestEvent: Analytics.trackABTestEvent,
    trackBusinessMetric: Analytics.trackBusinessMetric,
    
    // Enhanced methods with hook context
    trackEventViewWithContext: useCallback((event: EventData): void => {
      try {
        Analytics.trackEventView({
          ...event,
          session_duration: getSessionDuration(),
          current_screen: currentScreen.current || 'unknown',
          journey_position: journeyPath.current.length,
          session_interactions: interactionCount.current
        });
        
        // Track interaction
        interactionCount.current += 1;
      } catch (error) {
        console.warn('Error tracking event view with context:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, [getSessionDuration]),
    
    trackUserAction: useCallback((action: string, data: BaseEventParams = {}): void => {
      try {
        Analytics.logEvent('user_action', {
          action_name: action,
          session_duration: getSessionDuration(),
          current_screen: currentScreen.current || 'unknown',
          interaction_count: interactionCount.current,
          timestamp: new Date().toISOString(),
          ...data
        });
        
        // Increment interaction count
        interactionCount.current += 1;
      } catch (error) {
        console.warn('Error tracking user action:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, [getSessionDuration]),
    
    trackPerformance: useCallback((metric: string, value: number, context: BaseEventParams = {}): void => {
      try {
        Analytics.logEvent('performance_metric', {
          metric_name: metric,
          metric_value: value,
          current_screen: currentScreen.current || 'unknown',
          session_duration: getSessionDuration(),
          ...context
        });
      } catch (error) {
        console.warn('Error tracking performance metric:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, [getSessionDuration]),
    
    trackConversion: useCallback((type: string, data: BaseEventParams = {}): void => {
      try {
        Analytics.logEvent('conversion', {
          conversion_type: type,
          session_duration: getSessionDuration(),
          current_screen: currentScreen.current || 'unknown',
          journey_position: journeyPath.current.length,
          timestamp: new Date().toISOString(),
          ...data
        });
      } catch (error) {
        console.warn('Error tracking conversion:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, [getSessionDuration]),
    
    // Advanced context-aware methods
    trackContentDiscoveryWithContext: useCallback((
      method: ContentDiscoveryData['method'], 
      contentType: ContentDiscoveryData['contentType'], 
      results: number, 
      additionalData: Partial<ContentDiscoveryData> = {}
    ): void => {
      try {
        Analytics.trackContentDiscovery({
          method,
          contentType,
          results,
          ...additionalData
        });
        
        // Track interaction
        interactionCount.current += 1;
        featuresUsed.current.add(`discovery_${method}`);
      } catch (error) {
        console.warn('Error tracking content discovery with context:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, []),
    
    trackEngagementWithContext: useCallback((engagementData: Partial<EngagementDepthData> = {}): void => {
      try {
        const currentMetrics = getEngagementMetrics();
        
        Analytics.trackEngagementDepth(
          currentScreen.current || 'unknown',
          currentMetrics.timeSpent,
          {
            ...engagementData,
            interactions: currentMetrics.interactions,
            featuresUsed: currentMetrics.featuresUsed
          }
        );
      } catch (error) {
        console.warn('Error tracking engagement with context:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, [getEngagementMetrics]),
    
    trackJourneyStep: useCallback((toScreen: string, action?: string): void => {
      try {
        const fromScreen = currentScreen.current || 'unknown';
        
        Analytics.trackUserJourney({
          fromScreen,
          toScreen,
          path: [...journeyPath.current, toScreen],
          sessionDuration: engagementStartTime.current ? Date.now() - engagementStartTime.current : 0,
          touchpoints: touchpointCount.current + 1
        });
        
        if (action) {
          featuresUsed.current.add(action);
        }
        
        touchpointCount.current += 1;
      } catch (error) {
        console.warn('Error tracking journey step:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, []),
    
    trackPerformanceWithThreshold: useCallback((
      metric: string, 
      value: number, 
      threshold: number, 
      category: PerformanceMetrics['category']
    ): void => {
      try {
        Analytics.trackPerformanceMetric({
          metric,
          value,
          threshold,
          category,
          context: {
            current_screen: currentScreen.current,
            session_duration: getSessionDuration()
          }
        });
      } catch (error) {
        console.warn('Error tracking performance with threshold:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, [getSessionDuration]),
    
    // Session and journey tracking
    startEngagementTracking: useCallback((): void => {
      engagementStartTime.current = Date.now();
      interactionCount.current = 0;
      featuresUsed.current.clear();
    }, []),
    
    endEngagementTracking: useCallback((): void => {
      if (engagementStartTime.current) {
        const metrics = getEngagementMetrics();
        Analytics.trackEngagementDepth(
          currentScreen.current || 'unknown',
          metrics.timeSpent,
          {
            interactions: metrics.interactions,
            featuresUsed: metrics.featuresUsed
          }
        );
      }
    }, [getEngagementMetrics]),
    
    addJourneyTouchpoint: useCallback((screen: string, action?: string): void => {
      journeyPath.current.push(screen);
      touchpointCount.current += 1;
      
      if (action) {
        featuresUsed.current.add(action);
        interactionCount.current += 1;
      }
    }, []),
    
    trackFeatureUsage: useCallback((feature: string, duration?: number): void => {
      try {
        featuresUsed.current.add(feature);
        interactionCount.current += 1;
        
        Analytics.trackFeatureEngagement(feature, {
          current_screen: currentScreen.current,
          session_duration: getSessionDuration(),
          feature_duration: duration,
          total_features_used: featuresUsed.current.size
        });
      } catch (error) {
        console.warn('Error tracking feature usage:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, [getSessionDuration]),
    
    // Utility methods
    getSessionDuration,
    
    getCurrentScreen: useCallback((): string => {
      return currentScreen.current || 'unknown';
    }, []),
    
    getJourneyPath,
    getEngagementMetrics,
    
    manualTrackScreen: useCallback((screenName: string, params: BaseEventParams = {}): void => {
      try {
        Analytics.trackScreenView(screenName, {
          session_duration: getSessionDuration(),
          manual_track: true,
          journey_position: journeyPath.current.length,
          ...params
        });
        
        currentScreen.current = screenName;
        journeyPath.current.push(screenName);
        touchpointCount.current += 1;
      } catch (error) {
        console.warn('Error manually tracking screen:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, [getSessionDuration]),
    
    // Business intelligence methods
    trackUserSegment: useCallback((segment: string, characteristics: BaseEventParams = {}): void => {
      try {
        Analytics.logEvent('user_segment', {
          segment_name: segment,
          session_duration: getSessionDuration(),
          engagement_level: Analytics.getEngagementTier(
            engagementStartTime.current ? Date.now() - engagementStartTime.current : 0,
            interactionCount.current
          ),
          ...characteristics
        });
      } catch (error) {
        console.warn('Error tracking user segment:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, [getSessionDuration]),
    
    trackFeatureFunnel: useCallback((funnelName: string, step: string, completed: boolean): void => {
      try {
        Analytics.logEvent('feature_funnel', {
          funnel_name: funnelName,
          funnel_step: step,
          step_completed: completed,
          current_screen: currentScreen.current,
          session_duration: getSessionDuration()
        });
      } catch (error) {
        console.warn('Error tracking feature funnel:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, [getSessionDuration]),
    
    trackRetentionEvent: useCallback((event: string, daysSinceInstall: number): void => {
      try {
        Analytics.logEvent('retention_event', {
          retention_event: event,
          days_since_install: daysSinceInstall,
          session_duration: getSessionDuration(),
          journey_depth: journeyPath.current.length
        });
      } catch (error) {
        console.warn('Error tracking retention event:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, [getSessionDuration]),
    
    trackRevenueEvent: useCallback((revenue: number, currency: string, source: string): void => {
      try {
        Analytics.logEvent('revenue_event', {
          revenue_amount: revenue,
          revenue_currency: currency,
          revenue_source: source,
          session_duration: getSessionDuration(),
          user_journey: journeyPath.current.slice(-5).join(' -> ')
        });
      } catch (error) {
        console.warn('Error tracking revenue event:', error instanceof Error ? error.message : 'Unknown error');
      }
    }, [getSessionDuration])
  };
  
  return analyticsAPI;
};

export default useAnalytics;
export type { AnalyticsAPI };