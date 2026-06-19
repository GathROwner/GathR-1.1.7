/**
 * Map store for the GathR application
 * Implements state management for map functionality, event data, and filtering
 /* ─────────────────────────────────────────────────────────────────────────────
Map clustering architecture (banded thresholds + cached results)
Purpose
- Provide fast, predictable clustering that updates as the camera zoom changes,
  without reclustering on every minor camera tick.

Core concepts
- zoomLevel (store): single source of truth for current map zoom.
  → Updated by map screen (onCameraChanged) via setZoomLevel(zoom).
  → Any failure to update zoomLevel will “freeze” clusters at startup band.
- ZOOM_THRESHOLDS (number[]): ordered zoom breakpoints (e.g., [10, 12, 14, 16, 18]).
  → We compute a thresholdIndex from zoomLevel (getThresholdIndexForZoom).
  → Cluster params (radius, maxZoom, etc.) are chosen per band.
- Caching: lastClusters + lastThresholdIndex (+ lastFilterSignature).
  → If the current thresholdIndex and filters are unchanged, we can reuse lastClusters.
  → This avoids expensive reclusters on tiny camera movements.

Update triggers (high-level)
- setZoomLevel(zoom): updates zoomLevel and immediately calls generateClusters(zoom).
- generateClusters(zoom): picks thresholdIndex from zoom, compares with lastThresholdIndex,
  checks filters, and either returns cached clusters or recomputes via clusterVenues(...).

Performance guards (what to tune)
- MIN_ZOOM_STEP_FOR_RECLUSTER (≈ 0.05–0.15): optional extra guard to recluster within a band
  only when the zoom has moved meaningfully since last recompute. If set too high, UX feels sticky;
  if set too low, extra work.
- ZOOM_THRESHOLDS spacing: tighter bands → more frequent recomputes; looser bands → stickier feel.
- CLUSTER_RADIUS_PX or per-band radius: larger radius merges more points (fewer clusters).

Common pitfalls (read before changing)
- ❗ If the map screen stops calling setZoomLevel(zoom) on camera changes, clusters will never update.
- ❗ An overly aggressive early-return like:
    if (!thresholdChanged && !filtersChanged) return lastClusters;
  combined with no “within-band” zoom guard can make clustering feel frozen.
- ❗ Don’t couple generateClusters to UI timing/debouncers that can suppress needed updates.

Debugging (quick toggles)
- DEBUG_CLUSTERING: when true, log zoom, thresholdIndex, cache hits/misses.
  Example logs:
    [Clustering] zoom=13.06 idx=2 reused=true filtersSame=true
    [Clustering] zoom=14.02 idx=3 recompute radius=40px points=3,412

Extension ideas (optional)
- Continuous radius: derive radius from meters-per-pixel(zoom) instead of bands for smoother split/merge.
- Spatial windowing: only recluster for tiles intersecting the viewport to reduce work on large datasets.

Integration contract (map.tsx)
- Map screen must call setZoomLevel(zoom) on meaningful camera deltas (≈ ≥ 0.06) to keep clusters in sync.
- Filter changes should invalidate cache (update lastFilterSignature) and force a recompute.

Last validated: 2025-09-04 • Owner: Map data/UX
──────────────────────────────────────────────────────────────────────────── */



import { create } from 'zustand';
import { Event, Venue, Cluster, TimeStatus, InterestLevel } from '../types/events';
import { FilterCriteria, TimeFilterType, TypeFilterCriteria } from '../types/filter';
import { MapState } from '../types/store';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import Supercluster from 'supercluster';


// Import default filter criteria
import { DEFAULT_FILTER_CRITERIA } from '../types/filter';

// Import cluster interaction tracking
import { getHasNewContent } from './clusterInteractionStore';

// Import unified events API (Firestore default, legacy fallback optional)
import {
  dedupeEvents,
  fetchMinimalEvents,
  type FetchMinimalEventsOptions,
} from '../lib/api/events';
import {
  areEventIdsEquivalent,
  fetchFirestoreEventDetailsBatch,
  toAppEventId,
} from '../lib/api/firestoreEvents';
import { isPrivateSharedEventId } from '../lib/api/privateSharedEvents';
import {
  ENABLE_LEGACY_DETAILS_FALLBACK,
  LEGACY_EVENTS_API_BASE,
  USE_FIRESTORE_EVENTS,
} from '../lib/config/backend';
import { EVENTS_MINIMAL } from '../lib/queryKeys';

// Define zoom threshold bands and their corresponding clustering radii
export interface ZoomThreshold {
  name: string;        // Human-readable name for the threshold
  minZoom: number;     // Minimum zoom level for this threshold
  maxZoom: number;     // Maximum zoom level for this threshold
  radius: number;      // Clustering radius in meters for this threshold
}

 // ───── DEBUG: Map load instrumentation toggles & counters ─────
 const DEBUG_MAP_LOAD = false;
 const DEBUG_STARTUP_DATA_TIMING = __DEV__;
 const logStartupDataTiming = (label: string, details?: Record<string, unknown>) => {
   if (!DEBUG_STARTUP_DATA_TIMING) {
     return;
   }

   console.warn('[GathRStartupData]', label, JSON.stringify(details ?? {}));
 };
 type MinimalEventsResult = Awaited<ReturnType<typeof fetchMinimalEvents>>;
 let __minimalEventsInFlight:
   | { key: string; promise: Promise<MinimalEventsResult>; startedAt: number }
   | null = null;
 const getMinimalEventsFetchKey = (options: FetchMinimalEventsOptions = {}) =>
   JSON.stringify(options ?? {});
 const fetchMinimalEventsShared = (
   options: FetchMinimalEventsOptions = {}
 ): Promise<MinimalEventsResult> => {
   const key = getMinimalEventsFetchKey(options);
   if (__minimalEventsInFlight?.key === key) {
     logStartupDataTiming('minimal_fetch_reused_inflight', {
       key,
       ageMs: Date.now() - __minimalEventsInFlight.startedAt,
     });
     return __minimalEventsInFlight.promise;
   }

   const startedAt = Date.now();
   logStartupDataTiming('minimal_fetch_started', { key });
   const promise: Promise<MinimalEventsResult> = fetchMinimalEvents(options)
     .then((result) => {
       logStartupDataTiming('minimal_fetch_resolved', {
         key,
         durationMs: Date.now() - startedAt,
         count: result.combinedData.length,
       });
       return result;
     })
     .finally(() => {
       if (__minimalEventsInFlight?.promise === promise) {
         __minimalEventsInFlight = null;
       }
     });

   __minimalEventsInFlight = { key, promise, startedAt };
   return promise;
 };
 let __ML_fetchCount = 0;
 let __ML_lastFetchMs = 0;
 let __ML_lastEventsBytes = 0;
 let __ML_lastSpecialsBytes = 0;
 let __ML_lastEventsCount = 0;
 let __ML_lastSpecialsCount = 0;

 let __ML_lastFilterMs = 0;
 let __ML_lastFilterIn = 0;
 let __ML_lastFilterOut = 0;

 let __ML_lastClusterMs = 0;
 let __ML_lastVenueCount = 0;
 let __ML_lastClusterCount = 0;

 // ────────────────────────────────────────────────────────────────
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

// Supercluster caches
let __scIndex: any | null = null;
let __venueByKey: Map<string, Venue> = new Map();
let __scIndexConfig: { radius: number; extent: number; maxZoom: number } | null = null;
const IOS_SUPERCLUSTER_RADIUS_PX = 28;
const ANDROID_BASE_SUPERCLUSTER_RADIUS_PX = 48;
const ANDROID_CITY_ZOOM_SUPERCLUSTER_RADIUS_PX = 36;
const ANDROID_OVERVIEW_SUPERCLUSTER_RADIUS_PX = 96;
const ANDROID_CITY_ZOOM_RADIUS_MIN_ZOOM = 9;
const ANDROID_CITY_ZOOM_RADIUS_MAX_ZOOM = 12;
const ANDROID_OVERVIEW_RADIUS_MAX_ZOOM = 10;
const IOS_SUPERCLUSTER_EXTENT = 256;
const ANDROID_SUPERCLUSTER_EXTENT = 512;
const SUPERCLUSTER_EXTENT = Platform.OS === 'android' ? ANDROID_SUPERCLUSTER_EXTENT : IOS_SUPERCLUSTER_EXTENT;
const IOS_SUPERCLUSTER_MAX_ZOOM = 16;
const ANDROID_SUPERCLUSTER_MAX_ZOOM = 14;
const SUPERCLUSTER_MAX_ZOOM = Platform.OS === 'android' ? ANDROID_SUPERCLUSTER_MAX_ZOOM : IOS_SUPERCLUSTER_MAX_ZOOM;
const ANDROID_DYNAMIC_RADIUS_MIN_ZOOM = 13;
const ANDROID_SUPERCLUSTER_MAX_RADIUS_PX = 128;
const WEB_MERCATOR_EARTH_CIRCUMFERENCE_METERS = 40075016.686;
const SELECTED_CLUSTER_ENHANCEMENT_DELAY_MS = Platform.OS === 'android' ? 900 : 0;
const CLUSTER_SOURCE_BBOX_BUFFER_MULTIPLIER = Platform.OS === 'android' ? 1.35 : 1.2;

