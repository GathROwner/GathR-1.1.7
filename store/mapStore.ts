/**
 * Map store for the GathR application
 * Implements state management for map functionality, event data, and filtering
 * Uses discrete zoom thresholds for predictable clustering behavior
 */

import { create } from 'zustand';
import { Event, Venue, Cluster, TimeStatus, InterestLevel } from '../types/events';
import { FilterCriteria, TimeFilterType, TypeFilterCriteria } from '../types/filter';
import { MapState } from '../types/store';
import * as Location from 'expo-location';

// Import centralized date utilities
import { 
  isEventNow,
  isEventHappeningToday,
  getEventTimeStatus,
  sortEventsByTimeStatus
} from '../utils/dateUtils';

// Import default filter criteria
import { DEFAULT_FILTER_CRITERIA } from '../types/filter';

// Define zoom threshold bands and their corresponding clustering radii
export interface ZoomThreshold {
  name: string;        // Human-readable name for the threshold
  minZoom: number;     // Minimum zoom level for this threshold
  maxZoom: number;     // Maximum zoom level for this threshold
  radius: number;      // Clustering radius in meters for this threshold
}

export const ZOOM_THRESHOLDS: ZoomThreshold[] = [
  { name: "Ultra-Close", minZoom: 18, maxZoom: 22.99, radius: 10 },     // 10m radius - Individual venues, even adjacent buildings
  { name: "Street",      minZoom: 15, maxZoom: 17.99, radius: 50 },     // 50m radius - Street section level
  { name: "Neighborhood", minZoom: 13, maxZoom: 14.99, radius: 200 },   // 200m radius - Neighborhood level
  { name: "District",    minZoom: 11, maxZoom: 12.99, radius: 1000 },   // 1km radius - District/area level  
  { name: "City",        minZoom: 9,  maxZoom: 10.99, radius: 5000 },   // 5km radius - City level
  { name: "Region",      minZoom: 7,  maxZoom: 8.99,  radius: 20000 },  // 20km radius - Regional level
  { name: "Wide Area",   minZoom: 0,  maxZoom: 6.99,  radius: 50000 }   // 50km radius - Wide area view
];

// Variables to track state
let lastClusters: Cluster[] = [];         // Last generated clusters for potential reuse
let currentThresholdIndex = 2;            // Default to Neighborhood level (index 2)
let filtersChanged = true;                // Track if filters have changed

/**
 * Find the appropriate threshold index for a given zoom level
 */
export const getThresholdIndexForZoom = (zoom: number): number => {
  for (let i = 0; i < ZOOM_THRESHOLDS.length; i++) {
    const threshold = ZOOM_THRESHOLDS[i];
    if (zoom >= threshold.minZoom && zoom <= threshold.maxZoom) {
      return i;
    }
  }
  // Fallback to Neighborhood if for some reason we can't find a matching threshold
  return 2;
};

/**
 * Group events by venue and create venue objects
 */
const groupEventsByVenue = (events: Event[]): Venue[] => {
  const venueMap = new Map<string, Venue>();
  
  events.forEach(event => {
    const locationKey = createLocationKey(event);
    
    if (!venueMap.has(locationKey)) {
      venueMap.set(locationKey, {
        locationKey,
        venue: event.venue,
        address: event.address,
        latitude: event.latitude,
        longitude: event.longitude,
        events: []
      });
    }
    
    venueMap.get(locationKey)?.events.push(event);
  });
  
  return Array.from(venueMap.values());
};

/**
 * Create a consistent location key from event data
 */
const createLocationKey = (event: Event): string => {
  const venueName = event.venue.toLowerCase().trim().replace(/\s+/g, ' ');
  
  try {
    if (!event.address || event.address.trim() === '') {
      return `${venueName}_${event.latitude.toFixed(5)},${event.longitude.toFixed(5)}`;
    }
    
    const addressParts = event.address.split(',');
    const street = addressParts[0]?.trim().replace(/\s+/g, ' ') || '';
    
    let city = '';
    if (addressParts.length > 1) {
      city = addressParts[1].trim().split(/\s+/)[0] || '';
    }
    
    return `${venueName}_${street}_${city}`.toLowerCase().replace(/\s+/g, ' ');
  } catch (error) {
    console.warn(`Address parsing failed for venue "${event.venue}". Using coordinates.`);
    return `${venueName}_${event.latitude.toFixed(5)},${event.longitude.toFixed(5)}`;
  }
};

