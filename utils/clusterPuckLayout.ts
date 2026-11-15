export type MapPoint = readonly [number, number];
export type MapRect = { left: number; top: number; right: number; bottom: number };
export type PuckDisplacement = { anchor: [number, number]; coordinate: [number, number]; compact?: boolean };
export type MarkerGeometry = { bounds: MapRect; compactBounds?: MapRect; dock: [number, number] };
export type PuckSnapshot = { coordinate: [number, number]; bounds: MapRect; revision: number; validUntil?: number };
export type PuckLocationSample = { timestamp: number; coords: { longitude: number; latitude: number; accuracy?: number | null } };
export const PUCK_SAMPLE_MAX_AGE_MS = 30000;
export const PUCK_CLEARANCE_GAP = 4;
export const MAX_PUCK_DISPLACEMENT = 56;

export const rectsOverlap = (a: MapRect, b: MapRect): boolean =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
export const translateRect = (r: MapRect, [x, y]: MapPoint): MapRect => ({
  left: r.left + x, right: r.right + x, top: r.top + y, bottom: r.bottom + y,
});
const validRect = (r: MapRect): boolean => Object.values(r).every(Number.isFinite) && r.right > r.left && r.bottom > r.top;
export const canPlaceRect = (r: MapRect, puck: MapRect, viewport: MapRect, occupied: readonly MapRect[]) =>
  validRect(r) && r.left >= viewport.left && r.right <= viewport.right && r.top >= viewport.top && r.bottom <= viewport.bottom &&
  !rectsOverlap(r, { left: puck.left - PUCK_CLEARANCE_GAP, right: puck.right + PUCK_CLEARANCE_GAP, top: puck.top - PUCK_CLEARANCE_GAP, bottom: puck.bottom + PUCK_CLEARANCE_GAP }) && !occupied.some(other => rectsOverlap(r, other));

/** Existing Expo sample is a conservative proxy, not an exact native-puck observation.
 * Only overview views with <=4pt reported uncertainty are eligible. Accuracy halo is excluded.
 */
export function getConservativePuckSnapshot(sample: PuckLocationSample | null, zoom: number, now = Date.now()): PuckSnapshot | null {
  if (!sample || !Number.isFinite(zoom) || zoom > 13.5) return null;
  const { longitude, latitude, accuracy } = sample.coords;
  const age = now - sample.timestamp;
  if (![longitude, latitude, sample.timestamp].every(Number.isFinite) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180 || age < -1000 || age >= PUCK_SAMPLE_MAX_AGE_MS || accuracy == null || !Number.isFinite(accuracy) || accuracy < 0) return null;
  const pointsUncertainty = accuracy / (78271.51696 * Math.cos(latitude * Math.PI / 180) / 2 ** zoom);
  if (pointsUncertainty > 4) return null;
  const radius = 14 + pointsUncertainty;
  return { coordinate: [longitude, latitude], bounds: { left: -radius, right: radius, top: -radius, bottom: radius }, revision: sample.timestamp, validUntil: sample.timestamp + PUCK_SAMPLE_MAX_AGE_MS };
}

/** Minimum separating translation in map-view points, never a geographic jump.
 * Bounds are measured visible content; hit slop and the accuracy halo are excluded.
 * null means no current overlap OR no bounded safe placement, never a distant fallback.
 */
export function getClusterPuckTranslation(
  marker: MapRect, puck: MapRect, viewport: MapRect,
  occupied: readonly MapRect[] = [], maxDistance = MAX_PUCK_DISPLACEMENT, originOffset: MapPoint = [0, 0], requireOverlap = true,
): [number, number] | null {
  if (![marker, puck, viewport].every(validRect) || !Number.isFinite(maxDistance) || maxDistance <= 0 || (requireOverlap && !rectsOverlap(marker, puck))) return null;
  const gap = PUCK_CLEARANCE_GAP;
  const minX = viewport.left - marker.left, maxX = viewport.right - marker.right;
  const minY = viewport.top - marker.top, maxY = viewport.bottom - marker.bottom;
  if (minX > maxX || minY > maxY) return null;
  const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
  const candidates: [number, number][] = [
    [puck.left - gap - marker.right, clamp(0, minY, maxY)],
    [puck.right + gap - marker.left, clamp(0, minY, maxY)],
    [clamp(0, minX, maxX), puck.top - gap - marker.bottom],
    [clamp(0, minX, maxX), puck.bottom + gap - marker.top],
  ];
  if (!requireOverlap) candidates.push([clamp(0, minX, maxX), clamp(0, minY, maxY)]);
  return candidates.filter(delta => {
    const next = translateRect(marker, delta);
    return Math.hypot(delta[0] + originOffset[0], delta[1] + originOffset[1]) <= maxDistance && canPlaceRect(next, puck, viewport, occupied);
  }).sort((a, b) => Math.hypot(...a) - Math.hypot(...b))[0] ?? null;
}
