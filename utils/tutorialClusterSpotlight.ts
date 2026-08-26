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

const MAX_NATIVE_CORE_ALIGNMENT_DRIFT = 18;

interface NativeCoreFrameOptions {
  allowAndroidVerticalAnchorVariant?: boolean;
  allowFreshBoundFrameWithoutGeometry?: boolean;
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
 * A freshly bound native core ref is the most accurate source of truth for the
 * visible marker. Validate it against the small set of anchor geometries the
 * native MarkerView can legitimately use; a broad radius can admit a stale
 * same-ID marker after its coordinate changes.
 */
export const isTutorialClusterCoreFrameUsable = (
  frame: ComponentMeasurement,
  projectedCenter: { x: number; y: number },
  viewport: ViewportSize,
  localGeometry: TutorialClusterLocalGeometry | null,
  options: NativeCoreFrameOptions = {},
): boolean => {
  if (!isPositiveFiniteFrame(frame)) return false;
  if (localGeometry && (
    Math.abs(frame.width - localGeometry.core.width) > 2 ||
    Math.abs(frame.height - localGeometry.core.height) > 2
  )) {
    return false;
  }

  if (!localGeometry) {
    const plausibleCoreSize =
      frame.width <= TUTORIAL_CLUSTER_SPOTLIGHT_SIZE + 24 &&
      frame.height <= TUTORIAL_CLUSTER_SPOTLIGHT_SIZE + 24;
    return Boolean(
      options.allowFreshBoundFrameWithoutGeometry &&
      plausibleCoreSize &&
      frame.x >= 0 &&
      frame.y >= 0 &&
      frame.x + frame.width <= viewport.width &&
      frame.y + frame.height <= viewport.height
    );
  }

  const centerX = frame.x + frame.width / 2;
  const centerY = frame.y + frame.height / 2;
  const localOffset = getTutorialClusterLocalCoreOffset(localGeometry);
  const expectedCenters = localOffset
    ? [
        {
          x: projectedCenter.x + localOffset.x,
          y: projectedCenter.y + localOffset.y,
        },
        ...(options.allowAndroidVerticalAnchorVariant
          ? [{
              x: projectedCenter.x + localOffset.x,
              y: projectedCenter.y,
            }]
          : []),
      ]
    : [];
  if (expectedCenters.length === 0) return false;
  const alignmentDistance = Math.min(...expectedCenters.map((expected) => Math.hypot(
    centerX - expected.x,
    centerY - expected.y,
  )));

  return (
    centerX >= 0 &&
    centerX <= viewport.width &&
    centerY >= 0 &&
    centerY <= viewport.height &&
    alignmentDistance <= MAX_NATIVE_CORE_ALIGNMENT_DRIFT
  );
};

export const isTutorialClusterProjectionCentered = (
  point: readonly [number, number],
  viewport: ViewportSize,
  tolerance = 12,
): boolean => (
  point.length === 2 &&
  [point[0], point[1], viewport.width, viewport.height, tolerance].every(Number.isFinite) &&
  viewport.width > 0 &&
  viewport.height > 0 &&
  tolerance >= 0 &&
  Math.abs(point[0] - viewport.width / 2) <= tolerance &&
  Math.abs(point[1] - viewport.height / 2) <= tolerance
);

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
