import { ComponentMeasurement } from '../types/tutorial';

export const TUTORIAL_CLUSTER_SPOTLIGHT_SIZE = 72;

const getClusterCoreOffsetY = (platform: string): number =>
  platform === 'android' ? 32 : platform === 'ios' ? 5 : 0;

/**
 * Mapbox projects the marker coordinate, while the visible/tappable core sits
 * lower inside GathR's bottom-anchored story marker. Keep the aperture on that
 * core without reintroducing the old horizontal drift.
 */
export const getTutorialClusterSpotlightMeasurement = (
  point: readonly [number, number],
  mapOrigin: { x: number; y: number },
  platform: string,
): ComponentMeasurement => {
  const centerX = mapOrigin.x + point[0];
  const centerY = mapOrigin.y + point[1] + getClusterCoreOffsetY(platform);

  return {
    x: centerX - TUTORIAL_CLUSTER_SPOTLIGHT_SIZE / 2,
    y: centerY - TUTORIAL_CLUSTER_SPOTLIGHT_SIZE / 2,
    width: TUTORIAL_CLUSTER_SPOTLIGHT_SIZE,
    height: TUTORIAL_CLUSTER_SPOTLIGHT_SIZE,
  };
};
