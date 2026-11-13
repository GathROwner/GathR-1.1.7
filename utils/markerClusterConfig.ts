export type MarkerClusterProfile = 'default' | 'hybrid';

/** Mapbox uses a 512-point world tile; Supercluster radius is expressed in its configured extent.
 * Hybrid's full photo/summary footprint needs more room than the compact Current markers.
 * This changes the existing cached index, without a screen-layout or idle-repositioning pass.
 */
export function markerClusterConfig(profile: MarkerClusterProfile, radius: number, extent: number, maxZoom: number) {
  return profile === 'hybrid'
    ? { radius: 160 * extent / 512, extent, maxZoom: Math.max(20, maxZoom) }
    : { radius, extent, maxZoom };
}