/**
 * Generate a stable ID for a cluster based on member venues
 */
const generateClusterId = (venues: Venue[]): string => {
  const sortedKeys = venues.map(v => v.locationKey).sort();
  return sortedKeys.join('|');
};

/**
 * Determine the time status of a cluster based on its events
 */
const determineClusterTimeStatus = (venues: Venue[]): TimeStatus => {
  const hasNowEvents = venues.some(venue => 
    venue.events.some(event => isEventNow(
      event.startDate, 
      event.startTime, 
      event.endDate || event.startDate, 
      event.endTime || ''
    ))
  );
  
  if (hasNowEvents) return 'now';
  
  const hasTodayEvents = venues.some(venue => 
    venue.events.some(event => isEventHappeningToday(event))
  );
  
  if (hasTodayEvents) return 'today';
  
  return 'future';
};

/**
 * Calculate interest level based on event metrics
 */
const calculateInterestLevel = (venues: Venue[]): InterestLevel => {
  const totalEvents = venues.reduce((sum, venue) => sum + venue.events.length, 0);
  
  if (totalEvents >= 8) return 'high';
  if (totalEvents >= 3) return 'medium';
  return 'low';
};

/**
 * Determines if an event matches the given type-specific filters
 */
const doesEventMatchTypeFilters = (event: Event, typeFilters: TypeFilterCriteria): boolean => {
  // Check time filter
  if (typeFilters.timeFilter === TimeFilterType.ALL) {
    // No time filtering - show all events
    // Continue to other filters
  } else if (typeFilters.timeFilter === TimeFilterType.NOW) {
    const isNow = isEventNow(
      event.startDate, 
      event.startTime, 
      event.endDate || event.startDate, 
      event.endTime || ''
    );
    if (!isNow) return false;
  } else if (typeFilters.timeFilter === TimeFilterType.TODAY) {
    const isToday = isEventHappeningToday(event);
    if (!isToday) return false;
  } else if (typeFilters.timeFilter === TimeFilterType.UPCOMING) {
    // UPCOMING should only show future events (not now or today)
    const timeStatus = getEventTimeStatus(event);
    if (timeStatus !== 'future') return false;
  }
  
  // Check category filter
  if (typeFilters.category && 
      event.category.toLowerCase() !== typeFilters.category.toLowerCase()) {
    return false;
  }
  
  // Check search filter if implemented
  if (typeFilters.search && typeFilters.search.trim() !== '') {
    const searchTerm = typeFilters.search.toLowerCase().trim();
    const matchesSearch = 
      event.title.toLowerCase().includes(searchTerm) ||
      event.description.toLowerCase().includes(searchTerm) ||
      event.venue.toLowerCase().includes(searchTerm);
    
    if (!matchesSearch) return false;
  }
  
  // If passed all filter checks, the event matches
  return true;
};

/**
 * Determines if a cluster should be visible based on all active filters
 */
const shouldClusterBeVisible = (cluster: Cluster, criteria: FilterCriteria): boolean => {
  for (const venue of cluster.venues) {
    for (const event of venue.events) {
      // Apply type visibility filter first
      const isVisible = 
        (event.type === 'event' && criteria.showEvents) || 
        (event.type === 'special' && criteria.showSpecials);
      
      if (!isVisible) continue;
      
      // Apply type-specific filters based on event type
      const typeFilters = event.type === 'event' 
        ? criteria.eventFilters 
        : criteria.specialFilters;
      
      if (doesEventMatchTypeFilters(event, typeFilters)) {
        return true; // This event matches all filters
      }
    }
  }
  
  return false;
};

