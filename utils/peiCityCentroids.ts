import type { Event } from '../types/events';
import { isScopedLocationEvent } from './locationScope';

/**
 * Client-side fallback centroids for PEI cities/areas, mirroring the backend
 * table (gathr-apps-script functions/src/services/peiLocations.ts). New
 * city-level events are published with coordinates already stamped; this
 * fallback places legacy coordinate-less events so they still reach the map
 * without a backend backfill. Keep the two tables in sync.
 */
const PEI_CITY_CENTROIDS: Record<string, { latitude: number; longitude: number }> = {
  charlottetown: { latitude: 46.2382, longitude: -63.1311 },
  'downtown charlottetown': { latitude: 46.2343, longitude: -63.1258 },
  summerside: { latitude: 46.3959, longitude: -63.7876 },
  stratford: { latitude: 46.217, longitude: -63.0887 },
  cornwall: { latitude: 46.2251, longitude: -63.2192 },
  montague: { latitude: 46.1653, longitude: -62.6486 },
  kensington: { latitude: 46.4363, longitude: -63.6472 },
  souris: { latitude: 46.3559, longitude: -62.2515 },
  alberton: { latitude: 46.8128, longitude: -64.0659 },
  georgetown: { latitude: 46.1866, longitude: -62.5323 },
  'north rustico': { latitude: 46.4499, longitude: -63.2873 },
  rustico: { latitude: 46.429, longitude: -63.301 },
  cavendish: { latitude: 46.4879, longitude: -63.3843 },
};

const normalizePlaceName = (value: unknown): string =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\bcanada\b/g, ' ')
    .replace(/\bprince edward island\b/g, ' pei ')
    .replace(/\bp\.?\s*e\.?\s*i\.?\b/g, ' pei ')
    .replace(/[.,;:'’]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(pei|pe)$/g, '')
    .trim();

export const resolvePeiCityCentroid = (details: {
  locationScope?: Event['locationScope'] | null;
  locationCity?: string | null;
  locationLabel?: string | null;
}): { latitude: number; longitude: number } | null => {
  // Province coverage has no representative physical point. Its discovery
  // path is handled explicitly by the viewport partition.
  if (details.locationScope === 'province') {
    return null;
  }
  const rawCandidates = details.locationScope === 'area'
    ? [details.locationLabel, details.locationCity]
    : [details.locationCity, details.locationLabel];
  for (const candidate of rawCandidates) {
    const normalized = normalizePlaceName(candidate);
    if (!normalized) continue;
    if (normalized === 'pei') continue;
    const match = PEI_CITY_CENTROIDS[normalized];
    if (match) return match;
  }
  return null;
};

const hasUsableCoordinates = (event: Event): boolean => {
  const lat = Number(event.latitude);
  const lng = Number(event.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
};

/**
 * Fill missing coordinates on a scoped-location event from the centroid
 * table. Non-scoped events and events that already carry coordinates pass
 * through untouched.
 */
export const applyCityCentroidFallback = (event: Event): Event => {
  if (hasUsableCoordinates(event) || !isScopedLocationEvent(event)) {
    return event;
  }
  const centroid = resolvePeiCityCentroid({
    locationScope: event.locationScope,
    locationCity: event.locationCity,
    locationLabel: event.locationLabel,
  });
  if (!centroid) return event;
  return { ...event, latitude: centroid.latitude, longitude: centroid.longitude };
};
