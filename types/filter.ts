/**
 * Filter-related type definitions for the GathR application
 */

/**
 * Time filter options for events
 * - NOW: Events happening at the current time
 * - TODAY: Events occurring on the current day
 * - UPCOMING: Events in the future (not today or now)
 * - ALL: All events regardless of time (default state)
 */
export enum TimeFilterType {
  NOW = 'now',
  TODAY = 'today',
  TOMORROW = 'tomorrow',
  UPCOMING = 'upcoming',
  ALL = 'all'
}

/**
 * Type-specific filter criteria
 * Contains filter settings specific to a content type (events or specials)
 */
export interface TypeFilterCriteria {
  // Filter by time window
  timeFilter: TimeFilterType;
  
  // Filter by category
  category?: string;
  
  // Search text specific to this type (optional feature for future implementation)
  search?: string;
  
  // Filter to show only saved events/specials
  savedOnly?: boolean;
}

/**
 * Combined filter criteria for event filtering
 */
export interface FilterCriteria {
  // Show events flag
  showEvents: boolean;
  
  // Show specials flag
  showSpecials: boolean;
  
  // Event-specific filters
  eventFilters: TypeFilterCriteria;
  
  // Special-specific filters
  specialFilters: TypeFilterCriteria;
  
  // Global search (searches across all content types)
  search?: string;
  
  // Legacy type filter (maintained for backward compatibility)
  type?: string;
}

/**
 * Category option for UI display
 */
export interface CategoryOption {
  id: string;
  label: string;
  color: string;
}

/**
 * Filter change event callback type
 */
export type FilterChangeHandler = (criteria: Partial<FilterCriteria>) => void;

/**
 * Default filter criteria - initially show both events and specials with ALL filter
 * This means no time filtering is applied by default (showing all events)
 */
export const DEFAULT_FILTER_CRITERIA: FilterCriteria = {
    showEvents: true,
    showSpecials: true,
    eventFilters: {
      timeFilter: TimeFilterType.TODAY,
      category: undefined,
      search: undefined,
      savedOnly: false
    },
    specialFilters: {
      timeFilter: TimeFilterType.TODAY,
      category: undefined,
      search: undefined,
      savedOnly: false
    },
    search: undefined,
    type: undefined
  }