/** A local camera fingerprint using supported RNMapbox projection APIs only.
 * Coordinates never enter diagnostic records. Four non-collinear points also
 * detect zoom, bearing and pitch changes around an otherwise stationary center.
 */
export type ProjectionMap = {
  getPointInView: (coordinate: number[]) => Promise<number[]>;
  getCoordinateFromView: (point: number[]) => Promise<number[]>;
};
export type CameraProjection = { width: number; height: number; screen: number[][]; coordinates: number[][] };
const finitePoint = (p: number[]) => Array.isArray(p) && p.length >= 2 && p.slice(0, 2).every(Number.isFinite);
export async function sampleCameraProjection(map: ProjectionMap, width: number, height: number): Promise<CameraProjection> {
  const screen = [[.25, .25], [.75, .25], [.25, .75], [.75, .75]].map(([x, y]) => [x * width, y * height]);
  const coordinates = await Promise.all(screen.map(p => map.getCoordinateFromView(p)));
  if (!coordinates.every(finitePoint)) throw new Error('Invalid camera projection');
  return { width, height, screen, coordinates: coordinates.map(p => p.slice(0, 2)) };
}
export async function matchesCameraProjection(map: ProjectionMap, proof: CameraProjection, width: number, height: number): Promise<boolean> {
  if (width !== proof.width || height !== proof.height) return false;
  const projected = await Promise.all(proof.coordinates.map(c => map.getPointInView(c)));
  // A quarter logical point permits numerical round-off, below a physical pixel
  // on the supported 1x/2x/3x devices. This is not a camera movement debounce.
  return projected.every((p, i) => finitePoint(p) && Math.hypot(p[0] - proof.screen[i][0], p[1] - proof.screen[i][1]) <= .25);
}
