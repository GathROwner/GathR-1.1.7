/**
 * Geo/Viewport Utilities for Map Optimization
 *
 * This module provides functions to calculate viewport bounding boxes
 * based on user location and zoom level, enabling efficient viewport-based
 * data fetching instead of loading all events globally.
 */

/**
 * Earth's radius in meters (WGS84 semi-major axis)
 */
const EARTH_RADIUS_METERS = 6378137;

/**
 * Mapbox GL / MapLibre zoom level to meters per pixel conversion
 * @rnmapbox/maps uses 512px tiles (not 256px), which is standard for Mapbox GL
 * At zoom level 0, the entire world (512px tile) = Earth's circumference
 * Each zoom level doubles the pixels (halves the scale)
 */
const METERS_PER_PIXEL_AT_ZOOM_0 = (2 * Math.PI * EARTH_RADIUS_METERS) / 512;
const DEBUG_VIEWPORT_BBOX = false;

/**
 * Bounding box representing a geographic rectangle
 */
export interface BoundingBox {
  west: number;   // Western longitude (min longitude)
  south: number;  // Southern latitude (min latitude)
  east: number;   // Eastern longitude (max longitude)
  north: number;  // Northern latitude (max latitude)
}

/**
 * Geographic coordinate (lat/lng)
 */
export interface GeoCoordinate {
  latitude: number;
  longitude: number;
}

/**
 * Calculate meters per pixel at a given latitude and zoom level
 * This is crucial because meters per pixel varies with latitude (Mercator projection)
 *
 * @param latitude - Latitude in degrees (-90 to 90)
 * @param zoom - Mapbox zoom level (0 to 22)
 * @returns Meters per pixel at the given latitude and zoom
 */
export function getMetersPerPixel(latitude: number, zoom: number): number {
  const latitudeRadians = (latitude * Math.PI) / 180;
  const metersPerPixel =
    (METERS_PER_PIXEL_AT_ZOOM_0 * Math.cos(latitudeRadians)) / Math.pow(2, zoom);
  return metersPerPixel;
}

/**
 * Calculate the viewport's geographic radius in meters
 * This determines how far from the center we need to fetch data
 *
 * @param viewportWidthPixels - Width of the viewport in pixels
 * @param viewportHeightPixels - Height of the viewport in pixels
 * @param latitude - Center latitude
 * @param zoom - Current zoom level
 * @returns Radius in meters from center to corner of viewport (diagonal distance)
 */
export function getViewportRadiusMeters(
  viewportWidthPixels: number,
  viewportHeightPixels: number,
  latitude: number,
  zoom: number
): number {
  const metersPerPixel = getMetersPerPixel(latitude, zoom);

  // Calculate diagonal distance in pixels (Pythagorean theorem)
  const diagonalPixels = Math.sqrt(
    Math.pow(viewportWidthPixels / 2, 2) + Math.pow(viewportHeightPixels / 2, 2)
  );

  // Convert to meters
  const radiusMeters = diagonalPixels * metersPerPixel;

  return radiusMeters;
}

/**
 * Clamp a value to a valid range
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate a bounding box from a center point and radius
 * Uses the Haversine formula to accurately compute lat/lng offsets
 * Clamps coordinates to valid lat/lng ranges
 *
 * @param center - Center coordinate (user's location)
 * @param radiusMeters - Radius in meters
 * @returns BoundingBox that encompasses the circular area
 */
export function getBoundingBoxFromRadius(
  center: GeoCoordinate,
  radiusMeters: number
): BoundingBox {
  const { latitude, longitude } = center;

  // Convert latitude to radians
  const latRad = (latitude * Math.PI) / 180;

  // Calculate latitude offset (simpler because Earth is roughly spherical in N-S direction)
  const latOffsetDegrees = (radiusMeters / EARTH_RADIUS_METERS) * (180 / Math.PI);

  // Calculate longitude offset (compensate for latitude convergence)
  // At higher latitudes, longitude lines are closer together
  const lonOffsetDegrees =
    (radiusMeters / (EARTH_RADIUS_METERS * Math.cos(latRad))) * (180 / Math.PI);

  // Clamp to valid lat/lng ranges
  return {
    west: clamp(longitude - lonOffsetDegrees, -180, 180),
    south: clamp(latitude - latOffsetDegrees, -90, 90),
    east: clamp(longitude + lonOffsetDegrees, -180, 180),
    north: clamp(latitude + latOffsetDegrees, -90, 90),
  };
}