const scheduleCalloutCloseClusterRefresh = (refreshClusters: () => void): void => {
  // Keep this synchronous on Android. The temporary post-close touch overlay in
  // map.tsx owns retaps while Mapbox marker hit-testing recovers, so cluster
  // indicator state can refresh immediately without blocking user input.
  refreshClusters();
};

type ViewportBoundingBox = { west: number; south: number; east: number; north: number };

const clampNumber = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const getAverageVenueLatitude = (venues: Venue[]): number => {
  if (venues.length === 0) {
    return 0;
  }

  const totalLatitude = venues.reduce((sum, venue) => sum + venue.latitude, 0);
  return totalLatitude / venues.length;
};

const getSuperclusterRadiusPx = (venues: Venue[], zoom: number): number => {
  if (Platform.OS !== 'android') {
    return IOS_SUPERCLUSTER_RADIUS_PX;
  }

  const z = Math.max(0, Math.min(22, Math.floor(zoom)));
  if (z < ANDROID_DYNAMIC_RADIUS_MIN_ZOOM || z > ANDROID_SUPERCLUSTER_MAX_ZOOM) {
    if (z >= ANDROID_CITY_ZOOM_RADIUS_MIN_ZOOM && z <= ANDROID_CITY_ZOOM_RADIUS_MAX_ZOOM) {
      if (z <= ANDROID_OVERVIEW_RADIUS_MAX_ZOOM) {
        return ANDROID_OVERVIEW_SUPERCLUSTER_RADIUS_PX;
      }

      return ANDROID_CITY_ZOOM_SUPERCLUSTER_RADIUS_PX;
    }

    return ANDROID_BASE_SUPERCLUSTER_RADIUS_PX;
  }

  const threshold = ZOOM_THRESHOLDS[getThresholdIndexForZoom(zoom)];
  const latitude = clampNumber(getAverageVenueLatitude(venues), -85, 85);
  const metersPerTileAtZoom =
    (WEB_MERCATOR_EARTH_CIRCUMFERENCE_METERS * Math.cos((latitude * Math.PI) / 180)) /
    Math.pow(2, z);

  if (!Number.isFinite(metersPerTileAtZoom) || metersPerTileAtZoom <= 0) {
    return ANDROID_BASE_SUPERCLUSTER_RADIUS_PX;
  }

  const radiusPx = Math.round((threshold.radius / metersPerTileAtZoom) * ANDROID_SUPERCLUSTER_EXTENT);
  return clampNumber(radiusPx, ANDROID_BASE_SUPERCLUSTER_RADIUS_PX, ANDROID_SUPERCLUSTER_MAX_RADIUS_PX);
};

const getSuperclusterConfig = (venues: Venue[], zoom: number) => ({
  radius: getSuperclusterRadiusPx(venues, zoom),
  extent: SUPERCLUSTER_EXTENT,
  maxZoom: SUPERCLUSTER_MAX_ZOOM,
});

const expandBoundingBox = (
  bbox: ViewportBoundingBox,
  multiplier: number
): ViewportBoundingBox => {
  const centerLat = (bbox.north + bbox.south) / 2;
  const centerLng = (bbox.east + bbox.west) / 2;
  const halfLat = ((bbox.north - bbox.south) / 2) * multiplier;
  const halfLng = ((bbox.east - bbox.west) / 2) * multiplier;

  return {
    west: Math.max(-180, centerLng - halfLng),
    south: Math.max(-90, centerLat - halfLat),
    east: Math.min(180, centerLng + halfLng),
    north: Math.min(90, centerLat + halfLat),
  };
};

const hasEnhancedEventDetails = (event: Event): boolean =>
  event.hasOwnProperty('fullDescription') ||
  event.hasOwnProperty('ticketLinkPosts') ||
  event.hasOwnProperty('ticketLinkEvents');

const scheduleSelectedClusterEnhancement = (
  get: () => MapState,
  set: (partial: Partial<MapState>) => void,
  cluster: Cluster | null
): void => {
  if (!cluster) {
    return;
  }

  setTimeout(() => {
    const { events } = get();
    const eventIds = cluster.venues.flatMap(venue =>
      venue.events.map(event => event.id)
    );
    const eventsById = new Map(events.map(event => [String(event.id), event]));

    const needsEnhancement = eventIds.some(id => {
      const event = eventsById.get(String(id));
      return Boolean(event && !hasEnhancedEventDetails(event));
    });

    if (!needsEnhancement) {
      return;
    }

    get().fetchEventDetails(eventIds).then(() => {
      if (get().selectedCluster?.id !== cluster.id) {
        return;
      }

      const updatedEventsById = new Map(get().events.map(event => [String(event.id), event]));
      const updatedCluster = {
        ...cluster,
        venues: cluster.venues.map(venue => ({
          ...venue,
          events: venue.events.map(event => updatedEventsById.get(String(event.id)) || event)
        }))
      };

      set({ selectedCluster: updatedCluster });
    });
  }, SELECTED_CLUSTER_ENHANCEMENT_DELAY_MS);
};


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
  const venueId = String(event.venueId || '').trim();
  const isScopedLocation =
    event.locationScope === 'city' ||
    event.locationScope === 'area' ||
    event.locationScope === 'route';
  if (venueId && !isScopedLocation) {
    return `venue:${venueId}`;
  }

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
const determineClusterTimeStatus = (
  venues: Venue[],
  timeContext: EventTimeContext = createEventTimeContext()
): TimeStatus => {
  const hasNowEvents = venues.some(venue => 
    venue.events.some(event => isEventNowFast(event, timeContext))
  );
  
  if (hasNowEvents) return 'now';
  
  const hasTodayEvents = venues.some(venue => 
    venue.events.some(event => isEventHappeningTodayFast(event, timeContext))
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

export type EventTimeContext = {
  todayKey: string;
  tomorrowKey: string;
  yesterdayKey: string;
  nowMinutes: number;
};

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NOON_MINUTES = 12 * 60;
const END_OF_DAY_MINUTES = 23 * 60 + 59;

const formatLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDaysKey = (date: Date, days: number): string => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return formatLocalDateKey(next);
};

export const createEventTimeContext = (now = new Date()): EventTimeContext => ({
  todayKey: formatLocalDateKey(now),
  tomorrowKey: addDaysKey(now, 1),
  yesterdayKey: addDaysKey(now, -1),
  nowMinutes: now.getHours() * 60 + now.getMinutes(),
});

const getEventDateKey = (dateStr?: string | null): string => {
  if (!dateStr) return '';

  const rawKey = dateStr.slice(0, 10);
  if (DATE_KEY_PATTERN.test(rawKey)) {
    return rawKey;
  }

  const parsed = new Date(dateStr);
  if (!Number.isNaN(parsed.getTime())) {
    return formatLocalDateKey(parsed);
  }

  return '';
};

const parseTimeMinutes = (
  timeStr?: string | null,
  fallbackMinutes: number | null = null
): number | null => {
  if (!timeStr) return fallbackMinutes;

  const trimmed = timeStr.trim();
  const twelveHour = trimmed.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(AM|PM)$/i);
  if (twelveHour) {
    let hours = Number(twelveHour[1]);
    const minutes = Number(twelveHour[2] ?? 0);
    const ampm = twelveHour[3].toUpperCase();

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    return hours * 60 + minutes;
  }

  const twentyFourHour = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFourHour) {
    const hours = Number(twentyFourHour[1]);
    const minutes = Number(twentyFourHour[2]);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return hours * 60 + minutes;
    }
  }

  return fallbackMinutes;
};

