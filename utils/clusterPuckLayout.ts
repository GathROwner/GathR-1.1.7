export type MapPoint = readonly [number, number];
export type PuckDisplacement = { anchor: [number, number]; coordinate: [number, number] };

/** Marker is bottom-anchored. Reserve its count/story frame plus a 24dp puck. */
export function clusterOverlapsPuck(marker: MapPoint, puck: MapPoint): boolean {
  return Math.abs(marker[0] - puck[0]) < 94 && puck[1] > marker[1] - 174 && puck[1] < marker[1] + 36;
}

/** Choose a screen-space position; never move the geographic source or user puck. */
export function getClusterPuckDisplayPoint(
  marker: MapPoint, puck: MapPoint, width: number, height: number, occupied: readonly MapPoint[] = [],
): [number, number] | null {
  if (![...marker, ...puck, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  if (!clusterOverlapsPuck(marker, puck)) return null;
  const directions = marker[0] < width / 2 ? [118, -118] : [-118, 118];
  const candidates: [number, number][] = [
    ...directions.map(x => [marker[0] + x, marker[1] - 24] as [number, number]),
    [marker[0], puck[1] - 64], [marker[0], puck[1] + 204],
  ];
  // Keep targets away from the top pills, right interest rail and bottom dock.
  return candidates.find(p => p[0] >= 76 && p[0] <= width - 96 && p[1] >= 190 && p[1] <= height - 110 &&
    !clusterOverlapsPuck(p, puck) && !occupied.some(q => Math.abs(p[0] - q[0]) < 110 && Math.abs(p[1] - q[1]) < 120)) ??
    // Very small viewports may have no empty lane. Keep the count above the dot.
    candidates.find(p => p[0] >= 60 && p[0] <= width - 60 && p[1] >= 150 && p[1] <= height - 80 && !clusterOverlapsPuck(p, puck)) ?? null;
}
