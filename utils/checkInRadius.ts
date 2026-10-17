import type { Cluster, Venue } from '../types/events';
import type { OwnCheckIn } from '../types/social';

export const CHECK_IN_RADIUS_METRES = 50;

export interface CheckInRadiusCenter {
  latitude: number;
  longitude: number;
}

type CheckInAnchor = Pick<OwnCheckIn, 'latitude' | 'longitude' | 'locationType' | 'venueLocationKey'>;

function isValidCenter(value: { latitude?: number | null; longitude?: number | null } | null | undefined): value is CheckInRadiusCenter {
  return Boolean(value
    && typeof value.latitude === 'number'
    && typeof value.longitude === 'number'
    && Number.isFinite(value.latitude)
    && Number.isFinite(value.longitude)
    && value.latitude >= -90
    && value.latitude <= 90
    && value.longitude >= -180
    && value.longitude <= 180);
}

export function resolveCheckInRadiusCenter(
  checkIn: CheckInAnchor | null | undefined,
  readinessAnchor: CheckInRadiusCenter | null | undefined,
  selectedVenues: readonly Venue[] = [],
  clusters: readonly Cluster[] = []
): CheckInRadiusCenter | null {
  if (!checkIn) return null;
  if (isValidCenter(readinessAnchor)) return readinessAnchor;

  const savedCheckInCenter = { latitude: checkIn.latitude, longitude: checkIn.longitude };
  if (isValidCenter(savedCheckInCenter)) return savedCheckInCenter;
  if (checkIn.locationType !== 'gathr_venue') return null;

  const selectedVenue = selectedVenues.find((venue) => venue.locationKey === checkIn.venueLocationKey);
  if (selectedVenue && isValidCenter(selectedVenue)) return selectedVenue;

  for (const cluster of clusters) {
    const venue = cluster.venues.find((candidate) => candidate.locationKey === checkIn.venueLocationKey);
    if (venue && isValidCenter(venue)) return venue;
  }

  return null;
}

export function createCheckInRadiusPolygon(
  center: CheckInRadiusCenter,
  radiusMetres = CHECK_IN_RADIUS_METRES
) {
  if (!isValidCenter(center) || !Number.isFinite(radiusMetres) || radiusMetres <= 0) return null;

  const earthRadiusMetres = 6_371_008.8;
  const angularRadius = radiusMetres / earthRadiusMetres;
  const latitude1 = center.latitude * Math.PI / 180;
  const longitude1 = center.longitude * Math.PI / 180;
  const ring: [number, number][] = [];

  for (let step = 0; step <= 64; step += 1) {
    const bearing = 2 * Math.PI * step / 64;
    const latitude2 = Math.asin(
      Math.sin(latitude1) * Math.cos(angularRadius)
        + Math.cos(latitude1) * Math.sin(angularRadius) * Math.cos(bearing)
    );
    const longitude2 = longitude1 + Math.atan2(
      Math.sin(bearing) * Math.sin(angularRadius) * Math.cos(latitude1),
      Math.cos(angularRadius) - Math.sin(latitude1) * Math.sin(latitude2)
    );
    const longitude = ((longitude2 * 180 / Math.PI + 540) % 360) - 180;
    ring.push([longitude, latitude2 * 180 / Math.PI]);
  }

  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'Polygon' as const,
      coordinates: [ring],
    },
  };
}