const isEventNowFast = (event: Pick<Event, 'startDate' | 'startTime' | 'endDate' | 'endTime'>, context: EventTimeContext): boolean => {
  const startKey = getEventDateKey(event.startDate);
  if (!startKey) return false;

  const endKey = getEventDateKey(event.endDate) || startKey;
  const startMinutes = parseTimeMinutes(event.startTime, NOON_MINUTES);
  const endMinutes = parseTimeMinutes(event.endTime, END_OF_DAY_MINUTES);

  if (startMinutes === null || endMinutes === null) return false;

  const crossesMidnight = endMinutes < startMinutes;
  const isMultiDay = endKey !== startKey;

  if (isMultiDay) {
    if (context.todayKey < startKey || context.todayKey > endKey) {
      return false;
    }

    if (crossesMidnight) {
      return context.nowMinutes >= startMinutes;
    }

    return context.nowMinutes >= startMinutes && context.nowMinutes <= endMinutes;
  }

  if (startKey === context.todayKey) {
    if (crossesMidnight) {
      return context.nowMinutes >= startMinutes;
    }

    return context.nowMinutes >= startMinutes && context.nowMinutes <= endMinutes;
  }

  if (startKey === context.yesterdayKey && crossesMidnight) {
    return context.nowMinutes <= endMinutes;
  }

  return false;
};

const isEventHappeningTodayFast = (
  event: Pick<Event, 'startDate' | 'startTime' | 'endDate' | 'endTime'>,
  context: EventTimeContext
): boolean => {
  if (isEventNowFast(event, context)) {
    return true;
  }

  const startKey = getEventDateKey(event.startDate);
  if (!startKey) return false;

  const endKey = getEventDateKey(event.endDate) || startKey;

  if (endKey !== startKey) {
    if (context.todayKey < startKey || context.todayKey > endKey) {
      return false;
    }

    if (startKey === context.todayKey) {
      return true;
    }

    if (context.todayKey > startKey && context.todayKey < endKey) {
      return true;
    }

    if (endKey === context.todayKey) {
      const endMinutes = parseTimeMinutes(event.endTime, END_OF_DAY_MINUTES);
      return endMinutes !== null && context.nowMinutes <= endMinutes;
    }

    return true;
  }

  return startKey === context.todayKey;
};

export const getEventTimeStatusFast = (
  event: Pick<Event, 'startDate' | 'startTime' | 'endDate' | 'endTime'>,
  context: EventTimeContext
): TimeStatus => {
  if (isEventNowFast(event, context)) return 'now';
  if (isEventHappeningTodayFast(event, context)) return 'today';
  return 'future';
};

/**
 * Determines if an event matches the given type-specific filters
 */
