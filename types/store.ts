/**
 * GathR application store types
 * Central type definitions for the application's state management
 */

import { Event, Venue, Cluster } from './events';
import { FilterCriteria, TypeFilterCriteria, TimeFilterType } from './filter';
import * as Location from 'expo-location';

/**
 * Scroll triggers interface for tab scroll-to-top functionality
 */
export interface ScrollTriggers {
  events: number;
  specials: number;
}

/**
 * Map state interface for the application
 * Defines the structure of the map store
 */
export interface MapState {
  // Event data
  events: Event[];
  specials: Event[];
  filteredEvents: Event[];
  
  // Venue and cluster data
  clusters: Cluster[];
  selectedVenue: Venue | null;
  selectedVenues: Venue[];
  selectedCluster: Cluster | null;
  
  // Location data
  userLocation: Location.LocationObject | null;
  
  // UI state
  isLoading: boolean;
  error: string | null;
  zoomLevel: number;
  filterCriteria: FilterCriteria;
  categories: string[];
  activeFilterPanel: 'events' | 'specials' | null;
  isHeaderSearchActive: boolean;
  searchQuery: string;
  
  // Scroll to top functionality
  scrollTriggers: ScrollTriggers;
  
  // Cluster visibility utility
  shouldClusterBeVisible: (cluster: Cluster, criteria: FilterCriteria) => boolean;
  
  // Actions
  setEvents: (events: Event[]) => void;
  setFilterCriteria: (criteria: Partial<FilterCriteria>) => void;
  setTypeFilters: (type: 'event' | 'special', typeFilters: Partial<TypeFilterCriteria>) => void;
  selectVenue: (venue: Venue | null) => void;
  selectVenues: (venues: Venue[]) => void;
  selectCluster: (cluster: Cluster | null) => void;
  setZoomLevel: (zoom: number) => void;
  setUserLocation: (location: Location.LocationObject) => void;
  setActiveFilterPanel: (panel: 'events' | 'specials' | null) => void;
  setHeaderSearchActive: (active: boolean) => void;
  setSearchQuery: (query: string) => void;
  triggerScrollToTop: (tab: 'events' | 'specials') => void;
  fetchEvents: () => Promise<void>;
  getFilteredEvents: () => Event[];
  generateClusters: (zoom?: number) => void;
  getTimeFilterCounts: (eventType: 'event' | 'special') => { [key in TimeFilterType]: number };
  getCategoryFilterCounts: (eventType: 'event' | 'special') => { [category: string]: number };
}