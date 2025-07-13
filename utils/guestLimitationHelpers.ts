// ===============================================================
// FILE: GathR/utils/guestLimitationHelpers.ts
// PURPOSE: Utility functions and helpers for the guest limitation system
// DESCRIPTION: This file contains helper functions for content processing,
//              limitation checks, analytics, and integration utilities that
//              support the guest limitation system throughout the app
// ===============================================================

import { InteractionType, DEFAULT_CONTENT_LIMITATION_CONFIG } from '../types/guestLimitations';

// =============================================
// TYPE DEFINITIONS
// =============================================

/**
 * Interface for event/item data that can be limited
 */
export interface LimitableItem {
  id: string;
  title?: string;
  description?: string;
  [key: string]: any;
}

/**
 * Interface for list limitation results
 */
export interface ListLimitationResult<T> {
  items: T[];                    // The limited or full list of items
  isLimited: boolean;            // Whether the list was limited
  totalCount: number;            // Total number of items available
  shownCount: number;            // Number of items being shown
  hiddenCount: number;           // Number of items hidden from guests
}

/**
 * Interface for text limitation results
 */
export interface TextLimitationResult {
  text: string;                  // The limited or full text
  isLimited: boolean;            // Whether the text was limited
  originalLength: number;        // Original text length
  truncatedLength: number;       // Truncated text length
  charactersHidden: number;      // Number of characters hidden
}

/**
 * Configuration for content limitation behavior
 */
export interface ContentLimitationOptions {
  maxLength?: number;            // Maximum text length
  maxItems?: number;             // Maximum list items
  preserveWords?: boolean;       // Whether to preserve word boundaries when truncating
  ellipsis?: string;            // Custom ellipsis text (default: '...')
  respectSentences?: boolean;    // Whether to try to end at sentence boundaries
}

// =============================================
// TEXT PROCESSING UTILITIES
// =============================================

/**
 * Truncate text content for guest users with intelligent word boundary preservation
 * @param text - The full text to potentially truncate
 * @param isGuest - Whether the user is a guest
 * @param options - Truncation options
 * @returns TextLimitationResult
 */
export const limitTextContent = (
  text: string,
  isGuest: boolean,
  options: ContentLimitationOptions = {}
): TextLimitationResult => {
  const {
    maxLength = DEFAULT_CONTENT_LIMITATION_CONFIG.maxDescriptionLength,
    preserveWords = true,
    ellipsis = '...',
    respectSentences = false
  } = options;

  // Return full text for registered users
  if (!isGuest || text.length <= maxLength) {
    return {
      text,
      isLimited: false,
      originalLength: text.length,
      truncatedLength: text.length,
      charactersHidden: 0
    };
  }

  let truncatedText = text;
  let targetLength = maxLength - ellipsis.length;

  // Try to respect sentence boundaries first
  if (respectSentences && targetLength > 50) {
    const sentences = text.split(/[.!?]+/);
    let currentLength = 0;
    let sentenceCount = 0;

    for (const sentence of sentences) {
      const sentenceLength = sentence.trim().length + 1; // +1 for punctuation
      if (currentLength + sentenceLength <= targetLength) {
        currentLength += sentenceLength;
        sentenceCount++;
      } else {
        break;
      }
    }

    if (sentenceCount > 0) {
      truncatedText = sentences.slice(0, sentenceCount).join('.').trim() + '.';
    }
  }

  // If sentence respect didn't work or wasn't enabled, use word preservation
  if (truncatedText === text && preserveWords) {
    truncatedText = text.substring(0, targetLength);
    const lastSpace = truncatedText.lastIndexOf(' ');
    
    // Only use word boundary if it's not too far back (within 20% of target)
    if (lastSpace > targetLength * 0.8) {
      truncatedText = truncatedText.substring(0, lastSpace);
    }
  } else if (truncatedText === text) {
    // Simple character truncation
    truncatedText = text.substring(0, targetLength);
  }

  // Add ellipsis if text was actually truncated
  if (truncatedText.length < text.length) {
    truncatedText += ellipsis;
  }

  return {
    text: truncatedText,
    isLimited: true,
    originalLength: text.length,
    truncatedLength: truncatedText.length,
    charactersHidden: text.length - truncatedText.length + ellipsis.length
  };
};

/**
 * Create a truncated title with appropriate length limits
 * @param title - The full title
 * @param isGuest - Whether user is a guest
 * @param maxLength - Custom max length (optional)
 * @returns Truncated title string
 */
export const limitTitleText = (
  title: string,
  isGuest: boolean,
  maxLength?: number
): string => {
  const result = limitTextContent(title, isGuest, {
    maxLength: maxLength || DEFAULT_CONTENT_LIMITATION_CONFIG.maxTitleLength,
    preserveWords: true,
    respectSentences: false,
    ellipsis: '...'
  });
  
  return result.text;
};

// =============================================
// LIST PROCESSING UTILITIES
// =============================================

/**
 * Limit a list of items for guest users
 * @param items - Array of items to potentially limit
 * @param isGuest - Whether the user is a guest
 * @param options - Limitation options
 * @returns ListLimitationResult
 */
