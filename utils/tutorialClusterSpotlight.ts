import { ComponentMeasurement } from '../types/tutorial';

export const TUTORIAL_CLUSTER_SPOTLIGHT_SIZE = 72;

export interface TutorialClusterLocalGeometry {
  wrapper: ComponentMeasurement;
  core: ComponentMeasurement;
}

interface ViewportSize {
  width: number;
  height: number;
}

const isPositiveFiniteFrame = (frame: ComponentMeasurement): boolean =>
  [frame.x, frame.y, frame.width, frame.height].every(Number.isFinite) &&
  frame.width > 0 &&
  frame.height > 0;

const getSpotlightAroundCenter = (centerX: number, centerY: number): ComponentMeasurement => ({
  x: centerX - TUTORIAL_CLUSTER_SPOTLIGHT_SIZE / 2,
  y: centerY - TUTORIAL_CLUSTER_SPOTLIGHT_SIZE / 2,
  width: TUTORIAL_CLUSTER_SPOTLIGHT_SIZE,
  height: TUTORIAL_CLUSTER_SPOTLIGHT_SIZE,
});

export const isPointInsideTutorialSpotlightCircle = (
  point: { x: number; y: number },
  bounds: { width: number; height: number },
): boolean => {
  if (
    ![point.x, point.y, bounds.width, bounds.height].every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    return false;
  }

  const radius = Math.min(bounds.width, bounds.height) / 2;
  return Math.hypot(
    point.x - bounds.width / 2,
    point.y - bounds.height / 2,
  ) <= radius;
};

/**
 * MarkerView anchors the complete React child, not the circular cluster core.
 * When the marker grows a category story or count rail, this local layout is
 * the deterministic bridge from the geographic anchor to the visible core.
 */
export const getTutorialClusterLocalCoreOffset = (
  geometry?: TutorialClusterLocalGeometry | null,
): { x: number; y: number } | null => {
  if (
    !geometry ||
    !isPositiveFiniteFrame(geometry.wrapper) ||
    !isPositiveFiniteFrame(geometry.core)
  ) {
    return null;
  }

  return {
    x: geometry.core.x + geometry.core.width / 2 - geometry.wrapper.width / 2,
    y: geometry.core.y + geometry.core.height / 2 - geometry.wrapper.height,
  };
};

/**
 * Reject MarkerView host-surface measurements and stale/zero frames before
 * they can move the tutorial aperture away from the projected map anchor.
 */
export const isTutorialClusterCoreFrameUsable = (
  frame: ComponentMeasurement,
  projectedCenter: { x: number; y: number },
  viewport: ViewportSize,
  localGeometry: TutorialClusterLocalGeometry | null,
): boolean => {
  if (!isPositiveFiniteFrame(frame)) return false;
  const localOffset = getTutorialClusterLocalCoreOffset(localGeometry);
  if (!localOffset || !localGeometry) return false;
  if (
    Math.abs(frame.width - localGeometry.core.width) > 2 ||
    Math.abs(frame.height - localGeometry.core.height) > 2
  ) {
    return false;
  }

  const centerX = frame.x + frame.width / 2;
  const centerY = frame.y + frame.height / 2;
  const expectedCenterX = projectedCenter.x + localOffset.x;
  const expectedCenterY = projectedCenter.y + localOffset.y;
  const expectedCenterDistance = Math.hypot(
    centerX - expectedCenterX,
    centerY - expectedCenterY,
  );

  return (
    centerX >= 0 &&
    centerX <= viewport.width &&
    centerY >= 0 &&
    centerY <= viewport.height &&
    expectedCenterDistance <= 2
  );
};

export const getTutorialClusterSpotlightFromCoreFrame = (
  frame: ComponentMeasurement,
): ComponentMeasurement => getSpotlightAroundCenter(
  frame.x + frame.width / 2,
  frame.y + frame.height / 2,
);

/** Use current marker-local geometry only; never invent a platform offset. */
export const getTutorialClusterSpotlightMeasurement = (
  point: readonly [number, number],
  mapOrigin: { x: number; y: number },
  localGeometry: TutorialClusterLocalGeometry | null,
): ComponentMeasurement | null => {
  const localOffset = getTutorialClusterLocalCoreOffset(localGeometry);
  if (!localOffset) return null;

  const centerX = mapOrigin.x + point[0] + localOffset.x;
  const centerY = mapOrigin.y + point[1] + localOffset.y;

  return getSpotlightAroundCenter(centerX, centerY);
};
