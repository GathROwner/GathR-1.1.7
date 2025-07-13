/**
 * Enhanced Centralized Analytics Service for GathR Application
 * Phase 4: Console-only analytics (Firebase Web SDK doesn't support React Native)
 * 
 * NOTE: This version logs to console only since Firebase Web SDK Analytics
 * is not supported in React Native. AdMob will work independently.
 */

// Type definitions
interface BaseEventParams {
  [key: string]: string | number | boolean | null | undefined;
}

interface UserProperties {
  email?: string | null;
  display_name?: string | null;
  registration_method?: string;
  login_method?: string;
  has_profile_image?: boolean;
  user_interests_count?: number;
  saved_events_count?: number;
  account_created?: string;
  email_verified?: boolean;
  is_guest?: boolean;
  creation_time?: string | null;
  last_sign_in_time?: string | null;
  guest_session_start?: string;
  [key: string]: string | number | boolean | null | undefined;
}

interface EventData {
  id?: string | number;
  title?: string;
  category?: string;
  type?: string;
  venue?: string;
  ticketPrice?: string;
  [key: string]: any;
}

interface ErrorContext {
  screen?: string;
  action?: string;
  user_id?: string;
  context?: string;
  error_code?: string;
  duration_ms?: number;
  [key: string]: string | number | boolean | null | undefined;
}

// Enhanced interfaces for Phase 4
interface ContentDiscoveryData {
  method: 'list_view' | 'map_view' | 'search' | 'filter' | 'recommendation';
  contentType: 'event' | 'special' | 'venue';
  results: number;
  personalized?: boolean;
  filterCriteria?: string[];
  searchQuery?: string;
}

interface EngagementDepthData {
  screenName: string;
  timeSpent: number;
  interactions: number;
  scrollDepth?: number;
  featuresUsed?: string[];
  conversionEvents?: number;
}

interface UserJourneyData {
  fromScreen: string;
  toScreen: string;
  path: string[];
  sessionDuration: number;
  touchpoints: number;
  conversionFunnel?: string;
}

interface PerformanceMetrics {
  metric: string;
  value: number;
  threshold?: number;
  category: 'load_time' | 'response_time' | 'scroll_performance' | 'memory_usage' | 'network';
  context?: BaseEventParams;
}

/**
 * Core Analytics Functions - Console Logging Only
 */

const logEvent = (eventName: string, parameters: BaseEventParams = {}): void => {
  try {
    // Sanitize parameters for consistent logging
    const sanitizedParams: { [key: string]: any } = {};
    Object.keys(parameters).forEach(key => {
      const firebaseKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      sanitizedParams[firebaseKey] = parameters[key];
    });
    
    // Log to console with timestamp and formatting
    const timestamp = new Date().toISOString();
    console.log(`📊 Analytics Event [${timestamp}]: ${eventName}`, sanitizedParams);
  } catch (error) {
    console.warn('Failed to log analytics event:', eventName, error instanceof Error ? error.message : 'Unknown error');
  }
};

const initializeUser = (userId: string, properties: UserProperties = {}): void => {
  try {
    console.log(`👤 Analytics User Initialized: ${userId}`, properties);
    
    // Log user properties
    if (Object.keys(properties).length > 0) {
      logEvent('user_properties_set', {
        user_id: userId,
        properties_count: Object.keys(properties).length,
        ...properties
      });
    }
  } catch (error) {
    console.warn('Failed to initialize user analytics:', error instanceof Error ? error.message : 'Unknown error');
  }
};

const trackUserRegistration = (method: string = 'email'): void => {
  try {
    logEvent('sign_up', {
      method: method,
      timestamp: new Date().toISOString(),
      app_version: '1.0.7'
    });
  } catch (error) {
    console.warn('Failed to track user registration:', error instanceof Error ? error.message : 'Unknown error');
  }
};