export const limitListContent = <T extends LimitableItem>(
  items: T[],
  isGuest: boolean,
  options: ContentLimitationOptions = {}
): ListLimitationResult<T> => {
  const { maxItems = DEFAULT_CONTENT_LIMITATION_CONFIG.showPreviewCount } = options;

  // Return full list for registered users
  if (!isGuest || items.length <= maxItems) {
    return {
      items,
      isLimited: false,
      totalCount: items.length,
      shownCount: items.length,
      hiddenCount: 0
    };
  }

  // Limit items for guests
  const limitedItems = items.slice(0, maxItems);
  
  return {
    items: limitedItems,
    isLimited: true,
    totalCount: items.length,
    shownCount: limitedItems.length,
    hiddenCount: items.length - limitedItems.length
  };
};

/**
 * Apply text limitations to items in a list
 * @param items - Array of items with text properties
 * @param isGuest - Whether user is a guest
 * @param textFields - Fields to apply text limitation to
 * @returns Array of items with limited text
 */
export const limitItemTextFields = <T extends Record<string, any>>(
  items: T[],
  isGuest: boolean,
  textFields: (keyof T)[] = ['title', 'description']
): T[] => {
  if (!isGuest) return items;

  return items.map(item => {
    const limitedItem = { ...item };
    
    textFields.forEach(field => {
      if (typeof item[field] === 'string') {
        const fieldName = field as string;
        const maxLength = fieldName === 'title' 
          ? DEFAULT_CONTENT_LIMITATION_CONFIG.maxTitleLength
          : DEFAULT_CONTENT_LIMITATION_CONFIG.maxDescriptionLength;
        
        const result = limitTextContent(item[field] as string, isGuest, { maxLength });
        limitedItem[field] = result.text as T[keyof T];
      }
    });
    
    return limitedItem;
  });
};

// =============================================
// INTERACTION VALIDATION UTILITIES
// =============================================

/**
 * Check if an interaction should trigger a limitation
 * @param interactionType - The type of interaction
 * @param currentCount - Current interaction count
 * @param hasSeenPrompt - Whether user has seen the first prompt
 * @returns boolean - true if interaction should trigger limitation
 */
export const shouldTriggerLimitation = (
  interactionType: InteractionType,
  currentCount: number,
  hasSeenPrompt: boolean
): boolean => {
  const limit = hasSeenPrompt ? 5 : 3; // Different limits based on prompt history
  return currentCount >= limit;
};

/**
 * Get interaction priority for determining which interactions are most important
 * Higher priority interactions are more likely to trigger prompts
 * @param interactionType - The interaction type
 * @returns number - priority score (higher = more important)
 */
export const getInteractionPriority = (interactionType: InteractionType): number => {
  const priorities: Record<InteractionType, number> = {
    [InteractionType.CLUSTER_CLICK]: 10,           // High - core map interaction
    [InteractionType.LIST_ITEM_CLICK]: 10,         // High - core list interaction
    [InteractionType.LIST_FILTER]: 8,              // High - important functionality
    [InteractionType.CLUSTER_ITEM_CLICK]: 7,       // Medium-high - drilling down
    [InteractionType.CLUSTER_TAB_CHANGE]: 5,       // Medium - exploring content
    [InteractionType.LIST_TAB_SELECT]: 5,          // Medium - navigation
    [InteractionType.CLUSTER_VENUE_CHANGE]: 4,     // Medium-low - browsing
    [InteractionType.LIST_SCROLL]: 3,              // Low - passive browsing
    [InteractionType.CLUSTER_SCROLL]: 3,           // Low - passive browsing
    [InteractionType.LIST_PAGINATION]: 2           // Low - basic navigation
  };
  
  return priorities[interactionType] || 1;
};

// =============================================
// CONTENT PROCESSING UTILITIES
// =============================================

/**
 * Process venue data for map clusters with guest limitations
 * @param venues - Array of venue data
 * @param isGuest - Whether user is a guest
 * @returns Processed venue data
 */
export const processVenuesForGuests = (venues: any[], isGuest: boolean): any[] => {
  if (!isGuest) return venues;

  return venues.map(venue => ({
    ...venue,
    // Show only venue name for guests, hide detailed info
    name: venue.name,
    address: venue.address,
    // Remove detailed venue information
    description: '', 
    amenities: [],
    detailedInfo: null,
    // Keep essential location data
    latitude: venue.latitude,
    longitude: venue.longitude
  }));
};

/**
 * Create a preview message for limited content
 * @param contentType - Type of content being limited
 * @param hiddenCount - Number of hidden items/characters
 * @returns Formatted preview message
 */
export const createLimitationMessage = (
  contentType: 'text' | 'items' | 'events' | 'specials',
  hiddenCount: number
): string => {
  const messages = {
    text: `${hiddenCount} more characters`,
    items: `+${hiddenCount} more items`,
    events: `+${hiddenCount} more events`,
    specials: `+${hiddenCount} more specials`
  };
  
  return messages[contentType] || `+${hiddenCount} more`;
};

// =============================================
// ANALYTICS AND TRACKING UTILITIES
// =============================================

