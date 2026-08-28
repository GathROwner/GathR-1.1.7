const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export interface TutorialShimmerGeometry {
  bandWidth: number;
  overscan: number;
  travelEnd: number;
  travelStart: number;
}

/**
 * Sizes the reflective sweep from the highlighted surface itself. The extra
 * travel keeps the rotated band completely outside the clip at rest, so each
 * pass visibly crosses the entire selection instead of appearing at an edge.
 */
export const getTutorialShimmerGeometry = (
  width: number,
  height: number,
): TutorialShimmerGeometry => {
  const safeWidth = Math.max(0, width);
  const safeHeight = Math.max(0, height);
  const bandWidth = clamp(safeWidth * 0.22, 58, 112);
  const overscan = clamp(safeHeight * 0.18, 18, 48);
  const travelPadding = bandWidth + overscan;

  return {
    bandWidth,
    overscan,
    travelStart: -travelPadding,
    travelEnd: safeWidth + travelPadding,
  };
};