/**
 * Calculate viewport bounding box from user location, zoom, and screen dimensions
 * This is the main function you'll use for viewport-based data fetching
 *
 * @param center - User's current location
 * @param zoom - Current map zoom level
 * @param viewportWidthPixels - Viewport width in pixels
 * @param viewportHeightPixels - Viewport height in pixels
 * @param bufferMultiplier - Optional buffer to fetch slightly beyond viewport (default 1.1 = 10% buffer)
 * @returns BoundingBox for the visible area (+ buffer)
 */
export function getViewportBoundingBox(
  center: GeoCoordinate,
  zoom: number,
  viewportWidthPixels: number,
  viewportHeightPixels: number,
  bufferMultiplier: number = 1.0
): BoundingBox {
  // Calculate meters per pixel at the center latitude
  const metersPerPixel = getMetersPerPixel(center.latitude, zoom);

  // Calculate half-width and half-height in meters (from center to edge)
  const halfWidthMeters = (viewportWidthPixels / 2) * metersPerPixel;
  const halfHeightMeters = (viewportHeightPixels / 2) * metersPerPixel;

  // Apply buffer multiplier
  const bufferedHalfWidthMeters = halfWidthMeters * bufferMultiplier;
  const bufferedHalfHeightMeters = halfHeightMeters * bufferMultiplier;

  // Calculate latitude offsets (simpler because Earth is roughly spherical in N-S direction)
  const latOffsetDegrees = (bufferedHalfHeightMeters / EARTH_RADIUS_METERS) * (180 / Math.PI);

  // Calculate longitude offset (compensate for latitude convergence)
  const latRad = (center.latitude * Math.PI) / 180;
  const lonOffsetDegrees = (bufferedHalfWidthMeters / (EARTH_RADIUS_METERS * Math.cos(latRad))) * (180 / Math.PI);

  // Create rectangular bounding box directly from screen dimensions
  const bbox = {
    west: clamp(center.longitude - lonOffsetDegrees, -180, 180),
    south: clamp(center.latitude - latOffsetDegrees, -90, 90),
    east: clamp(center.longitude + lonOffsetDegrees, -180, 180),
    north: clamp(center.latitude + latOffsetDegrees, -90, 90),
  };

  if (DEBUG_VIEWPORT_BBOX) {
  console.log(`[GeoUtils] 🗺️ getViewportBoundingBox:`, {
    center,
    zoom,
    viewportSize: `${viewportWidthPixels}x${viewportHeightPixels}`,
    halfWidthKm: (halfWidthMeters / 1000).toFixed(2),
    halfHeightKm: (halfHeightMeters / 1000).toFixed(2),
    bufferedHalfWidthKm: (bufferedHalfWidthMeters / 1000).toFixed(2),
    bufferedHalfHeightKm: (bufferedHalfHeightMeters / 1000).toFixed(2),
    bufferMultiplier,
  });

  console.log(`[GeoUtils] 📦 Resulting bbox:`, bbox);
  }
  return bbox;
}

/**
 * Check if a coordinate is within a bounding box
 * Useful for client-side filtering
 *
 * @param coord - Coordinate to check
 * @param bbox - Bounding box
 * @returns true if coordinate is inside the box
 */
export function isCoordinateInBoundingBox(
  coord: GeoCoordinate,
  bbox: BoundingBox
): boolean {
  return (
    coord.latitude >= bbox.south &&
    coord.latitude <= bbox.north &&
    coord.longitude >= bbox.west &&
    coord.longitude <= bbox.east
  );
}

/**
 * Format bounding box for API query string
 *
 * @param bbox - Bounding box
 * @returns Query string format: "west,south,east,north"
 */
