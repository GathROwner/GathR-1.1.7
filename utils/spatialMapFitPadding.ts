export type SpatialMapFitPadding = [number, number, number, number];

// Mapbox fitBounds uses [top, right, bottom, left]. Route and area events
// share the same right-side control rail, so both experiences must reserve the
// same horizontal safe area for their easternmost point.
export const ROUTE_MAP_FIT_PADDING: SpatialMapFitPadding = [72, 112, 190, 48];
export const AREA_LOCATION_MAP_FIT_PADDING: SpatialMapFitPadding = [72, 112, 190, 48];

