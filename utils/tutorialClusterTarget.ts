import type { Cluster, Venue } from '../types/events';

export interface TutorialClusterBinding {
  clusterId: string | null;
  revision: number;
}

export const getTutorialClusterAnchorVenueKey = (cluster: Cluster): string | null => {
  const candidates = cluster.venues.filter((venue) =>
    typeof venue.locationKey === 'string' &&
    venue.locationKey.length > 0 &&
    Number.isFinite(venue.latitude) &&
    Number.isFinite(venue.longitude)
  );
  if (candidates.length === 0) return null;

  const centroid = candidates.reduce(
    (total, venue) => ({
      latitude: total.latitude + venue.latitude,
      longitude: total.longitude + venue.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  centroid.latitude /= candidates.length;
  centroid.longitude /= candidates.length;

  return [...candidates].sort((left, right) => {
    const leftDistance =
      (left.latitude - centroid.latitude) ** 2 +
      (left.longitude - centroid.longitude) ** 2;
    const rightDistance =
      (right.latitude - centroid.latitude) ** 2 +
      (right.longitude - centroid.longitude) ** 2;
    return leftDistance - rightDistance || left.locationKey.localeCompare(right.locationKey);
  })[0].locationKey;
};

export const getTutorialClusterBindingSignature = (cluster: Cluster): string => JSON.stringify([
  String(cluster.id),
  cluster.clusterType,
  cluster.interestLevel,
  cluster.venues
    .map((venue) => [
      venue.locationKey,
      venue.latitude,
      venue.longitude,
    ])
    .sort(([leftKey], [rightKey]) => String(leftKey).localeCompare(String(rightKey))),
]);

export const isTutorialClusterBindingCurrent = (
  captured: TutorialClusterBinding,
  current: TutorialClusterBinding,
): boolean => Boolean(
  captured.clusterId &&
  captured.clusterId === current.clusterId &&
  captured.revision === current.revision
);

export const isTutorialClusterCalloutTarget = (cluster: Cluster): boolean => {
  if (!Array.isArray(cluster.venues) || cluster.venues.length === 0) return false;
  if ((cluster.eventCount ?? 0) + (cluster.specialCount ?? 0) <= 0) return false;
  if (cluster.containsCityLevelEvent && cluster.venues.length === 1) return false;

  return cluster.venues.every((venue) =>
    Number.isFinite(venue.latitude) && Number.isFinite(venue.longitude)
  );
};

/**
 * A zoom or late data refresh can regroup venues into a new cluster ID. Resolve
 * through one stable member venue so the spotlight, direct tap, and button all
 * keep addressing the marker that is currently rendered.
 */
export const resolveTutorialClusterTarget = (
  clusters: readonly Cluster[],
  anchorVenueKey: string | null,
  requestedClusterId?: string | null,
): Cluster | null => {
  if (anchorVenueKey) {
    const anchored = clusters.find((cluster) =>
      cluster.venues.some((venue) => venue.locationKey === anchorVenueKey)
    );
    return anchored && isTutorialClusterCalloutTarget(anchored) ? anchored : null;
  }

  if (requestedClusterId) {
    const current = clusters.find((cluster) => String(cluster.id) === requestedClusterId);
    return current && isTutorialClusterCalloutTarget(current) ? current : null;
  }

  return null;
};

export const appendTutorialClusterTarget = (
  renderedClusters: readonly Cluster[],
  target: Cluster | null,
): Cluster[] => {
  if (!target) {
    return [...renderedClusters];
  }

  const existingIndex = renderedClusters.findIndex((cluster) => cluster.id === target.id);
  if (existingIndex === -1) return [...renderedClusters, target];

  const withCurrentTarget = [...renderedClusters];
  withCurrentTarget[existingIndex] = target;
  return withCurrentTarget;
};

export const doesTutorialCalloutMatchAnchor = (
  selectedVenues: readonly Pick<Venue, 'locationKey'>[],
  anchorVenueKey: string | null,
): boolean => Boolean(
  anchorVenueKey &&
  selectedVenues.some((venue) => venue.locationKey === anchorVenueKey)
);

export const didTutorialClusterOpen = (
  interactionStarted: boolean,
  selectedVenues: readonly Pick<Venue, 'locationKey'>[],
  anchorVenueKey: string | null,
  capturedBinding: TutorialClusterBinding,
  currentBinding: TutorialClusterBinding,
): boolean => Boolean(
  interactionStarted &&
  isTutorialClusterBindingCurrent(capturedBinding, currentBinding) &&
  doesTutorialCalloutMatchAnchor(selectedVenues, anchorVenueKey)
);