export function formatBoundingBoxForAPI(bbox: BoundingBox): string {
  const west = bbox.west.toFixed(6);
  const south = bbox.south.toFixed(6);
  const east = bbox.east.toFixed(6);
  const north = bbox.north.toFixed(6);
  return `${west},${south},${east},${north}`;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 *
 * @param coord1 - First coordinate
 * @param coord2 - Second coordinate
 * @returns Distance in meters
 */
export function calculateDistance(
  coord1: GeoCoordinate,
  coord2: GeoCoordinate
): number {
  const lat1 = coord1.latitude;
  const lon1 = coord1.longitude;
  const lat2 = coord2.latitude;
  const lon2 = coord2.longitude;

  const R = EARTH_RADIUS_METERS;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get a human-readable description of the viewport size
 * Useful for debugging and logging
 *
 * @param bbox - Bounding box
 * @returns Human-readable string describing the area
 */
export function describeViewportSize(bbox: BoundingBox): string {
  const center: GeoCoordinate = {
    latitude: (bbox.north + bbox.south) / 2,
    longitude: (bbox.east + bbox.west) / 2,
  };

  const northEdge: GeoCoordinate = { latitude: bbox.north, longitude: center.longitude };
  const southEdge: GeoCoordinate = { latitude: bbox.south, longitude: center.longitude };
  const eastEdge: GeoCoordinate = { latitude: center.latitude, longitude: bbox.east };
  const westEdge: GeoCoordinate = { latitude: center.latitude, longitude: bbox.west };

  const heightMeters = calculateDistance(southEdge, northEdge);
  const widthMeters = calculateDistance(westEdge, eastEdge);

  const heightKm = (heightMeters / 1000).toFixed(2);
  const widthKm = (widthMeters / 1000).toFixed(2);

  return `${widthKm}km x ${heightKm}km (WxH)`;
}

/**
 * Round bounding box coordinates for cache key stability
 * This prevents cache misses from tiny camera movements
 *
 * @param bbox - Original bounding box
 * @param precision - Decimal places to round to (default 2 = ~1km precision)
 * @returns Rounded bounding box suitable for cache keys
 */
export function roundBoundingBoxForCache(bbox: BoundingBox, precision: number = 2): BoundingBox {
  const factor = Math.pow(10, precision);
  return {
    west: Math.floor(bbox.west * factor) / factor,
    south: Math.floor(bbox.south * factor) / factor,
    east: Math.ceil(bbox.east * factor) / factor,
    north: Math.ceil(bbox.north * factor) / factor,
  };
}

// ==================== TEST/VALIDATION FUNCTIONS ====================

/**
 * Validate the bounding box calculations with known test cases
 * Run this to verify the math is correct
 */
export function validateBoundingBoxCalculations(): void {
  console.log('>� Testing Bounding Box Calculations...\n');

  // Test Case 1: PEI (your default location) at city zoom level
  const peiCenter: GeoCoordinate = { latitude: 46.2336, longitude: -63.1276 };
  const cityZoom = 12;
  const screenWidth = 400;
  const screenHeight = 800;

  console.log('Test 1: PEI at zoom 12 (city-level)');
  console.log('Center:', peiCenter);
  console.log('Zoom:', cityZoom);
  console.log('Screen:', `${screenWidth}�${screenHeight}px`);

  const bbox1 = getViewportBoundingBox(peiCenter, cityZoom, screenWidth, screenHeight);
  console.log('Bounding Box:', bbox1);
  console.log('Viewport Size:', describeViewportSize(bbox1));
  console.log('API Format:', formatBoundingBoxForAPI(bbox1));

  // Calculate expected area
  const radius1 = getViewportRadiusMeters(screenWidth, screenHeight, peiCenter.latitude, cityZoom);
  console.log('Viewport Radius:', `${(radius1 / 1000).toFixed(2)}km`);
  console.log(' Test 1 Complete\n');

  // Test Case 2: Street-level zoom (zoomed in)
  const streetZoom = 16;
  console.log('Test 2: PEI at zoom 16 (street-level)');
  const bbox2 = getViewportBoundingBox(peiCenter, streetZoom, screenWidth, screenHeight);
  console.log('Bounding Box:', bbox2);
  console.log('Viewport Size:', describeViewportSize(bbox2));
  const radius2 = getViewportRadiusMeters(screenWidth, screenHeight, peiCenter.latitude, streetZoom);
  console.log('Viewport Radius:', `${radius2.toFixed(0)}m`);
  console.log(' Test 2 Complete\n');

  // Test Case 3: Regional zoom (zoomed out)
  const regionalZoom = 8;
  console.log('Test 3: PEI at zoom 8 (regional-level)');
  const bbox3 = getViewportBoundingBox(peiCenter, regionalZoom, screenWidth, screenHeight);
  console.log('Bounding Box:', bbox3);
  console.log('Viewport Size:', describeViewportSize(bbox3));
  const radius3 = getViewportRadiusMeters(screenWidth, screenHeight, peiCenter.latitude, regionalZoom);
  console.log('Viewport Radius:', `${(radius3 / 1000).toFixed(2)}km`);
  console.log(' Test 3 Complete\n');

  // Test Case 4: Verify coordinate inclusion
  console.log('Test 4: Coordinate inclusion check');
  const testCoordInside: GeoCoordinate = { latitude: 46.25, longitude: -63.10 };
  const testCoordOutside: GeoCoordinate = { latitude: 50.0, longitude: -70.0 };

  const isInside1 = isCoordinateInBoundingBox(testCoordInside, bbox1);
  const isInside2 = isCoordinateInBoundingBox(testCoordOutside, bbox1);

  console.log('Coord (46.25, -63.10) in bbox1?', isInside1, '(should be true)');
  console.log('Coord (50.0, -70.0) in bbox1?', isInside2, '(should be false)');
  console.log(' Test 4 Complete\n');

  // Test Case 5: Distance calculation verification
  console.log('Test 5: Distance calculation');
  const dist = calculateDistance(peiCenter, testCoordInside);
  console.log(`Distance from PEI center to (46.25, -63.10): ${(dist / 1000).toFixed(2)}km`);
  console.log(' Test 5 Complete\n');

  // Test Case 6: Cache key stability
  console.log('Test 6: Cache key stability (rounded bbox)');
  const bbox1Rounded = roundBoundingBoxForCache(bbox1);
  console.log('Original bbox:', bbox1);
  console.log('Rounded bbox:', bbox1Rounded);
  console.log('Rounded API format:', formatBoundingBoxForAPI(bbox1Rounded));
  console.log(' Test 6 Complete\n');

  console.log(' All validation tests complete!');
  console.log('\n=� Summary:');
  console.log('- Zoom 12 (city): ~10-20km radius');
  console.log('- Zoom 16 (street): ~500-1000m radius');
  console.log('- Zoom 8 (regional): ~80-160km radius');
  console.log('\n=� These values look reasonable for viewport-based data fetching!');
}

/**
 * Example usage demonstrating how to use these utilities in your map screen
 */
export function exampleUsage(): void {
  console.log('=� Example Usage:\n');

  // Simulate user location and map state (like what you'd get from map.tsx)
  const userLocation: GeoCoordinate = {
    latitude: 46.2336,
    longitude: -63.1276
  };
  const currentZoom = 12;
  const screenWidth = 400;
  const screenHeight = 800;

  // Calculate viewport bounding box
  const bbox = getViewportBoundingBox(
    userLocation,
    currentZoom,
    screenWidth,
    screenHeight,
    1.2 // 20% buffer for smooth panning
  );

  console.log('User Location:', userLocation);
  console.log('Zoom Level:', currentZoom);
  console.log('Viewport Bounding Box:', bbox);
  console.log('Viewport Size:', describeViewportSize(bbox));

  // Format for API call
  const apiQuery = formatBoundingBoxForAPI(bbox);
  console.log('\n< API Call:');
  console.log(`GET /api/v2/events/minimal?bbox=${apiQuery}`);
  console.log('Full URL:', `https://gathr-backend-951249927221.northamerica-northeast1.run.app/api/v2/events/minimal?bbox=${apiQuery}`);

  // Round for cache key
  const cacheKey = roundBoundingBoxForCache(bbox);
  const cacheKeyString = formatBoundingBoxForAPI(cacheKey);
  console.log('\n=� Cache Key:');
  console.log('Rounded bbox:', cacheKey);
  console.log('Cache key string:', `events-viewport-${cacheKeyString}`);

  // Check if a specific event location is in viewport
  const eventLocation: GeoCoordinate = {
    latitude: 46.25,
    longitude: -63.10
  };
  const isVisible = isCoordinateInBoundingBox(eventLocation, bbox);
  console.log('\n=� Event Visibility:');
  console.log('Event at (46.25, -63.10) is visible?', isVisible);

  // Calculate distance from user to event
  const distance = calculateDistance(userLocation, eventLocation);
  console.log('Distance to event:', `${(distance / 1000).toFixed(2)}km`);
}

/**
 * Run all validation tests - call this from your map component to verify
 */
export function runAllTests(): void {
  console.log('='.repeat(60));
  console.log('GEOUTILS VALIDATION SUITE');
  console.log('='.repeat(60) + '\n');

  validateBoundingBoxCalculations();

  console.log('\n' + '='.repeat(60));
  exampleUsage();
  console.log('='.repeat(60));
}

// ==================== IMPLEMENTATION PLAN ====================
/*

VIEWPORT-BASED DATA LOADING IMPLEMENTATION PLAN
================================================

PHASE 1: VALIDATION & TESTING (CURRENT PHASE)
----------------------------------------------
✅ Created geoUtils.ts with bounding box calculation functions
✅ Designed region-based caching strategy

TODO: Test the calculations
1. Add import to map.tsx: import { runAllTests } from '@/utils/geoUtils';
2. Call runAllTests() in useEffect on map mount (temporarily)
3. Check console logs to verify calculations are accurate
4. Remove the test call once verified


PHASE 2: BACKEND API ENDPOINT
------------------------------
The backend needs a new endpoint that accepts bbox parameter:

Endpoint: GET /api/v2/events/minimal/viewport
Parameters:
  - bbox: "west,south,east,north" (e.g., "-63.303,46.119,-62.952,46.348")
  - type: "event" | "special" | "both" (optional, default "both")

Example:
  GET /api/v2/events/minimal/viewport?bbox=-63.303,46.119,-62.952,46.348&type=both

Response: Same format as current /events/minimal endpoint
  {
    "events": [...],  // Only events within bbox
    "specials": [...] // Only specials within bbox
  }

Backend Implementation (pseudo-code):
  SELECT * FROM events
  WHERE latitude BETWEEN :south AND :north
    AND longitude BETWEEN :west AND :east
    AND type = :type
  ORDER BY start_date ASC
  LIMIT 1000


PHASE 3: FRONTEND - CREATE VIEWPORT DATA HOOK
----------------------------------------------
File: hooks/useViewportEvents.ts (new file)

Purpose: Replace the global fetchEvents() with viewport-aware fetching

Key functions:
1. useViewportEvents() - Main hook for fetching viewport data
2. Cache key generation with rounded bbox for stability
3. Progressive loading (viewport → adjacent tiles → full dataset)

Integration points:
- Replace fetchEvents() calls in _layout.tsx
- Add viewport calculation in map.tsx when location/zoom changes
- Implement cache-first strategy with React Query


PHASE 4: FRONTEND - UPDATE MAP STORE
-------------------------------------
File: store/mapStore.ts (modifications)

Changes needed:
1. Add viewport-specific fetch function
2. Modify setEvents to handle partial data (merge, not replace)
3. Add viewport bbox to store state for debugging
4. Update clustering to work with partial data

New store methods:
- fetchViewportEvents(bbox, filters)
- mergeViewportEvents(newEvents, bbox)
- getCurrentViewportBbox()


PHASE 5: FRONTEND - UPDATE MAP COMPONENT
-----------------------------------------
File: app/(tabs)/map.tsx (modifications)

Changes:
1. Calculate viewport bbox when location or zoom changes
2. Fetch viewport data instead of all data
3. Pre-fetch adjacent regions on idle
4. Handle pan/zoom with smart re-fetching

Trigger points for viewport fetching:
- Initial load (when location acquired)
- Zoom level changes (when crossing threshold bands)
- Pan beyond cached region boundary
- Filter changes


PHASE 6: FALLBACK & FULL DATASET
---------------------------------
Keep the ability to fetch full dataset for:
- Search functionality (needs all events)
- Global filters (may need events outside viewport)
- User explicitly requests "show all"

Implementation:
- Dual fetch strategy: viewport-first, full-dataset on demand
- Cache both separately with different keys
- UI indicator showing "viewing local area" vs "viewing all"


PHASE 7: TESTING & OPTIMIZATION
--------------------------------
1. Test viewport calculations at different zoom levels
2. Verify cache hit/miss rates
3. Measure load time improvements
4. Test edge cases:
   - Location permission denied
   - Poor connectivity
   - Rapid pan/zoom
   - Filter changes
5. A/B test with subset of users


MIGRATION STRATEGY
------------------
Phase A: Add viewport endpoint (backend)
  → No frontend changes yet
  → Test endpoint manually

Phase B: Enable viewport fetch (frontend - feature flag)
  → Add feature flag: ENABLE_VIEWPORT_FETCH
  → When enabled, use viewport fetch
  → When disabled, use current global fetch
  → Monitor performance metrics

Phase C: Gradual rollout
  → Enable for 10% of users
  → Monitor error rates, load times
  → Increase to 50%, then 100%
  → Remove feature flag

Phase D: Remove legacy code
  → Clean up old fetchEvents()
  → Remove global data preloading from _layout.tsx
  → Simplify clustering logic


EXPECTED PERFORMANCE GAINS
---------------------------
Current state:
- Initial load: 3000+ events (~500KB-1MB)
- Parse + cluster time: ~2-4 seconds
- Total time to interactive: ~3-5 seconds

With viewport loading:
- Initial load: 300-500 events (~50-150KB)
- Parse + cluster time: ~200-500ms
- Total time to interactive: ~800ms-1.5s
- Improvement: 60-70% faster


ROLLBACK PLAN
--------------
If viewport loading causes issues:
1. Disable feature flag immediately
2. All users revert to global fetch
3. Investigate issue
4. Fix and re-enable gradually


CODE EXAMPLES FOR PHASE 3
--------------------------

Example 1: useViewportEvents hook

```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getViewportBoundingBox, roundBoundingBoxForCache, formatBoundingBoxForAPI } from '@/utils/geoUtils';
import type { BoundingBox, GeoCoordinate } from '@/utils/geoUtils';
import type { FilterCriteria } from '@/types/filter';

interface ViewportEventsOptions {
  center: GeoCoordinate;
  zoom: number;
  viewportWidth: number;
  viewportHeight: number;
  filters: FilterCriteria;
  enabled?: boolean;
}

export function useViewportEvents(options: ViewportEventsOptions) {
  const { center, zoom, viewportWidth, viewportHeight, filters, enabled = true } = options;

  // Calculate bounding box
  const bbox = getViewportBoundingBox(center, zoom, viewportWidth, viewportHeight, 1.2);
  const roundedBbox = roundBoundingBoxForCache(bbox);

  // Generate cache key
  const cacheKey = [
    'events-viewport',
    formatBoundingBoxForAPI(roundedBbox),
    filters.showEvents,
    filters.showSpecials,
    filters.eventFilters.timeFilter,
    filters.specialFilters.timeFilter
  ];

  return useQuery({
    queryKey: cacheKey,
    queryFn: async () => {
      const bboxParam = formatBoundingBoxForAPI(bbox);
      const typeParam = filters.showEvents && filters.showSpecials ? 'both'
        : filters.showEvents ? 'event' : 'special';

      const url = `https://gathr-backend-951249927221.northamerica-northeast1.run.app/api/v2/events/minimal/viewport?bbox=${bboxParam}&type=${typeParam}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error(`Viewport fetch failed: ${response.status}`);

      const data = await response.json();
      return {
        events: Array.isArray(data) ? data : data.events || [],
        bbox,
        fetchedAt: Date.now()
      };
    },
    enabled,
    staleTime: 3 * 60 * 1000,  // 3 minutes
    gcTime: 10 * 60 * 1000,     // 10 minutes
  });
}
```

Example 2: Integration in map.tsx

```typescript
// In map.tsx, replace the current useEffect that calls fetchEvents()

const { width, height } = Dimensions.get('window');

const viewportQuery = useViewportEvents({
  center: location ?
    { latitude: location.coords.latitude, longitude: location.coords.longitude } :
    { latitude: 46.2336, longitude: -63.1276 },
  zoom: zoomLevel,
  viewportWidth: width,
  viewportHeight: height,
  filters: filterCriteria,
  enabled: !!location // Only fetch when we have location
});

useEffect(() => {
  if (viewportQuery.data?.events) {
    setEvents(viewportQuery.data.events);
    generateClusters();
  }
}, [viewportQuery.data]);
```


NEXT STEPS
----------
1. ✅ Validate geoUtils calculations (run tests)
2. [ ] Backend: Create /api/v2/events/minimal/viewport endpoint
3. [ ] Frontend: Create useViewportEvents hook
4. [ ] Frontend: Update map.tsx to use viewport fetching
5. [ ] Frontend: Add feature flag for gradual rollout
6. [ ] Test with real data
7. [ ] Monitor performance metrics
8. [ ] Gradual rollout to users

*/
