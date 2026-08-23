import { isMapCameraGestureActive } from '../mapCameraGestures';

describe('isMapCameraGestureActive', () => {
  it('recognizes the RNMapbox v10 camera-state gesture shape used on iOS', () => {
    expect(isMapCameraGestureActive({
      properties: { center: [-64.0772, 46.8114], zoom: 8 },
      gestures: { isGestureActive: true },
    })).toBe(true);
  });

  it('retains legacy camera callback fallbacks', () => {
    expect(isMapCameraGestureActive({ properties: { gesture: true } })).toBe(true);
    expect(isMapCameraGestureActive({ properties: { isUserInteraction: true } })).toBe(true);
  });

  it('does not treat a programmatic camera update as a gesture', () => {
    expect(isMapCameraGestureActive({
      properties: { center: [-63.1, 46.25], zoom: 12 },
      gestures: { isGestureActive: false },
    })).toBe(false);
  });
});