export const doesEventMatchTypeFilters = (
  event: Event,
  typeFilters: TypeFilterCriteria,
  timeContext: EventTimeContext = createEventTimeContext()
): boolean => {
  // Check time filter
  if (typeFilters.timeFilter === TimeFilterType.ALL) {
    // No time filtering - show all events
    // Continue to other filters
  } else if (typeFilters.timeFilter === TimeFilterType.NOW) {
    const isNow = isEventNowFast(event, timeContext);
    if (!isNow) return false;
  } else if (typeFilters.timeFilter === TimeFilterType.TODAY) {
    const isToday = isEventHappeningTodayFast(event, timeContext);
    if (!isToday) return false;
  } else if (typeFilters.timeFilter === TimeFilterType.TOMORROW) {
    const isTomorrow = getEventDateKey(event.startDate) === timeContext.tomorrowKey;
    if (!isTomorrow) return false;
  } else if (typeFilters.timeFilter === TimeFilterType.UPCOMING) {
    // UPCOMING should only show future events (not now or today)
    const timeStatus = getEventTimeStatusFast(event, timeContext);
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
  const timeContext = createEventTimeContext();

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
    
    return doesEventMatchTypeFilters(event, typeFilters, timeContext);
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
  const timeContext = createEventTimeContext();
  const typeFilters = eventType === 'event'
    ? currentCriteria.eventFilters
    : currentCriteria.specialFilters;
  const categoryFilter = typeFilters.category?.toLowerCase();
  const searchTerm = typeFilters.search?.trim().toLowerCase();
  const counts = {
    [TimeFilterType.ALL]: 0,
    [TimeFilterType.NOW]: 0,
    [TimeFilterType.TODAY]: 0,
    [TimeFilterType.TOMORROW]: 0,
    [TimeFilterType.UPCOMING]: 0
  };

  for (const event of events) {
    const isVisible =
      (event.type === 'event' && currentCriteria.showEvents) ||
      (event.type === 'special' && currentCriteria.showSpecials);

    if (!isVisible || event.type !== eventType) continue;

    if (categoryFilter && event.category.toLowerCase() !== categoryFilter) {
      continue;
    }

    if (searchTerm) {
      const matchesSearch =
        event.title.toLowerCase().includes(searchTerm) ||
        event.description.toLowerCase().includes(searchTerm) ||
        event.venue.toLowerCase().includes(searchTerm);

      if (!matchesSearch) continue;
    }

    counts[TimeFilterType.ALL] += 1;

    const isNow = isEventNowFast(event, timeContext);
    const isToday = isNow || isEventHappeningTodayFast(event, timeContext);

    if (isNow) counts[TimeFilterType.NOW] += 1;
    if (isToday) counts[TimeFilterType.TODAY] += 1;
    if (getEventDateKey(event.startDate) === timeContext.tomorrowKey) {
      counts[TimeFilterType.TOMORROW] += 1;
    }
    if (!isToday && !isNow) {
      counts[TimeFilterType.UPCOMING] += 1;
    }
  }

  
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
  const timeContext = createEventTimeContext();
  const typeFilters = eventType === 'event'
    ? currentCriteria.eventFilters
    : currentCriteria.specialFilters;
  const searchTerm = typeFilters.search?.trim().toLowerCase();
  
  const counts: { [category: string]: number } = {};

  for (const event of events) {
    if (event.type !== eventType) continue;

    if (counts[event.category] === undefined) {
      counts[event.category] = 0;
    }

    const isVisible =
      (event.type === 'event' && currentCriteria.showEvents) ||
      (event.type === 'special' && currentCriteria.showSpecials);

    if (!isVisible) continue;

    if (typeFilters.timeFilter === TimeFilterType.NOW) {
      const isNow = isEventNowFast(event, timeContext);
      if (!isNow) continue;
    } else if (typeFilters.timeFilter === TimeFilterType.TODAY) {
      const isToday = isEventHappeningTodayFast(event, timeContext);
      if (!isToday) continue;
    } else if (typeFilters.timeFilter === TimeFilterType.TOMORROW) {
      const isTomorrow = getEventDateKey(event.startDate) === timeContext.tomorrowKey;
      if (!isTomorrow) continue;
    } else if (typeFilters.timeFilter === TimeFilterType.UPCOMING) {
      const timeStatus = getEventTimeStatusFast(event, timeContext);
      if (timeStatus !== 'future') continue;
    }

    if (searchTerm) {
      const matchesSearch =
        event.title.toLowerCase().includes(searchTerm) ||
        event.description.toLowerCase().includes(searchTerm) ||
        event.venue.toLowerCase().includes(searchTerm);

      if (!matchesSearch) continue;
    }

    counts[event.category] += 1;
  }
  
  return counts;
};

type FilterCountCacheEntry<T> = {
  events: Event[];
  criteria: FilterCriteria;
  minuteKey: number;
  result: T;
};

const timeFilterCountsCache: Partial<Record<'event' | 'special', FilterCountCacheEntry<{ [key in TimeFilterType]: number }>>> = {};
const categoryFilterCountsCache: Partial<Record<'event' | 'special', FilterCountCacheEntry<{ [category: string]: number }>>> = {};

const getFilterCountMinuteKey = () => Math.floor(Date.now() / 60000);

const getCachedTimeFilterCounts = (
  events: Event[],
  currentCriteria: FilterCriteria,
  eventType: 'event' | 'special'
): { [key in TimeFilterType]: number } => {
  const minuteKey = getFilterCountMinuteKey();
  const cached = timeFilterCountsCache[eventType];

  if (
    cached &&
    cached.events === events &&
    cached.criteria === currentCriteria &&
    cached.minuteKey === minuteKey
  ) {
    return cached.result;
  }

  const result = calculateTimeFilterCounts(events, currentCriteria, eventType);
  timeFilterCountsCache[eventType] = { events, criteria: currentCriteria, minuteKey, result };
  return result;
};

const getCachedCategoryFilterCounts = (
  events: Event[],
  currentCriteria: FilterCriteria,
  eventType: 'event' | 'special'
): { [category: string]: number } => {
  const minuteKey = getFilterCountMinuteKey();
  const cached = categoryFilterCountsCache[eventType];

  if (
    cached &&
    cached.events === events &&
    cached.criteria === currentCriteria &&
    cached.minuteKey === minuteKey
  ) {
    return cached.result;
  }

  const result = calculateCategoryFilterCounts(events, currentCriteria, eventType);
  categoryFilterCountsCache[eventType] = { events, criteria: currentCriteria, minuteKey, result };
  return result;
};

/**
 * Cluster venues based on geographic proximity using discrete zoom thresholds
 * Optimized with spatial grid indexing to reduce complexity from O(n²) to O(n)
 * Returns an array of Cluster objects
 */
const clusterVenues = (venues: Venue[], zoom: number = 12): Cluster[] => {
  if (venues.length === 0) return [];

  const superclusterConfig = getSuperclusterConfig(venues, zoom);
  const shouldRebuildIndex =
    !__scIndex ||
    filtersChanged ||
    !__scIndexConfig ||
    __scIndexConfig.radius !== superclusterConfig.radius ||
    __scIndexConfig.extent !== superclusterConfig.extent ||
    __scIndexConfig.maxZoom !== superclusterConfig.maxZoom;

  // Rebuild the index when filters/data changed or index is missing
  if (shouldRebuildIndex) {
    __venueByKey = new Map(venues.map(v => [v.locationKey, v]));

    const points = venues.map(v => ({
      type: 'Feature' as const,
      properties: { vid: v.locationKey },
      geometry: { type: 'Point' as const, coordinates: [v.longitude, v.latitude] }
    }));

    __scIndex = new Supercluster({
      minZoom: 0,
      maxZoom: superclusterConfig.maxZoom,
      radius: superclusterConfig.radius,
      extent: superclusterConfig.extent,
      nodeSize: 16        // Smaller tree nodes
    }).load(points);
    __scIndexConfig = superclusterConfig;
  }

  // Query clusters for the current zoom; world bbox (minimal change)
  const z = Math.max(0, Math.min(22, Math.floor(zoom)));
  const features = __scIndex.getClusters([-180, -85, 180, 85], z);

  const clusters: Cluster[] = [];
  const timeContext = createEventTimeContext();

  for (const f of features) {
    // Cluster feature
    if ((f.properties as any).cluster) {
      const cid = (f.properties as any).cluster_id;
      // Pull all leaves to reconstruct venue list (keeps your Cluster shape intact)
      const leaves = __scIndex.getLeaves(cid, Infinity);
      const venuesInCluster = leaves
        .map((leaf: any) => __venueByKey.get(leaf.properties.vid))
        .filter(Boolean) as Venue[];

      const allEvents = venuesInCluster.flatMap(v => v.events);
      const eventCount = allEvents.filter(e => e.type === 'event').length;
      const specialCount = allEvents.filter(e => e.type === 'special').length;
      const categories = Array.from(new Set(allEvents.map(e => e.category)));
      const timeStatus = determineClusterTimeStatus(venuesInCluster, timeContext);
      const interestLevel = calculateInterestLevel(venuesInCluster);
      const isBroadcasting = timeStatus === 'now';

      const clusterId = generateClusterId(venuesInCluster);

      // For ALL clusters (single or multi-venue), check each venue individually
      // Use ONLY venue.locationKey for stable tracking across zoom levels
      // console.log(`[NewContent][Multi] Checking ${venuesInCluster.length} venue(s) in cluster ${clusterId}`);
      const hasNewContent = venuesInCluster.some(venue => {
        const venueEventIds = venue.events.map(e => e.id.toString());
        const stableVenueId = venue.locationKey;
        const venueHasNew = getHasNewContent(stableVenueId, venueEventIds);
        // console.log(`  - Venue: ${venue.venue}, StableVenueID: ${stableVenueId}, EventIDs: [${venueEventIds.join(',')}], HasNew: ${venueHasNew}`);
        return venueHasNew;
      });
      // console.log(`[NewContent][Multi] Final result: ${hasNewContent}`);

      clusters.push({
        id: clusterId,
        clusterType: venuesInCluster.length === 1 ? 'single' : 'multi',
        venues: venuesInCluster,
        timeStatus,
        interestLevel,
        isBroadcasting,
        eventCount,
        specialCount,
        categories,
        hasNewContent
      });
    } else {
      // Single point feature
      const v = __venueByKey.get((f.properties as any).vid)!;
      const allEvents = v.events;
      const eventCount = allEvents.filter(e => e.type === 'event').length;
      const specialCount = allEvents.filter(e => e.type === 'special').length;
      const categories = Array.from(new Set(allEvents.map(e => e.category)));
      const timeStatus = determineClusterTimeStatus([v], timeContext);
      const interestLevel = calculateInterestLevel([v]);
      const isBroadcasting = timeStatus === 'now';

      const clusterId = generateClusterId([v]);
      const allEventIds = allEvents.map(e => e.id.toString());
      // Use ONLY venue.locationKey for stable tracking across zoom levels
      const stableVenueId = v.locationKey;
      const hasNewContent = getHasNewContent(stableVenueId, allEventIds);

      // console.log(`[NewContent][Single] Venue: ${v.venue}, StableVenueID: ${stableVenueId}, EventIDs: [${allEventIds.join(',')}], HasNew: ${hasNewContent}`);

      clusters.push({
        id: clusterId,
        clusterType: 'single',
        venues: [v],
        timeStatus,
        interestLevel,
        isBroadcasting,
        eventCount,
        specialCount,
        categories,
        hasNewContent
      });
    }
  }

  // Keep store semantics unchanged
  filtersChanged = false;
  lastClusters = clusters;
  currentThresholdIndex = getThresholdIndexForZoom(zoom);

  // Disabled for performance - console.log is slow in React Native
  // console.log(`Generated ${clusters.length} clusters from ${venues.length} venues using supercluster @z=${z}`);
  return clusters;
};


/**
 * Create map store using Zustand
 */
export const useMapStore = create<MapState>((set, get) => ({
  // Initial state
  allEvents: [],  // Global cache populated by React Query
  events: [],
  specials: [],
  filteredEvents: [],

  // Viewport-aware state
  viewportEvents: [],
  outsideViewportEvents: [],
  onScreenEvents: [],  // Events visible on actual screen (filtered by screen coordinates)
  viewportBbox: null,
  viewportMetadata: {
    wasCapped: false,
    viewportCount: 0,
    outsideViewportCount: 0,
    lastFetchTimestamp: null,
  },

  clusters: [],
  selectedVenue: null,
  selectedVenues: [],
  selectedCluster: null,
  isLoading: false,
  lastFetchedAt: null,
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
  
  // Close callout functionality
  closeCalloutTrigger: 0,

  // Lightbox state for event image viewing
  selectedImageData: null,

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
   * Trigger close callout when map tab is re-pressed
   */
  triggerCloseCallout: () => {
    console.log(`[MapStore] Triggering close callout`);
    set((state) => ({
      closeCalloutTrigger: state.closeCalloutTrigger + 1,
    }));
  },

  /**
   * Set selected image data for lightbox
   */
  setSelectedImageData: (data) => {
    set({ selectedImageData: data });
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
        if (get().activeFilterPanel === panel) {
          return;
        }
        set({ activeFilterPanel: panel });
      },
  
    /**
   * Set header search active state
   */
  setHeaderSearchActive: (active: boolean) => {
    if (get().isHeaderSearchActive === active) {
      return;
    }
    set({ isHeaderSearchActive: active });
  },

  /**
   * Set search query and apply search filter
   */
  setSearchQuery: (query: string) => {
    if (get().searchQuery === query) {
      return;
    }
    set({ searchQuery: query });

    // Apply search to both types so lists & map stay consistent
    get().setTypeFilters('event',   { search: query });
    get().setTypeFilters('special', { search: query });
  },

  /**
   * Set all events (global cache) - called by React Query prefetch
   * This populates the global cache but does NOT affect viewport filtering
   */
  setAllEvents: (events) => {
    // DEBUG: summarize address/coords in incoming batch
    try {
      const addrCount = Array.isArray(events) ? events.filter(e => e?.address && e.address !== 'N/A').length : 0;
      const coordCount = Array.isArray(events) ? events.filter(e => e?.latitude != null && e?.longitude != null).length : 0;
      console.log('[AddressFlow][setAllEvents] Global cache update', {
        total: Array.isArray(events) ? events.length : -1,
        withAddress: addrCount,
        withCoords: coordCount,
      });
    } catch {}

    // ONLY update the global cache - do NOT touch viewport data
    set({
      allEvents: events,
    });
  },

  /**
   * Set events and extract categories
   * DEPRECATED: This function is being phased out in favor of viewport-based filtering
   */
 setEvents: (events) => {
  // DEBUG: summarize address/coords in incoming batch
  try {
    const addrCount = Array.isArray(events) ? events.filter(e => e?.address && e.address !== 'N/A').length : 0;
    const coordCount = Array.isArray(events) ? events.filter(e => e?.latitude != null && e?.longitude != null).length : 0;
    console.log('[AddressFlow][setEvents]', {
      total: Array.isArray(events) ? events.length : -1,
      withAddress: addrCount,
      withCoords: coordCount,
    });
  } catch {}

  const { filterCriteria, zoomLevel } = get();
  
  // Do ALL processing synchronously in one batch
  const categories = Array.from(new Set(events.map(event => event.category)));
  const filtered = filterEvents(events, filterCriteria);
  const venues = groupEventsByVenue(filtered);
  const clusters = clusterVenues(venues, zoomLevel);
  
  // Single store update - prevents render cascade
  set({
    events,
    categories,
    filteredEvents: filtered,
    clusters
  });
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
  setTypeFilters: (type: 'event' | 'special', typeFilters: Partial<TypeFilterCriteria>, source?: 'filter-pills' | 'interest-pills') => {
    get().setTypeFiltersBatch([{ type, typeFilters, source }]);
  },

  /**
   * Update multiple type filters in one filter/recluster pass.
   */
  setTypeFiltersBatch: (updates) => {
    const currentCriteria = get().filterCriteria;
    let updatedCriteria = currentCriteria;

    updates.forEach(({ type, typeFilters, source }) => {
      const filterKey = type === 'event' ? 'eventFilters' : 'specialFilters';

      updatedCriteria = {
        ...updatedCriteria,
        [filterKey]: {
          ...updatedCriteria[filterKey],
          ...typeFilters,
          // Set source if category is being set, clear if being cleared
          categoryFilterSource: typeFilters.category !== undefined ? source : undefined
        }
      };
    });

    if (JSON.stringify(updatedCriteria) === JSON.stringify(currentCriteria)) {
      return;
    }

    // Set the filters changed flag to true
    filtersChanged = true;

    const { events, zoomLevel } = get();
    const filterStartedAt = Date.now();
    const filtered = filterEvents(events, updatedCriteria);

    __ML_lastFilterMs = Date.now() - filterStartedAt;
    __ML_lastFilterIn = events.length;
    __ML_lastFilterOut = filtered.length;

    const clusterStartedAt = Date.now();
    const venues = groupEventsByVenue(filtered);
    const clusters = clusterVenues(venues, zoomLevel);

    __ML_lastVenueCount = venues.length;
    __ML_lastClusterCount = clusters.length;
    __ML_lastClusterMs = Date.now() - clusterStartedAt;

    logStartupDataTiming('type_filters_batch_completed', {
      updates: updates.length,
      filterMs: __ML_lastFilterMs,
      clusterMs: __ML_lastClusterMs,
      filteredEvents: filtered.length,
      venues: venues.length,
      clusters: clusters.length,
    });

    set({
      filterCriteria: updatedCriteria,
      filteredEvents: filtered,
      clusters,
    });
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
  // Set selected cluster immediately for instant visual feedback
  set({ selectedCluster: cluster });
  scheduleSelectedClusterEnhancement(get, set, cluster);
},

  /**
   * Open a callout with one store update so Android does not pay three
   * selection render passes before the sheet can mount.
   */
  selectCallout: (venues, cluster) => {
    set({
      selectedVenue: venues[0] ?? null,
      selectedVenues: venues,
      selectedCluster: cluster,
    });
    scheduleSelectedClusterEnhancement(get, set, cluster);
  },
  
  /**
   * Set selected venue (legacy support)
   */
  selectVenue: (venue) => {
    if (venue) {
      // Only update the selectedVenue, not the selectedVenues array
      set({ selectedVenue: venue });
    } else {
      // When closing, clear all selections and refresh clusters
      // to update "new content" indicators based on viewed venues
      set({
        selectedVenue: null,
        selectedVenues: [],
        selectedCluster: null
      });

      const refreshClustersAfterClose = () => {
        const state = get();
        if (state.selectedVenues.length > 0 || state.selectedCluster) {
          console.log('[ClusterRefresh] Skipping close refresh because a callout reopened');
          return;
        }

        // Trigger cluster regeneration to update hasNewContent flags
        console.log('[ClusterRefresh] Callout closed - regenerating clusters to update indicators');
        state.generateClusters();
      };

      console.log('[ClusterRefresh] Callout closed - refreshing cluster indicators');
      scheduleCalloutCloseClusterRefresh(refreshClustersAfterClose);
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
   * Prefetch events if data is stale
   */
  prefetchIfStale: async (maxAgeMs: number = 60000) => {
    const { isLoading, lastFetchedAt, events, allEvents } = get();
    const now = Date.now();
    const hasUsableEvents = events.length > 0 || allEvents.length > 0;
    logStartupDataTiming('prefetch_if_stale_called', {
      maxAgeMs,
      isLoading,
      hasLastFetchedAt: !!lastFetchedAt,
      hasUsableEvents,
      ageMs: lastFetchedAt ? now - lastFetchedAt : null,
    });
    if (isLoading) {
      logStartupDataTiming('prefetch_if_stale_skipped_loading');
      return;
    }
    if (hasUsableEvents && lastFetchedAt && (now - lastFetchedAt) < maxAgeMs) {
      logStartupDataTiming('prefetch_if_stale_skipped_fresh', {
        ageMs: now - lastFetchedAt,
      });
      return;
    }
    await get().fetchEvents();
  },
  
  /**
   * Fetch events from API
   */
fetchEvents: async () => {
  const fetchEventsStartedAt = Date.now();
  logStartupDataTiming('fetch_events_called');
  const qc: any = (global as any)?.__RQ_CLIENT ?? null;
  const queryKey = EVENTS_MINIMAL;
  const STALE_MS = 1000 * 60 * 3; // 3 minutes default

  // One-shot network fetch using unified API (Firestore default + optional legacy fallback)
  const fetchFresh = async () => {
    const __tFetchStart = Date.now();
    if (DEBUG_MAP_LOAD) console.log('[MapLoad][fetch_start] Using unified API (Firestore default)');
    __ML_fetchCount += 1;

    // Use unified fetch that handles both data sources in parallel
    const result = await fetchMinimalEventsShared();

    __ML_lastFetchMs = Date.now() - __tFetchStart;
    __ML_lastEventsCount = result.combinedData.filter((e: Event) => e.type === 'event').length;
    __ML_lastSpecialsCount = result.combinedData.filter((e: Event) => e.type === 'special').length;

    if (DEBUG_MAP_LOAD) {
      console.log(`[MapLoad][fetch] done totalMs=${__ML_lastFetchMs} events=${__ML_lastEventsCount} specials=${__ML_lastSpecialsCount}`);
      console.log(`[MapLoad][fetch] sources: googleSheets=${result.sources.googleSheets} firestore=${result.sources.firestore}`);

      // Log sample event structure
      if (result.combinedData.length > 0) {
        const sampleEvent = result.combinedData[0];
        const fieldSizes: Record<string, string> = {};
        Object.keys(sampleEvent).forEach(key => {
          const value = (sampleEvent as any)[key];
          if (typeof value === 'string') {
            fieldSizes[key] = value.length + ' chars';
          } else if (value != null) {
            fieldSizes[key] = typeof value;
          }
        });
        console.log('[MapLoad][fetch_debug] Sample event field sizes:', fieldSizes);

        // Log source distribution
        const firestoreCount = result.combinedData.filter((e: Event) => e.source === 'firestore').length;
        const googleSheetsCount = result.combinedData.filter((e: Event) => e.source === 'google_sheets').length;
        const privateSharedCount = result.combinedData.filter((e: Event) => e.source === 'private_shared').length;
        console.log(`[MapLoad][fetch_debug] Source distribution: googleSheets=${googleSheetsCount} firestore=${firestoreCount} privateShared=${privateSharedCount}`);
      }
    }

    return { combinedData: result.combinedData, fetchedAt: result.fetchedAt };
  };

  // CACHE-FIRST
  const cached = qc?.getQueryData(queryKey) as { combinedData: any[] } | undefined;
  if (cached?.combinedData?.length) {
    logStartupDataTiming('fetch_events_using_query_cache', {
      count: cached.combinedData.length,
      elapsedMs: Date.now() - fetchEventsStartedAt,
    });
    filtersChanged = true; // force recluster
    get().setAllEvents(cached.combinedData);
    set({ isLoading: false, error: null, lastFetchedAt: Date.now() });

    // Background refresh
    qc!.fetchQuery({
      queryKey,
      queryFn: fetchFresh,
      staleTime: STALE_MS,
      gcTime: 1000 * 60 * 10,
    }).then((fresh: { combinedData: any[]; fetchedAt: number }) => {
      filtersChanged = true;
      get().setAllEvents(fresh.combinedData);
      set({ lastFetchedAt: Date.now() });
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[MapStore] background events refresh error:', msg);
    });


    return;
  }

  // First load → foreground fetch
  logStartupDataTiming('fetch_events_foreground_fetch_started', {
    hasQueryClient: !!qc,
  });
  set({ isLoading: true, error: null });
  try {
    const fresh = qc
      ? await qc.fetchQuery({ queryKey, queryFn: fetchFresh, staleTime: STALE_MS, gcTime: 1000 * 60 * 10 })
      : await fetchFresh();

    filtersChanged = true;
    get().setAllEvents(fresh.combinedData);
    set({ isLoading: false, lastFetchedAt: Date.now() });
    logStartupDataTiming('fetch_events_completed', {
      elapsedMs: Date.now() - fetchEventsStartedAt,
      count: fresh.combinedData.length,
    });
  } catch (error) {
    set({
      error: error instanceof Error ? error.message : 'Unknown error',
      isLoading: false,
    });
    logStartupDataTiming('fetch_events_failed', {
      elapsedMs: Date.now() - fetchEventsStartedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    if (DEBUG_MAP_LOAD) console.log('[MapLoad][fetch] error', error);
  }
},

  /**
   * Fetch and partition events for the current viewport.
   * Legacy viewport API is removed from the active path.
   */
  fetchViewportEvents: async (bbox: { west: number; south: number; east: number; north: number }) => {
    const startedAt = Date.now();
    logStartupDataTiming('viewport_fetch_called', {
      bbox,
      allEvents: get().allEvents.length,
      filteredEvents: get().filteredEvents.length,
      clusters: get().clusters.length,
    });

    try {
      set({ error: null });

      const filters = get().filterCriteria;
      const typeParam = filters.showEvents && filters.showSpecials
        ? 'both'
        : filters.showEvents
          ? 'event'
          : filters.showSpecials
            ? 'special'
            : 'both';

      const firestoreTypeFilter =
        typeParam === 'event' ? true : typeParam === 'special' ? false : undefined;

      const matchesTypeFilter = (event: Event): boolean => {
        if (typeParam === 'event') return event.type === 'event';
        if (typeParam === 'special') return event.type === 'special';
        return true;
      };

      let candidateEvents = (get().allEvents || []).filter(matchesTypeFilter);
      logStartupDataTiming('viewport_candidates_ready', {
        elapsedMs: Date.now() - startedAt,
        candidateEvents: candidateEvents.length,
        requestedType: typeParam,
      });

      // Refresh from source when cache is empty for the requested type slice.
      if (candidateEvents.length === 0) {
        const fetchOptions =
          typeof firestoreTypeFilter === 'boolean'
            ? { isEvent: firestoreTypeFilter }
            : {};

        logStartupDataTiming('viewport_fetch_awaiting_minimal_events', {
          elapsedMs: Date.now() - startedAt,
          fetchOptions,
        });
        const result = await fetchMinimalEventsShared(fetchOptions);
        const dedupedAll = dedupeEvents(result.combinedData);
        candidateEvents = dedupedAll.filter(matchesTypeFilter);
        get().setAllEvents(dedupedAll);
        set({ lastFetchedAt: Date.now() });
        logStartupDataTiming('viewport_fetch_minimal_events_ready', {
          elapsedMs: Date.now() - startedAt,
          fetched: dedupedAll.length,
          matchedTypeCount: candidateEvents.length,
        });

        if (DEBUG_MAP_LOAD) {
          console.log('[MapLoad][viewport] Warmed candidate events from API:', {
            firestoreDefault: USE_FIRESTORE_EVENTS,
            fetched: dedupedAll.length,
            requestedType: typeParam,
            matchedTypeCount: candidateEvents.length,
          });
        }
      }

      const hasValidCoordinates = (event: Event): boolean => {
        const lat = Number(event.latitude);
        const lng = Number(event.longitude);
        return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
      };

      const hasScopedLocation = (event: Event): boolean =>
        event.locationScope === 'city' ||
        event.locationScope === 'area' ||
        event.locationScope === 'route';

      const inBbox = (event: Event, targetBbox: ViewportBoundingBox = bbox): boolean => {
        const lat = Number(event.latitude);
        const lng = Number(event.longitude);
        return (
          lat >= targetBbox.south &&
          lat <= targetBbox.north &&
          lng >= targetBbox.west &&
          lng <= targetBbox.east
        );
      };

      const partitionStartedAt = Date.now();
      const clusterBbox = expandBoundingBox(bbox, CLUSTER_SOURCE_BBOX_BUFFER_MULTIPLIER);
      const coordinateEvents: Event[] = [];
      const clusterSourceEvents: Event[] = [];
      const viewportEvents: Event[] = [];
      const outsideViewportEvents: Event[] = [];

      // candidateEvents comes from fetchMinimalEvents/dedupeEvents or allEvents,
      // so keep this pass allocation-light and avoid re-deduping the same list.
      for (const event of candidateEvents) {
        if (!hasValidCoordinates(event)) {
          if (hasScopedLocation(event)) {
            outsideViewportEvents.push(event);
          }
          continue;
        }

        coordinateEvents.push(event);
        if (inBbox(event)) {
          viewportEvents.push(event);
        } else {
          outsideViewportEvents.push(event);
        }

        if (inBbox(event, clusterBbox)) {
          clusterSourceEvents.push(event);
        }
      }

      const partitionMs = Date.now() - partitionStartedAt;
      const filterStartedAt = Date.now();
      const filtered = filterEvents(clusterSourceEvents, filters);
      const filterMs = Date.now() - filterStartedAt;
      logStartupDataTiming('viewport_partition_complete', {
        elapsedMs: Date.now() - startedAt,
        partitionMs,
        filterMs,
        candidateEvents: candidateEvents.length,
        coordinateEvents: coordinateEvents.length,
        clusterBbox,
        clusterSourceEvents: clusterSourceEvents.length,
        viewportCount: viewportEvents.length,
        outsideViewportCount: outsideViewportEvents.length,
        filteredCount: filtered.length,
      });

      filtersChanged = true;

      const onScreenEvents = viewportEvents;

      if (DEBUG_MAP_LOAD) {
        console.log('[MapLoad][viewport] Firestore client-side partition complete:', {
          durationMs: Date.now() - startedAt,
          requestedType: typeParam,
          candidateEvents: candidateEvents.length,
          coordinateEvents: coordinateEvents.length,
          viewportCount: viewportEvents.length,
          outsideViewportCount: outsideViewportEvents.length,
          filteredCount: filtered.length,
        });
      }

      set({
        events: clusterSourceEvents,
        viewportEvents,
        outsideViewportEvents,
        onScreenEvents,
        filteredEvents: filtered,
        viewportBbox: bbox,
        viewportMetadata: {
          wasCapped: false,
          viewportCount: viewportEvents.length,
          outsideViewportCount: outsideViewportEvents.length,
          lastFetchTimestamp: new Date().toISOString(),
        },
        isLoading: false,
        lastFetchedAt: Date.now(),
      });

      get().generateClusters(get().zoomLevel);
      logStartupDataTiming('viewport_fetch_completed', {
        elapsedMs: Date.now() - startedAt,
        clusters: get().clusters.length,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown viewport fetch error';
      console.error('[MapStore] Viewport fetch error:', errorMsg);
      set({
        error: errorMsg,
        isLoading: false,
      });
      logStartupDataTiming('viewport_fetch_failed', {
        elapsedMs: Date.now() - startedAt,
        error: errorMsg,
      });
    }
  },

  /**
   * Set viewport bounding box
   */
  setViewportBbox: (bbox: { west: number; south: number; east: number; north: number }) => {
    set({ viewportBbox: bbox });
  },

  setOnScreenEvents: (events: Event[]) => {
    set({ onScreenEvents: events });
  },

  /**
   * Fetch detailed event data for lazy loading callouts
   */
fetchEventDetails: async (eventIds: (string | number)[]) => {
  if (!eventIds || eventIds.length === 0) return;

  const qc: any = (global as any)?.__RQ_CLIENT ?? null;
  const normalizedIds = Array.from(
    new Set(
      eventIds
        .filter((id) => !isPrivateSharedEventId(id))
        .map((id) => toAppEventId(id))
        .filter(Boolean)
    )
  );
  if (normalizedIds.length === 0) return;
  const idsString = normalizedIds.join(',');
  const key = ['event-details', [...normalizedIds].sort().join(',')];
  const STALE_MS = 1000 * 60 * 5;

  const dedupeByEquivalentId = (items: Event[]): Event[] => {
    const deduped: Event[] = [];
    for (const item of items) {
      const existingIndex = deduped.findIndex((candidate) =>
        areEventIdsEquivalent(candidate.id, item.id)
      );
      if (existingIndex >= 0) {
        deduped[existingIndex] = item;
      } else {
        deduped.push(item);
      }
    }
    return deduped;
  };

  const coerceDetailToEvent = (detail: any): Event => {
    const eventType = detail?.type === 'special' ? 'special' : 'event';
    return {
      id: toAppEventId(detail?.id ?? ''),
      type: eventType,
      category: detail?.category || 'Other',
      title: detail?.title || '',
      description: detail?.fullDescription || detail?.description || '',
      venue: detail?.venue || '',
      address: detail?.address || '',
      startDate: detail?.startDate || '',
      endDate: detail?.endDate || detail?.startDate || '',
      startTime: detail?.startTime || '',
      endTime: detail?.endTime || '',
      ticketPrice: detail?.ticketPrice || detail?.price || '',
      profileUrl: detail?.profileUrl || '',
      imageUrl: detail?.imageUrl || '',
      SharedPostThumbnail: detail?.SharedPostThumbnail || '',
      latitude: Number(detail?.latitude) || 0,
      longitude: Number(detail?.longitude) || 0,
      ticketLinkPosts: detail?.ticketLinkPosts || '',
      ticketLinkEvents: detail?.ticketLinkEvents || '',
      source: detail?.source || 'firestore',
      likes: detail?.likes,
      shares: detail?.shares,
      interested: detail?.interested,
      comments: detail?.comments,
      topReactionsCount: detail?.topReactionsCount,
      usersResponded: detail?.usersResponded,
      mediaUrls: detail?.mediaUrls,
      facebookUrl: detail?.facebookUrl,
      eventType: detail?.eventType,
      ageRestriction: detail?.ageRestriction,
      isRecurring: detail?.isRecurring,
      recurringPattern: detail?.recurringPattern,
      isRecurringInstance: detail?.isRecurringInstance,
      originalEventId: detail?.originalEventId ?? null,
      venueRating: detail?.venueRating,
      venuePhone: detail?.venuePhone,
      venueWebsite: detail?.venueWebsite,
      venueFacebookUrl: detail?.venueFacebookUrl,
      venueInstagramUrl: detail?.venueInstagramUrl,
      venueCategories: detail?.venueCategories,
    };
  };

  const normalizeDetail = (detail: any): any | null => {
    if (!detail || detail.id == null) return null;
    const rawOriginalId =
      detail.originalEventId ?? detail.metadata?.originalEventId ?? null;
    return {
      ...detail,
      id: toAppEventId(detail.id),
      description: detail.fullDescription || detail.description || '',
      isRecurring: detail.isRecurring ?? detail.metadata?.isRecurring,
      recurringPattern: detail.recurringPattern ?? detail.metadata?.recurringPattern,
      isRecurringInstance:
        detail.isRecurringInstance ?? detail.metadata?.isRecurringInstance,
      originalEventId: rawOriginalId ? toAppEventId(rawOriginalId) : null,
    };
  };

  const fetchLegacyDetails = async (): Promise<any[]> => {
    const legacyIds = eventIds.map((id) => String(id)).filter(Boolean).join(',');
    const url = `${LEGACY_EVENTS_API_BASE}/details?ids=${encodeURIComponent(legacyIds)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Legacy details API error: ${response.status}`);
    }

    const payload = await response.json();
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  };

  const fetchFresh = async () => {
    if (DEBUG_MAP_LOAD) {
      console.log('[MapStore] Fetching event details from Firestore for ids:', idsString);
    }

    const firestoreDetails = await fetchFirestoreEventDetailsBatch(normalizedIds);
    if (firestoreDetails.length > 0 || !ENABLE_LEGACY_DETAILS_FALLBACK) {
      return firestoreDetails as any[];
    }

    console.warn(
      '[MapStore] Firestore details returned no rows; trying legacy fallback because ENABLE_LEGACY_DETAILS_FALLBACK=true'
    );
    return fetchLegacyDetails();
  };

  const mergeIntoStore = (rawDetails: any[]) => {
    const normalizedDetails = rawDetails
      .map(normalizeDetail)
      .filter((detail): detail is any => Boolean(detail));

    if (normalizedDetails.length === 0) return;

    const mergeCollection = (collection: Event[]): Event[] => {
      const merged = collection.map((event) => {
        const detail = normalizedDetails.find((candidate) =>
          areEventIdsEquivalent(candidate.id, event.id)
        );
        if (!detail) return event;

        return {
          ...event,
          ...detail,
          // Keep stable event identity in current collection shape.
          id: event.id,
          type: event.type,
          description: detail.fullDescription || detail.description || event.description,
          ticketLinkPosts: detail.ticketLinkPosts ?? event.ticketLinkPosts,
          ticketLinkEvents: detail.ticketLinkEvents ?? event.ticketLinkEvents,
          isRecurring: detail.isRecurring ?? event.isRecurring,
          recurringPattern: detail.recurringPattern ?? event.recurringPattern,
          isRecurringInstance:
            detail.isRecurringInstance ?? event.isRecurringInstance,
          originalEventId: detail.originalEventId ?? event.originalEventId ?? null,
        } as Event;
      });

      const extras = normalizedDetails
        .filter(
          (detail) =>
            !merged.some((event) => areEventIdsEquivalent(event.id, detail.id))
        )
        .map((detail) => coerceDetailToEvent(detail));

      return dedupeByEquivalentId([...merged, ...extras]);
    };

    const { events, allEvents } = get();
    const nextEvents = mergeCollection(events);
    const nextAllEvents = mergeCollection(allEvents);

    const calloutOpenNow =
      Array.isArray((get() as any).selectedVenues) && (get() as any).selectedVenues.length > 0;
    console.warn('[EnhanceProbe] mergeIntoStore set({events,allEvents})', {
      calloutOpen: calloutOpenNow,
      nextEvents: nextEvents.length,
    });

    set({
      events: nextEvents,
      allEvents: nextAllEvents,
    });
  };

  const cached = qc?.getQueryData(key) as any[] | undefined;
  if (cached?.length) {
    if (DEBUG_MAP_LOAD) {
      console.log('[MapStore] Using cached event details for', idsString);
    }
    mergeIntoStore(cached);

    if (qc) {
      qc.fetchQuery({
        queryKey: key,
        queryFn: fetchFresh,
        staleTime: STALE_MS,
        gcTime: 1000 * 60 * 10,
      }).then((fresh: any[]) => {
        mergeIntoStore(fresh);
      }).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[MapStore] details refresh error:', msg);
      });
    }
    return;
  }

  try {
    const fresh = qc
      ? await qc.fetchQuery({
          queryKey: key,
          queryFn: fetchFresh,
          staleTime: STALE_MS,
          gcTime: 1000 * 60 * 10,
        })
      : await fetchFresh();
    mergeIntoStore(fresh);
  } catch (error) {
    console.error('Error fetching event details:', error);
  }
},

  
  /**
   * Get filtered events based on current criteria
   */
  getFilteredEvents: () => {
    const { events, filterCriteria } = get();
    const t0 = Date.now();

    const filtered = filterEvents(events, filterCriteria);

    __ML_lastFilterMs = Date.now() - t0;
    __ML_lastFilterIn = events.length;
    __ML_lastFilterOut = filtered.length;
    if (DEBUG_MAP_LOAD) {
      const eventsIn = events.filter(e => e.type === 'event').length;
      const specialsIn = events.length - eventsIn;
      const eventsOut = filtered.filter(e => e.type === 'event').length;
      const specialsOut = filtered.length - eventsOut;
      console.log(`[MapLoad][filter] ms=${__ML_lastFilterMs} in=${__ML_lastFilterIn} (events=${eventsIn}, specials=${specialsIn}) out=${__ML_lastFilterOut} (events=${eventsOut}, specials=${specialsOut})`);
    }

    filtersChanged = true;
    set({ filteredEvents: filtered });
    return filtered;
  },
  
  /**
   * Generate clusters based on filtered events
   */
  generateClusters: (zoom) => {
    const { filteredEvents, zoomLevel } = get();
    const currentZoom = zoom || zoomLevel;
    const t0 = Date.now();
    logStartupDataTiming('generate_clusters_started', {
      zoom: currentZoom,
      filteredEvents: filteredEvents.length,
    });

    const venues = groupEventsByVenue(filteredEvents);
    const clusters = clusterVenues(venues, currentZoom);

    if (__DEV__ && currentZoom >= 8.5 && currentZoom <= 12.5 && filteredEvents.length > 0) {
      const zoomBucket = Math.round(currentZoom * 4) / 4;
      const debugKey = `${zoomBucket}:${filteredEvents.length}:${venues.length}:${clusters.length}`;
      if ((globalThis as any).__gathrLastCharlottetownClusterGapDebugKey !== debugKey) {
        (globalThis as any).__gathrLastCharlottetownClusterGapDebugKey = debugKey;

        const isFiniteCoordinate = (lat: number, lng: number) =>
          Number.isFinite(lat) && Number.isFinite(lng);
        const isNearCharlottetown = (lat: number, lng: number) =>
          isFiniteCoordinate(lat, lng) &&
          lat >= 46.19 && lat <= 46.27 &&
          lng >= -63.18 && lng <= -63.06;
        const centerForVenues = (clusterVenues: Venue[]) => {
          const coords = clusterVenues
            .map((venue) => ({
              lat: Number(venue.latitude),
              lng: Number(venue.longitude),
            }))
            .filter(({ lat, lng }) => isFiniteCoordinate(lat, lng));

          if (coords.length === 0) {
            return { lat: null, lng: null };
          }

          return {
            lat: Number((coords.reduce((sum, coord) => sum + coord.lat, 0) / coords.length).toFixed(5)),
            lng: Number((coords.reduce((sum, coord) => sum + coord.lng, 0) / coords.length).toFixed(5)),
          };
        };

        const nearCharlottetownEvents = filteredEvents.filter((event) =>
          isNearCharlottetown(Number(event.latitude), Number(event.longitude))
        );
        const nearCharlottetownVenues = venues
          .filter((venue) => isNearCharlottetown(Number(venue.latitude), Number(venue.longitude)))
          .map((venue) => ({
            venue: venue.venue,
            events: venue.events.filter((event) => event.type === 'event').length,
            specials: venue.events.filter((event) => event.type === 'special').length,
            lat: Number(Number(venue.latitude).toFixed(5)),
            lng: Number(Number(venue.longitude).toFixed(5)),
          }))
          .sort((a, b) => (b.events + b.specials) - (a.events + a.specials))
          .slice(0, 12);

        const clusterSummary = clusters.map((cluster) => {
          const center = centerForVenues(cluster.venues);
          const topVenues = [...cluster.venues]
            .sort((a, b) => b.events.length - a.events.length)
            .slice(0, 5)
            .map((venue) => ({
              venue: venue.venue,
              events: venue.events.filter((event) => event.type === 'event').length,
              specials: venue.events.filter((event) => event.type === 'special').length,
            }));

          return {
            id: cluster.id.slice(0, 80),
            type: cluster.clusterType,
            venues: cluster.venues.length,
            events: cluster.eventCount,
            specials: cluster.specialCount,
            center,
            nearCharlottetown: center.lat !== null && center.lng !== null
              ? isNearCharlottetown(center.lat, center.lng)
              : false,
            topVenues,
          };
        });

        console.warn('[CharlottetownClusterGapDebug]', JSON.stringify({
          zoom: Number(currentZoom.toFixed(2)),
          filteredEvents: filteredEvents.length,
          venues: venues.length,
          clusters: clusters.length,
          nearCharlottetownEvents: nearCharlottetownEvents.length,
          nearCharlottetownVenues: nearCharlottetownVenues.length,
          nearCharlottetownVenueSample: nearCharlottetownVenues,
          clusterSummary,
        }));
      }
    }

    __ML_lastVenueCount = venues.length;
    __ML_lastClusterCount = clusters.length;
    __ML_lastClusterMs = Date.now() - t0;

    if (DEBUG_MAP_LOAD) {
      // Determine threshold name for the current zoom
      const idx = getThresholdIndexForZoom(currentZoom);
      const thresholdName = ZOOM_THRESHOLDS[idx]?.name ?? `idx:${idx}`;
      console.log(`[MapLoad][cluster] ms=${__ML_lastClusterMs} zoom=${currentZoom.toFixed(2)} threshold=${thresholdName} venues=${__ML_lastVenueCount} clusters=${__ML_lastClusterCount}`);
    }


    // Debug: per-zoom cluster vs point breakdown + "gap" detector
const __multiCount = clusters.filter(c => c.clusterType === 'multi').length;
const __singleCount = clusters.filter(c => c.clusterType === 'single').length;

if (DEBUG_MAP_LOAD) {
  console.log(
    `[MapLoad][cluster_counts] z=${currentZoom.toFixed(2)} ` +
    `multi=${__multiCount} single=${__singleCount} total=${clusters.length}`
  );
  // Detect UI-layer "gap": data exists but nothing rendered
  if (clusters.length === 0 && filteredEvents.length > 0) {
    console.warn(
      '[ClusterGap] filteredEvents > 0 but zero clusters at this zoom — check layer filters/min/maxZoom.'
    );
  }
}

set({ clusters });
logStartupDataTiming('generate_clusters_completed', {
  elapsedMs: Date.now() - t0,
  zoom: currentZoom,
  venues: __ML_lastVenueCount,
  clusters: __ML_lastClusterCount,
});
  },

  getClustersForZoom: (zoom) => {
    const { filteredEvents } = get();
    const venues = groupEventsByVenue(filteredEvents);
    return clusterVenues(venues, zoom);
  },
  
  /**
   * Get time filter counts for current criteria
   */
  getTimeFilterCounts: (eventType: 'event' | 'special') => {
    const { onScreenEvents, filterCriteria } = get();
    // Use ONLY on-screen events - counts should reflect what's actually visible on screen
    return getCachedTimeFilterCounts(onScreenEvents, filterCriteria, eventType);
  },

  /**
   * Get category filter counts for current criteria
   */
  getCategoryFilterCounts: (eventType: 'event' | 'special') => {
    const { onScreenEvents, filterCriteria } = get();
    // Use ONLY on-screen events - counts should reflect what's actually visible on screen
    return getCachedCategoryFilterCounts(onScreenEvents, filterCriteria, eventType);
  }
}))
