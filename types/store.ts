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
  allEvents: Event[];  // Global cache (all 112 items from React Query)
  events: Event[];
  specials: Event[];
  filteredEvents: Event[];

  // Viewport-aware event data
  viewportEvents: Event[];
  outsideViewportEvents: Event[];
  onScreenEvents: Event[];  // Events visible on actual screen (filtered by screen coordinates)
  viewportBbox: { west: number; south: number; east: number; north: number } | null;
  viewportMetadata: {
    wasCapped: boolean;
    viewportCount: number;
    outsideViewportCount: number;
    lastFetchTimestamp: string | null;
  };
  
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
  lastFetchedAt: number | null;
    
  // Scroll to top functionality

  scrollTriggers: ScrollTriggers;
  
  // Close callout functionality
  closeCalloutTrigger: number;

  // Lightbox state for event image viewing
  selectedImageData: {
    imageUrl: string;
    event: Event;
    venue?: Venue;
    cluster?: Cluster;
  } | null;

  // Cluster visibility utility
  shouldClusterBeVisible: (cluster: Cluster, criteria: FilterCriteria) => boolean;
  
  // Actions
  setAllEvents: (events: Event[]) => void;  // For React Query global cache
  setEvents: (events: Event[]) => void;  // Deprecated - use setAllEvents
  setFilterCriteria: (criteria: Partial<FilterCriteria>) => void;
  setTypeFilters: (
    type: 'event' | 'special',
    typeFilters: Partial<TypeFilterCriteria>,
    source?: 'filter-pills' | 'interest-pills'
  ) => void;
  selectVenue: (venue: Venue | null) => void;
  selectVenues: (venues: Venue[]) => void;
  selectCluster: (cluster: Cluster | null) => void;
  setZoomLevel: (zoom: number) => void;
  setUserLocation: (location: Location.LocationObject) => void;
  setActiveFilterPanel: (panel: 'events' | 'specials' | null) => void;
  setHeaderSearchActive: (active: boolean) => void;
  setSearchQuery: (query: string) => void;
  triggerScrollToTop: (tab: 'events' | 'specials') => void;
  triggerCloseCallout: () => void;
  setSelectedImageData: (data: { imageUrl: string; event: Event; venue?: Venue; cluster?: Cluster } | null) => void;
  fetchEvents: () => Promise<void>;
  prefetchIfStale: (maxAgeMs?: number) => Promise<void>;
  getFilteredEvents: () => Event[];
  generateClusters: (zoom?: number) => void;
  getTimeFilterCounts: (eventType: 'event' | 'special') => { [key in TimeFilterType]: number };
  getCategoryFilterCounts: (eventType: 'event' | 'special') => { [category: string]: number };
  fetchEventDetails: (eventIds: (string | number)[]) => Promise<void>;

  // Viewport-aware actions
  fetchViewportEvents: (bbox: { west: number; south: number; east: number; north: number }) => Promise<void>;
  setViewportBbox: (bbox: { west: number; south: number; east: number; north: number }) => void;
  setOnScreenEvents: (events: Event[]) => void;
}