/**
 * Count total events across all clusters
 */
const countTotalEvents = (clusters: Cluster[]): number => {
  return clusters.reduce((total, cluster) => {
    return total + cluster.venues.reduce((venueTotal, venue) => 
      venueTotal + venue.events.length, 0);
  }, 0);
};

/**
 * Calculate distance between two coordinates using the Haversine formula
 * Returns distance in meters
 */
export const calculateDistance = (
  lat1: number, lon1: number, 
  lat2: number, lon2: number
): number => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Filter events with type-specific filter support
 */
const filterEvents = (events: Event[], criteria: FilterCriteria): Event[] => {
  return events.filter(event => {
    // Apply basic visibility filter
    const isVisible = 
      (event.type === 'event' && criteria.showEvents) || 
      (event.type === 'special' && criteria.showSpecials);
    
    if (!isVisible) return false;
    
    // Apply type-specific filters
    const typeFilters = event.type === 'event' 
      ? criteria.eventFilters 
      : criteria.specialFilters;
    
    return doesEventMatchTypeFilters(event, typeFilters);
  });
};

/**
 * Calculate counts for time filter options
 * Returns counts for each time filter option given current criteria
 */
const calculateTimeFilterCounts = (
  events: Event[], 
  currentCriteria: FilterCriteria, 
  eventType: 'event' | 'special'
): { [key in TimeFilterType]: number } => {
  // Filter by visibility and other criteria (excluding time filter)
  const baseEvents = events.filter(event => {
    // Apply type visibility filter
    const isVisible = 
      (event.type === 'event' && currentCriteria.showEvents) || 
      (event.type === 'special' && currentCriteria.showSpecials);
    
    if (!isVisible || event.type !== eventType) return false;
    
    // Apply category filter if active
    const typeFilters = eventType === 'event' 
      ? currentCriteria.eventFilters 
      : currentCriteria.specialFilters;
    
    if (typeFilters.category && 
        event.category.toLowerCase() !== typeFilters.category.toLowerCase()) {
      return false;
    }
    
    // Apply search filter if active
    if (typeFilters.search && typeFilters.search.trim() !== '') {
      const searchTerm = typeFilters.search.toLowerCase().trim();
      const matchesSearch = 
        event.title.toLowerCase().includes(searchTerm) ||
        event.description.toLowerCase().includes(searchTerm) ||
        event.venue.toLowerCase().includes(searchTerm);
      
      if (!matchesSearch) return false;
    }
    
    return true;
  });
  
  // Calculate counts for each time filter
  const counts = {
    [TimeFilterType.ALL]: baseEvents.length,
    [TimeFilterType.NOW]: baseEvents.filter(event => 
      isEventNow(
        event.startDate, 
        event.startTime, 
        event.endDate || event.startDate, 
        event.endTime || ''
      )
    ).length,
    [TimeFilterType.TODAY]: baseEvents.filter(event => 
      isEventHappeningToday(event)
    ).length,
    [TimeFilterType.UPCOMING]: baseEvents.filter(event => {
      const timeStatus = getEventTimeStatus(event);
      return timeStatus === 'future';
    }).length
  };
  
  return counts;
};

/**
 * Calculate counts for category filter options
 * Returns counts for each category given current criteria
 */