const trackUserLogin = (method: string = 'email'): void => {
  try {
    logEvent('login', {
      method: method,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.warn('Failed to track user login:', error instanceof Error ? error.message : 'Unknown error');
  }
};

const trackInterestSelection = (interests: string[] = []): void => {
  try {
    logEvent('interest_selection_complete', {
      selected_interests: interests.join(','),
      interest_count: interests.length,
      timestamp: new Date().toISOString()
    });
    
    interests.forEach((interest, index) => {
      logEvent('interest_selected', {
        interest_name: interest,
        selection_order: index + 1
      });
    });
  } catch (error) {
    console.warn('Failed to track interest selection:', error instanceof Error ? error.message : 'Unknown error');
  }
};

const trackEventView = (event: EventData = {}): void => {
  try {
    const eventData = {
      event_id: event.id?.toString() || 'unknown',
      event_title: event.title || 'Unknown Event',
      event_category: event.category || 'uncategorized',
      event_type: event.type || 'event',
      venue_name: event.venue || 'Unknown Venue',
      has_ticket_price: !!event.ticketPrice,
      timestamp: new Date().toISOString()
    };
    
    logEvent('view_item', eventData);
    
    if (event.type === 'special') {
      logEvent('view_special', eventData);
    } else {
      logEvent('view_event', eventData);
    }
  } catch (error) {
    console.warn('Failed to track event view:', error instanceof Error ? error.message : 'Unknown error');
  }
};

const trackEventFilter = (filterType: string, filterValue: string | string[], additionalData: BaseEventParams = {}): void => {
  try {
    const filterData = {
      filter_type: filterType,
      filter_value: Array.isArray(filterValue) ? filterValue.join(',') : String(filterValue),
      timestamp: new Date().toISOString(),
      ...additionalData
    };
    
    logEvent('filter_events', filterData);
    
    logEvent(`filter_${filterType}`, {
      value: filterData.filter_value,
      ...additionalData
    });
  } catch (error) {
    console.warn('Failed to track event filter:', error instanceof Error ? error.message : 'Unknown error');
  }
};

const trackMapInteraction = (type: string, data: BaseEventParams = {}): void => {
  try {
    const interactionData = {
      interaction_type: type,
      timestamp: new Date().toISOString(),
      ...data
    };
    
    logEvent('map_interaction', interactionData);
    
    switch (type) {
      case 'marker_tap':
        logEvent('map_marker_tap', {
          event_id: data.eventId?.toString() || 'unknown',
          venue_name: data.venueName?.toString() || 'unknown'
        });
        break;
      case 'zoom':
        logEvent('map_zoom', {
          zoom_level: data.zoomLevel?.toString() || 'unknown',
          zoom_direction: data.direction?.toString() || 'unknown'
        });
        break;
      case 'cluster_tap':
        logEvent('map_cluster_tap', {
          cluster_size: data.clusterSize?.toString() || 'unknown'
        });
        break;
    }
  } catch (error) {
    console.warn('Failed to track map interaction:', error instanceof Error ? error.message : 'Unknown error');
  }
};

const trackScreenView = (screenName: string, params: BaseEventParams = {}): void => {
  try {
    const screenData = {
      screen_name: screenName,
      screen_class: screenName,
      timestamp: new Date().toISOString(),
      ...params
    };
    
    logEvent('screen_view', screenData);
  } catch (error) {
    console.warn('Failed to track screen view:', error instanceof Error ? error.message : 'Unknown error');
  }
};

const trackError = (type: string, message: string, context: ErrorContext = {}): void => {
  try {
    const errorData = {
      error_type: type,
      error_message: message.substring(0, 100),
      timestamp: new Date().toISOString(),
      ...context
    };
    
    logEvent('app_error', errorData);
    
    console.error(`🚨 Tracked Error [${type}]:`, message, context);
  } catch (error) {
    console.warn('Failed to track error:', error instanceof Error ? error.message : 'Unknown error');
  }
};

const trackSessionStart = (): void => {
  try {
    logEvent('session_start', {
      timestamp: new Date().toISOString(),
      app_version: '1.0.7'
    });
  } catch (error) {
    console.warn('Failed to track session start:', error instanceof Error ? error.message : 'Unknown error');
  }
};

const trackSessionEnd = (duration: number = 0): void => {
  try {
    logEvent('session_end', {
      session_duration: duration,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.warn('Failed to track session end:', error instanceof Error ? error.message : 'Unknown error');
  }
};

const trackFeatureEngagement = (feature: string, data: BaseEventParams = {}): void => {
  try {
    logEvent('feature_engagement', {
      feature_name: feature,
      timestamp: new Date().toISOString(),
      ...data
    });
  } catch (error) {
    console.warn('Failed to track feature engagement:', error instanceof Error ? error.message : 'Unknown error');
  }
};

/**
 * PHASE 4: ADVANCED ANALYTICS FUNCTIONS
 */

const trackContentDiscovery = (discoveryData: ContentDiscoveryData): void => {
  try {
    const enhancedData = {
      discovery_method: discoveryData.method,
      content_type: discoveryData.contentType,
      result_count: discoveryData.results,
      is_personalized: discoveryData.personalized || false,
      filter_criteria: discoveryData.filterCriteria?.join(',') || 'none',
      search_query: discoveryData.searchQuery || 'none',
      discovery_effectiveness: discoveryData.results > 0 ? 'successful' : 'empty',
      timestamp: new Date().toISOString()
    };
    
    logEvent('content_discovery', enhancedData);
    
    // Track method-specific discovery
    logEvent(`discovery_${discoveryData.method}`, {
      content_type: discoveryData.contentType,
      result_count: discoveryData.results,
      effectiveness: discoveryData.results > 0 ? 'successful' : 'empty'
    });
    
    // Track discovery success/failure patterns
    if (discoveryData.results === 0) {
      logEvent('discovery_empty_results', {
        method: discoveryData.method,
        content_type: discoveryData.contentType,
        search_query: discoveryData.searchQuery,
        filter_criteria: discoveryData.filterCriteria?.join(',')
      });
    }
    
    console.log('📊 Content Discovery Tracked:', enhancedData);
  } catch (error) {
    console.warn('Failed to track content discovery:', error instanceof Error ? error.message : 'Unknown error');
  }
};

const trackEngagementDepth = (screenName: string, timeSpent: number, engagementData: Partial<EngagementDepthData> = {}): void => {
  try {
    const depthData = {
      screen_name: screenName,
      time_spent_ms: timeSpent,
      time_spent_seconds: Math.floor(timeSpent / 1000),
      interaction_count: engagementData.interactions || 0,
      scroll_depth_percentage: engagementData.scrollDepth || 0,
      features_used: engagementData.featuresUsed?.join(',') || 'none',
      conversion_events: engagementData.conversionEvents || 0,
      engagement_quality: calculateEngagementQuality(timeSpent, engagementData.interactions || 0),
      timestamp: new Date().toISOString()
    };
    
    logEvent('engagement_depth', depthData);
    
    // Track engagement tiers
    const engagementTier = getEngagementTier(timeSpent, engagementData.interactions || 0);
    logEvent('engagement_tier', {
      screen_name: screenName,
      tier: engagementTier,
      time_spent_seconds: Math.floor(timeSpent / 1000)
    });
    
    // Track screen-specific engagement
    logEvent(`engagement_${screenName}`, {
      quality: depthData.engagement_quality,
      duration_tier: getDurationTier(timeSpent),
      interaction_tier: getInteractionTier(engagementData.interactions || 0)
    });
    
    console.log('📊 Engagement Depth Tracked:', depthData);
  } catch (error) {
    console.warn('Failed to track engagement depth:', error instanceof Error ? error.message : 'Unknown error');
  }
};

const trackUserJourney = (journeyData: UserJourneyData): void => {
  try {
    const enhancedJourneyData = {
      from_screen: journeyData.fromScreen,
      to_screen: journeyData.toScreen,
      navigation_path: journeyData.path.join(' -> '),
      path_length: journeyData.path.length,
      session_duration_ms: journeyData.sessionDuration,
      total_touchpoints: journeyData.touchpoints,
      conversion_funnel: journeyData.conversionFunnel || 'none',
      journey_efficiency: calculateJourneyEfficiency(journeyData.path.length, journeyData.sessionDuration),
      timestamp: new Date().toISOString()
    };
    
    logEvent('user_journey', enhancedJourneyData);
    
    // Track specific navigation patterns
    if (journeyData.path.length > 5) {
      logEvent('complex_journey', {
        path_complexity: 'high',
        path_length: journeyData.path.length,
        session_duration: journeyData.sessionDuration
      });
    }
    
    // Track bounce patterns
    if (journeyData.path.length === 1 && journeyData.sessionDuration < 30000) {
      logEvent('potential_bounce', {
        exit_screen: journeyData.fromScreen,
        session_duration_ms: journeyData.sessionDuration
      });
    }
    
    // Track conversion funnel progression
    if (journeyData.conversionFunnel) {
      logEvent('funnel_progression', {
        funnel_type: journeyData.conversionFunnel,
        stage: journeyData.toScreen,
        path_to_stage: journeyData.path.slice(-3).join(' -> ')
      });
    }
    
    console.log('📊 User Journey Tracked:', enhancedJourneyData);
  } catch (error) {
    console.warn('Failed to track user journey:', error instanceof Error ? error.message : 'Unknown error');
  }
};

const trackPerformanceMetric = (performanceData: PerformanceMetrics): void => {
  try {
    const perfData = {
      metric_name: performanceData.metric,
      metric_value: performanceData.value,
      metric_category: performanceData.category,
      threshold_value: performanceData.threshold || 0,
      performance_status: getPerformanceStatus(performanceData.value, performanceData.threshold),
      measurement_context: JSON.stringify(performanceData.context || {}),
      timestamp: new Date().toISOString()
    };
    
    logEvent('performance_metric', perfData);
    
    // Track category-specific performance
    logEvent(`performance_${performanceData.category}`, {
      metric: performanceData.metric,
      value: performanceData.value,
      status: perfData.performance_status
    });
    
    // Track performance issues
    if (performanceData.threshold && performanceData.value > performanceData.threshold) {
      logEvent('performance_threshold_exceeded', {
        metric: performanceData.metric,
        value: performanceData.value,
        threshold: performanceData.threshold,
        severity: getSeverityLevel(performanceData.value, performanceData.threshold)
      });
    }
    
    console.log('📊 Performance Metric Tracked:', perfData);
  } catch (error) {
    console.warn('Failed to track performance metric:', error instanceof Error ? error.message : 'Unknown error');
  }
};

const trackABTestEvent = (testName: string, variant: string, outcome: string, data: BaseEventParams = {}): void => {
  try {
    const testData = {
      test_name: testName,
      test_variant: variant,
      test_outcome: outcome,
      timestamp: new Date().toISOString(),
      ...data
    };
    
    logEvent('ab_test_event', testData);
    
    // Track variant-specific outcomes
    logEvent(`ab_test_${testName}`, {
      variant: variant,
      outcome: outcome,
      success: outcome === 'conversion' || outcome === 'success'
    });
    
    console.log('📊 A/B Test Event Tracked:', testData);
  } catch (error) {
    console.warn('Failed to track A/B test event:', error instanceof Error ? error.message : 'Unknown error');
  }
};

const trackBusinessMetric = (metricName: string, value: number, category: string, context: BaseEventParams = {}): void => {
  try {
    const businessData = {
      metric_name: metricName,
      metric_value: value,
      metric_category: category,
      timestamp: new Date().toISOString(),
      ...context
    };
    
    logEvent('business_metric', businessData);
    
    // Track category-specific metrics
    logEvent(`business_${category}`, {
      metric: metricName,
      value: value
    });
    
    console.log('📊 Business Metric Tracked:', businessData);
  } catch (error) {
    console.warn('Failed to track business metric:', error instanceof Error ? error.message : 'Unknown error');
  }
};

/**
 * Utility Functions for Advanced Analytics
 */

const calculateEngagementQuality = (timeSpent: number, interactions: number): string => {
  const timeScore = Math.min(timeSpent / 60000, 1); // Normalize to 1 minute
  const interactionScore = Math.min(interactions / 10, 1); // Normalize to 10 interactions
  const combinedScore = (timeScore + interactionScore) / 2;
  
  if (combinedScore > 0.8) return 'excellent';
  if (combinedScore > 0.6) return 'good';
  if (combinedScore > 0.4) return 'average';
  if (combinedScore > 0.2) return 'poor';
  return 'minimal';
};

const getEngagementTier = (timeSpent: number, interactions: number): string => {
  if (timeSpent > 300000 && interactions > 20) return 'power_user'; // 5+ minutes, 20+ interactions
  if (timeSpent > 120000 && interactions > 10) return 'engaged_user'; // 2+ minutes, 10+ interactions
  if (timeSpent > 60000 && interactions > 5) return 'active_user'; // 1+ minute, 5+ interactions
  if (timeSpent > 30000 || interactions > 2) return 'casual_user'; // 30+ seconds or 2+ interactions
  return 'passive_user';
};

const getDurationTier = (timeSpent: number): string => {
  if (timeSpent > 600000) return 'extended'; // 10+ minutes
  if (timeSpent > 300000) return 'long'; // 5+ minutes
  if (timeSpent > 120000) return 'medium'; // 2+ minutes
  if (timeSpent > 30000) return 'short'; // 30+ seconds
  return 'brief';
};

const getInteractionTier = (interactions: number): string => {
  if (interactions > 50) return 'very_high';
  if (interactions > 25) return 'high';
  if (interactions > 10) return 'medium';
  if (interactions > 5) return 'low';
  return 'minimal';
};

const calculateJourneyEfficiency = (pathLength: number, sessionDuration: number): string => {
  const timePerStep = sessionDuration / pathLength;
  
  if (timePerStep < 15000) return 'efficient'; // Less than 15 seconds per step
  if (timePerStep < 30000) return 'normal'; // Less than 30 seconds per step
  if (timePerStep < 60000) return 'slow'; // Less than 1 minute per step
  return 'very_slow';
};

const getPerformanceStatus = (value: number, threshold?: number): string => {
  if (!threshold) return 'no_threshold';
  
  const ratio = value / threshold;
  if (ratio <= 0.5) return 'excellent';
  if (ratio <= 0.8) return 'good';
  if (ratio <= 1.0) return 'acceptable';
  if (ratio <= 1.5) return 'poor';
  return 'critical';
};

const getSeverityLevel = (value: number, threshold: number): string => {
  const ratio = value / threshold;
  if (ratio <= 1.2) return 'low';
  if (ratio <= 2.0) return 'medium';
  if (ratio <= 3.0) return 'high';
  return 'critical';
};

// Export all functions
export {
  // Core functions
  initializeUser,
  trackUserRegistration,
  trackUserLogin,
  trackInterestSelection,
  trackEventView,
  trackEventFilter,
  trackMapInteraction,
  trackScreenView,
  trackError,
  trackSessionStart,
  trackSessionEnd,
  trackFeatureEngagement,
  logEvent,
  
  // Advanced Phase 4 functions
  trackContentDiscovery,
  trackEngagementDepth,
  trackUserJourney,
  trackPerformanceMetric,
  trackABTestEvent,
  trackBusinessMetric,
  
  // Utility functions
  calculateEngagementQuality,
  getEngagementTier,
  getDurationTier,
  getInteractionTier,
  calculateJourneyEfficiency,
  getPerformanceStatus,
  getSeverityLevel
};

// Export types
export type {
  BaseEventParams,
  UserProperties,
  EventData,
  ErrorContext,
  ContentDiscoveryData,
  EngagementDepthData,
  UserJourneyData,
  PerformanceMetrics
};