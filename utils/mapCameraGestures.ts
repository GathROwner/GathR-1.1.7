/**
 * RNMapbox v10 reports active gestures on `state.gestures.isGestureActive`.
 * Older region callbacks used fields under `properties`, so retain those as
 * fallbacks for installed binaries and tests that still emit the legacy shape.
 */
export const isMapCameraGestureActive = (event: unknown): boolean => {
  const state = event && typeof event === 'object' ? event as Record<string, any> : {};
  const properties = state.properties && typeof state.properties === 'object'
    ? state.properties
    : state;

  return Boolean(
    state.gestures?.isGestureActive ??
    properties.gesture ??
    properties.isUserInteraction
  );
};