const calculateCategoryFilterCounts = (
  events: Event[], 
  currentCriteria: FilterCriteria, 
  eventType: 'event' | 'special'
): { [category: string]: number } => {
  // Get all unique categories for this event type
  const allCategories = Array.from(new Set(
    events
      .filter(event => event.type === eventType)
      .map(event => event.category)
  ));
  
  const counts: { [category: string]: number } = {};
  
  // Calculate count for each category
  allCategories.forEach(category => {
    const categoryEvents = events.filter(event => {
      // Apply type visibility filter
      const isVisible = 
        (event.type === 'event' && currentCriteria.showEvents) || 
        (event.type === 'special' && currentCriteria.showSpecials);
      
      if (!isVisible || event.type !== eventType) return false;
      
      // Must match this category
      if (event.category.toLowerCase() !== category.toLowerCase()) return false;
      
      // Apply time filter if active
      const typeFilters = eventType === 'event' 
        ? currentCriteria.eventFilters 
        : currentCriteria.specialFilters;
      
      // Apply time filter logic
      if (typeFilters.timeFilter === TimeFilterType.NOW) {
        const isNow = isEventNow(
          event.startDate, 
          event.startTime, 
          event.endDate || event.startDate, 
          event.endTime || ''
        );
        if (!isNow) return false;
      } else if (typeFilters.timeFilter === TimeFilterType.TODAY) {
        const isToday = isEventHappeningToday(event);
        if (!isToday) return false;
      } else if (typeFilters.timeFilter === TimeFilterType.UPCOMING) {
        const timeStatus = getEventTimeStatus(event);
        if (timeStatus !== 'future') return false;
      }
      // TimeFilterType.ALL requires no additional filtering
      
      // Apply search filter if active
      if (typeFilters.search && typeFilters.search.trim() !== '') {
        const searchTerm = typeFilters.search.toLowerCase().trim();
        const matchesSearch = 
          event.title.toLowerCase().includes(searchTerm) ||
          event.description.toLowerCase().includes(searchTerm) ||
          event.venue.toLowerCase().includes(searchTerm);
        
        if (!matchesSearch) return false;
      }
      
      return true;
    });
    
    counts[category] = categoryEvents.length;
  });
  
  return counts;
};

/**
 * Cluster venues based on geographic proximity using discrete zoom thresholds
 * Returns an array of Cluster objects
 */