/**
 * Interface for analytics event data
 */
export interface AnalyticsEventData {
  interactionType: InteractionType;
  wasBlocked: boolean;
  userType: 'guest' | 'registered';
  interactionCount: number;
  timestamp: number;
  sessionId?: string;
  additionalData?: Record<string, any>;
}

/**
 * Create analytics event data for tracking
 * @param interactionType - The interaction type
 * @param wasBlocked - Whether the interaction was blocked
 * @param isGuest - Whether user is a guest
 * @param interactionCount - Current interaction count
 * @param additionalData - Additional tracking data
 * @returns Analytics event data
 */
export const createAnalyticsEvent = (
  interactionType: InteractionType,
  wasBlocked: boolean,
  isGuest: boolean,
  interactionCount: number,
  additionalData?: Record<string, any>
): AnalyticsEventData => {
  return {
    interactionType,
    wasBlocked,
    userType: isGuest ? 'guest' : 'registered',
    interactionCount,
    timestamp: Date.now(),
    additionalData
  };
};

/**
 * Log guest limitation events for debugging and analytics
 * @param eventData - Analytics event data
 */
export const logGuestLimitationEvent = (eventData: AnalyticsEventData): void => {
  if (__DEV__) {
    console.log('[GuestLimitation Analytics]', {
      type: eventData.interactionType,
      blocked: eventData.wasBlocked,
      user: eventData.userType,
      count: eventData.interactionCount,
      time: new Date(eventData.timestamp).toISOString()
    });
  }
  
  // TODO: Integrate with your analytics service
  // analyticsService.track('guest_limitation_interaction', eventData);
};

// =============================================
// COMPONENT INTEGRATION HELPERS
// =============================================

/**
 * Create props for integrating guest limitations into existing components
 * @param isGuest - Whether user is a guest
 * @param onInteraction - Interaction tracking function
 * @returns Object with common limitation props
 */
export const createGuestLimitationProps = (
  isGuest: boolean,
  onInteraction: (type: InteractionType) => boolean
) => {
  return {
    isGuest,
    onInteraction,
    // Helper methods that components can use
    trackClick: (type: InteractionType) => onInteraction(type),
    trackScroll: () => onInteraction(InteractionType.LIST_SCROLL),
    trackFilter: () => onInteraction(InteractionType.LIST_FILTER),
    // Content limitation helpers
    limitText: (text: string, maxLength?: number) => 
      limitTextContent(text, isGuest, { maxLength }).text,
    limitList: <T extends LimitableItem>(items: T[], maxItems?: number) =>
      limitListContent(items, isGuest, { maxItems })
  };
};

/**
 * Higher-order function to wrap component methods with interaction tracking
 * @param method - Original component method
 * @param interactionType - Type of interaction this method represents
 * @param trackInteraction - Interaction tracking function
 * @returns Wrapped method that tracks interactions
 */
export const wrapWithInteractionTracking = <T extends any[], R>(
  method: (...args: T) => R,
  interactionType: InteractionType,
  trackInteraction: (type: InteractionType) => boolean
) => {
  return (...args: T): R | undefined => {
    // Track the interaction first
    const allowed = trackInteraction(interactionType);
    
    // Only execute the original method if interaction was allowed
    if (allowed) {
      return method(...args);
    }
    
    // Return undefined if interaction was blocked
    return undefined;
  };
};

// =============================================
// TESTING AND DEVELOPMENT UTILITIES
// =============================================

/**
 * Generate mock interaction data for testing
 * @param count - Number of interactions to generate
 * @returns Array of interaction types
 */
export const generateMockInteractions = (count: number): InteractionType[] => {
  const allTypes = Object.values(InteractionType);
  const interactions: InteractionType[] = [];
  
  for (let i = 0; i < count; i++) {
    const randomType = allTypes[Math.floor(Math.random() * allTypes.length)];
    interactions.push(randomType);
  }
  
  return interactions;
};

/**
 * Validate guest limitation configuration
 * @param config - Configuration to validate
 * @returns Validation results
 */
export const validateGuestLimitationConfig = (config: any): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];
  
  if (config.initialInteractionLimit < 1) {
    errors.push('Initial interaction limit must be at least 1');
  }
  
  if (config.subsequentInteractionLimit < 1) {
    errors.push('Subsequent interaction limit must be at least 1');
  }
  
  if (config.maxDailyPrompts < 1) {
    errors.push('Max daily prompts must be at least 1');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// =============================================
// EXPORT EVERYTHING
// =============================================

export default {
  // Text processing
  limitTextContent,
  limitTitleText,
  
  // List processing
  limitListContent,
  limitItemTextFields,
  
  // Interaction validation
  shouldTriggerLimitation,
  getInteractionPriority,
  
  // Content processing
  processVenuesForGuests,
  createLimitationMessage,
  
  // Analytics
  createAnalyticsEvent,
  logGuestLimitationEvent,
  
  // Component integration
  createGuestLimitationProps,
  wrapWithInteractionTracking,
  
  // Testing utilities
  generateMockInteractions,
  validateGuestLimitationConfig
};