const clusterVenues = (venues: Venue[], zoom: number = 12): Cluster[] => {
  // Return empty array for empty venues
  if (venues.length === 0) return [];
  
  // Determine the appropriate threshold for this zoom level
  const thresholdIndex = getThresholdIndexForZoom(zoom);
  const threshold = ZOOM_THRESHOLDS[thresholdIndex];
  
  console.log(`Current zoom: ${zoom.toFixed(1)}, threshold: ${threshold.name} (${threshold.radius}m radius)`);
  
  // Check if we've crossed a threshold boundary
  const thresholdChanged = thresholdIndex !== currentThresholdIndex;
  
  // If threshold hasn't changed and filters haven't changed, reuse existing clusters
  if (!thresholdChanged && !filtersChanged && lastClusters.length > 0) {
    console.log(`No threshold change, reusing ${lastClusters.length} existing clusters`);
    return lastClusters;
  }
  
  // If we get here, we need to recalculate clusters
  if (thresholdChanged) {
    console.log(`Threshold changed from ${ZOOM_THRESHOLDS[currentThresholdIndex].name} to ${threshold.name} - reclustering`);
    currentThresholdIndex = thresholdIndex;
  } else if (filtersChanged) {
    console.log(`Filters changed - reclustering`);
  }
  
  // Get the clustering radius for the current threshold
  const radius = threshold.radius;
  
  // Sort venues for consistent clustering
  const sortedVenues = [...venues].sort((a, b) => {
    if (a.latitude !== b.latitude) return a.latitude - b.latitude;
    return a.longitude - b.longitude;
  });
  
  // Distance cache for performance
  const distanceCache = new Map<string, number>();
  
  // Function to get distance with caching
  const getDistance = (venueA: Venue, venueB: Venue): number => {
    if (venueA === venueB) return 0;
    
    const keyA = venueA.locationKey;
    const keyB = venueB.locationKey;
    const cacheKey = keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
    
    if (distanceCache.has(cacheKey)) {
      return distanceCache.get(cacheKey)!;
    }
    
    const distance = calculateDistance(
      venueA.latitude, venueA.longitude,
      venueB.latitude, venueB.longitude
    );
    
    distanceCache.set(cacheKey, distance);
    return distance;
  };
  
  // Keep track of venues we've already processed
  const processedVenues = new Set<Venue>();
  const clusters: Cluster[] = [];
  
  // Process each venue
  for (const venue of sortedVenues) {
    if (processedVenues.has(venue)) continue;
    
    // Start a new cluster with this venue
    const clusterVenues: Venue[] = [venue];
    processedVenues.add(venue);
    
    // Find nearby venues within radius
    for (const otherVenue of sortedVenues) {
      if (venue === otherVenue || processedVenues.has(otherVenue)) continue;
      
      const distance = getDistance(venue, otherVenue);
      
      if (distance <= radius) {
        clusterVenues.push(otherVenue);
        processedVenues.add(otherVenue);
      }
    }
    
    // Calculate cluster properties
    const clusterId = generateClusterId(clusterVenues);
    const allEvents = clusterVenues.flatMap(venue => venue.events);
    const eventCount = allEvents.filter(event => event.type === 'event').length;
    const specialCount = allEvents.filter(event => event.type === 'special').length;
    const categories = Array.from(new Set(allEvents.map(event => event.category)));
    const timeStatus = determineClusterTimeStatus(clusterVenues);
    const interestLevel = calculateInterestLevel(clusterVenues);
    const isBroadcasting = timeStatus === 'now';
    
    // Add cluster to results
    clusters.push({
      id: clusterId,
      clusterType: clusterVenues.length === 1 ? 'single' : 'multi',
      venues: clusterVenues,
      timeStatus,
      interestLevel,
      isBroadcasting,
      eventCount,
      specialCount,
      categories
    });
  }
  
  // Verify all venues are accounted for
  if (processedVenues.size !== venues.length) {
    console.warn(`Not all venues assigned to clusters: ${processedVenues.size}/${venues.length}`);
    
    // Find and rescue unassigned venues
    const unassignedVenues = venues.filter(venue => !processedVenues.has(venue));
    
    for (const orphanVenue of unassignedVenues) {
      // Find the nearest cluster
      let nearestClusterIndex = -1;
      let nearestDistance = Infinity;
      
      for (let i = 0; i < clusters.length; i++) {
        for (const clusterVenue of clusters[i].venues) {
          const distance = getDistance(orphanVenue, clusterVenue);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestClusterIndex = i;
          }
        }
      }
      
      if (nearestClusterIndex !== -1) {
        // Add orphaned venue to nearest cluster
        const nearestCluster = clusters[nearestClusterIndex];
        console.log(`Adding orphaned venue ${orphanVenue.venue} to nearest cluster`);
        
        // Update cluster with new venue
        const updatedVenues = [...nearestCluster.venues, orphanVenue];
        const allEvents = updatedVenues.flatMap(venue => venue.events);
        const eventCount = allEvents.filter(event => event.type === 'event').length;
        const specialCount = allEvents.filter(event => event.type === 'special').length;
        const categories = Array.from(new Set(allEvents.map(event => event.category)));
        const timeStatus = determineClusterTimeStatus(updatedVenues);
        const interestLevel = calculateInterestLevel(updatedVenues);
        const isBroadcasting = timeStatus === 'now';
        
        clusters[nearestClusterIndex] = {
          ...nearestCluster,
          venues: updatedVenues,
          clusterType: updatedVenues.length === 1 ? 'single' : 'multi',
          eventCount,
          specialCount,
          categories,
          timeStatus,
          interestLevel,
          isBroadcasting
        };
      } else {
        // Create a solo cluster as fallback
        console.warn(`No nearest cluster found for orphaned venue ${orphanVenue.venue}`);
        
        const soloVenues = [orphanVenue];
        const allEvents = orphanVenue.events;
        const eventCount = allEvents.filter(event => event.type === 'event').length;
        const specialCount = allEvents.filter(event => event.type === 'special').length;
        const categories = Array.from(new Set(allEvents.map(event => event.category)));
        const timeStatus = determineClusterTimeStatus(soloVenues);
        const interestLevel = calculateInterestLevel(soloVenues);
        const isBroadcasting = timeStatus === 'now';
        
        clusters.push({
          id: generateClusterId(soloVenues),
          clusterType: 'single',
          venues: soloVenues,
          timeStatus,
          interestLevel,
          isBroadcasting,
          eventCount,
          specialCount,
          categories
        });
      }
    }
  }
  
  // Reset filters changed flag
  filtersChanged = false;
  
  // Store clusters for potential reuse
  lastClusters = clusters;
  
  console.log(`Generated ${clusters.length} clusters from ${venues.length} venues using ${threshold.name} threshold`);
  return clusters;
};

/**
 * Create map store using Zustand
 */
export const useMapStore = create<MapState>((set, get) => ({
  // Initial state
  events: [],
  specials: [],
  filteredEvents: [],
  clusters: [],
  selectedVenue: null,
  selectedVenues: [],
  selectedCluster: null,
  isLoading: false,
  error: null,
  zoomLevel: 12,
  filterCriteria: DEFAULT_FILTER_CRITERIA,
  categories: [],
  userLocation: null, // Add user location to store state
  activeFilterPanel: null,  // Add this line
  isHeaderSearchActive: false,
  searchQuery: '',
  
  // ===============================================================
  // SCROLL TO TOP FUNCTIONALITY
  // ===============================================================
  scrollTriggers: {
    events: 0,
    specials: 0,
  },
  
  // Add the cluster visibility check utility
  shouldClusterBeVisible: shouldClusterBeVisible,
  
  /**
   * Trigger scroll to top for a specific tab
   */
  triggerScrollToTop: (tab: 'events' | 'specials') => {
    console.log(`[MapStore] Triggering scroll to top for ${tab} tab`);
    set((state) => ({
      scrollTriggers: {
        ...state.scrollTriggers,
        [tab]: state.scrollTriggers[tab] + 1, // Increment to trigger useEffect
      },
    }));
  },
  
  /**
   * Set user location
   */
  setUserLocation: (location) => {
    set({ userLocation: location });
  },

      /**
   * Set active filter panel
   */
      setActiveFilterPanel: (panel) => {
        set({ activeFilterPanel: panel });
      },
  
    /**
   * Set header search active state
   */
  setHeaderSearchActive: (active: boolean) => {
    set({ isHeaderSearchActive: active });
  },

  /**
   * Set search query and apply search filter
   */
  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
    // Apply search filter to events
    get().setTypeFilters('event', { search: query });
  },
  
  /**
   * Set events and extract categories
   */
  setEvents: (events) => {
    // Extract unique categories
    const categories = Array.from(new Set(events.map(event => event.category)));
    
    set({ 
      events,
      categories
    });
    
    // Apply current filters and generate clusters
    get().getFilteredEvents();
    get().generateClusters();
  },
  
  /**
   * Update filter criteria and apply filters
   */
  setFilterCriteria: (criteria) => {
    const updatedCriteria = { 
      ...get().filterCriteria, 
      ...criteria 
    };
    
    // Set the filters changed flag to true
    filtersChanged = true;
    
    set({ filterCriteria: updatedCriteria });
    
    // Apply updated filters and regenerate clusters
    get().getFilteredEvents();
    get().generateClusters();
  },
  
  /**
   * Update filters for a specific type (events or specials)
   */
  setTypeFilters: (type: 'event' | 'special', typeFilters: Partial<TypeFilterCriteria>) => {
    const currentCriteria = get().filterCriteria;
    
    // Create new filter criteria with updated type-specific filters
    const updatedCriteria = { 
      ...currentCriteria,
      [type === 'event' ? 'eventFilters' : 'specialFilters']: {
        ...currentCriteria[type === 'event' ? 'eventFilters' : 'specialFilters'],
        ...typeFilters
      }
    };
    
    // Set the filters changed flag to true
    filtersChanged = true;
    
    set({ filterCriteria: updatedCriteria });
    
    // Apply updated filters and regenerate clusters
    get().getFilteredEvents();
    get().generateClusters();
  },
  
  /**
   * Set selected venues (for multi-venue support)
   */
  selectVenues: (venues) => {
    set({ selectedVenues: venues });
  },
  
  /**
   * Set selected cluster (for multi-venue support)
   */
  selectCluster: (cluster) => {
    set({ selectedCluster: cluster });
  },
  
  /**
   * Set selected venue (legacy support)
   */
  selectVenue: (venue) => {
    if (venue) {
      // Only update the selectedVenue, not the selectedVenues array
      set({ selectedVenue: venue });
    } else {
      // When closing, clear all selections
      set({ 
        selectedVenue: null,
        selectedVenues: [],
        selectedCluster: null 
      });
    }
  },
  
  /**
   * Update zoom level and regenerate clusters
   */
  setZoomLevel: (zoom) => {
    set({ zoomLevel: zoom });
    get().generateClusters(zoom);
  },
  
  /**
   * Fetch events from API
   */
  fetchEvents: async () => {
    set({ isLoading: true, error: null });
    
    try {
      // Fetch events and specials separately
      const eventsUrl = 'https://gathr-backend-951249927221.northamerica-northeast1.run.app/api/v2/events?type=event';
      const specialsUrl = 'https://gathr-backend-951249927221.northamerica-northeast1.run.app/api/v2/events?type=special';
      
      // Make parallel requests for better performance
      const [eventsResponse, specialsResponse] = await Promise.all([
        fetch(eventsUrl),
        fetch(specialsUrl)
      ]);
      
      // Check for errors
      if (!eventsResponse.ok) {
        throw new Error(`Events API error: ${eventsResponse.status}`);
      }
      
      if (!specialsResponse.ok) {
        throw new Error(`Specials API error: ${specialsResponse.status}`);
      }
      
      // Parse the response data
      const eventsData = await eventsResponse.json();
      const specialsData = await specialsResponse.json();
      
      // Process events and specials separately
      const events = eventsData.map((event: any) => ({
        ...event,
        type: 'event'
      }));
      
      const specials = specialsData.map((special: any) => ({
        ...special,
        type: 'special'
      }));
      
      // Combine both data sets for filtering and clustering
      const combinedData = [...events, ...specials];
      
      // Force reset filter criteria to ensure proper initialization
      set({ 
        events: events,
        specials: specials, // Store specials separately
        filterCriteria: DEFAULT_FILTER_CRITERIA
      });
      
      // Mark filters as changed to force reclustering
      filtersChanged = true;
      
      // Update events in store for filtering and clustering
      get().setEvents(combinedData);
      
      set({ isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Unknown error', 
        isLoading: false 
      });
    }
  },
  
  /**
   * Get filtered events based on current criteria
   */
  getFilteredEvents: () => {
    const { events, filterCriteria } = get();
    
    // Apply enhanced filtering logic with type-specific filters
    const filtered = filterEvents(events, filterCriteria);
    
    // Set the filters changed flag to ensure clusters update
    filtersChanged = true;
    
    // Update filtered events in store
    set({ filteredEvents: filtered });
    
    return filtered;
  },
  
  /**
   * Generate clusters based on filtered events
   */
  generateClusters: (zoom) => {
    const { filteredEvents, zoomLevel } = get();
    const currentZoom = zoom || zoomLevel;
    
    // Group events by venue
    const venues = groupEventsByVenue(filteredEvents);
    
    // Cluster venues with discrete threshold-based algorithm
    const clusters = clusterVenues(venues, currentZoom);
    
    // Update clusters in store
    set({ clusters });
  },
  
  /**
   * Get time filter counts for current criteria
   */
  getTimeFilterCounts: (eventType: 'event' | 'special') => {
    const { events, filterCriteria } = get();
    return calculateTimeFilterCounts(events, filterCriteria, eventType);
  },
  
  /**
   * Get category filter counts for current criteria  
   */
  getCategoryFilterCounts: (eventType: 'event' | 'special') => {
    const { events, filterCriteria } = get();
    return calculateCategoryFilterCounts(events, filterCriteria, eventType);
  }
}))