import type {
  Event,
  EventAreaLocation,
  RouteCoordinate,
} from '../types/events';
import type { RouteFeatureCalloutData } from './routeEvent';
import { toFirestoreEventId } from './firestoreEventIds';
import { getEventDateKey, isEventPast } from './eventExpiry';
import { getEventScheduleStartLocalScalar, isEventDefaultMapEligible } from './eventTiming';

type AreaLocationFeature = {
  type: 'Feature';
  properties: {
    id: string;
    label: string;
    certainty: EventAreaLocation['certainty'];
    locationCount: number;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
};

const isValidCoordinate = (coordinate: unknown): coordinate is RouteCoordinate =>
  Boolean(
    coordinate &&
      typeof coordinate === 'object' &&
      Number.isFinite((coordinate as RouteCoordinate).longitude) &&
      Number.isFinite((coordinate as RouteCoordinate).latitude) &&
      (coordinate as RouteCoordinate).longitude >= -180 &&
      (coordinate as RouteCoordinate).longitude <= 180 &&
      (coordinate as RouteCoordinate).latitude >= -90 &&
      (coordinate as RouteCoordinate).latitude <= 90
  );

const cleanOptionalText = (value: unknown): string | undefined => {
  const text = String(value || '').trim();
  return text || undefined;
};

export const getAreaLocations = (event: Event): EventAreaLocation[] =>
  (event.areaData?.locations || []).filter(
    (location) =>
      !!location &&
      typeof location.id === 'string' &&
      typeof location.label === 'string' &&
      (location.certainty === 'confirmed' || location.certainty === 'approximate') &&
      isValidCoordinate(location.coordinates)
  );

export const hasDrawableAreaLocations = (event: Event): boolean =>
  event.locationScope === 'area' && getAreaLocations(event).length > 0;

export const buildAreaLocationFeatureCollection = (event: Event) => ({
  type: 'FeatureCollection' as const,
  features: getAreaLocationGroups(event).map<AreaLocationFeature>((group) => ({
    type: 'Feature',
    properties: {
      id: group.id,
      label: group.locations.length > 1 ? `${group.locations.length} venues` : group.locations[0].label,
      certainty: group.locations.some((location) => location.certainty === 'confirmed') ? 'confirmed' : 'approximate',
      locationCount: group.locations.length,
    },
    geometry: {
      type: 'Point',
      coordinates: [group.coordinates.longitude, group.coordinates.latitude],
    },
  })),
});

export type AreaLocationGroup = { id: string; coordinates: RouteCoordinate; locations: EventAreaLocation[] };

/** Shared coordinates are one selectable marker, never invented pin offsets. */
export const getAreaLocationGroups = (event: Event): AreaLocationGroup[] => {
  const groups = new Map<string, EventAreaLocation[]>();
  for (const location of getAreaLocations(event)) {
    const key = `${location.coordinates.longitude},${location.coordinates.latitude}`;
    const group = groups.get(key) ?? [];
    group.push(location);
    groups.set(key, group);
  }
  return [...groups.values()].map((locations) => ({
    id: locations.map((location) => location.id).sort()[0],
    coordinates: locations[0].coordinates,
    locations,
  }));
};

export const getAreaLinkedEventIds = (location: EventAreaLocation): string[] => {
  if (location.certainty !== 'confirmed' || !location.venueId?.trim() || !Array.isArray(location.linkedEventIds)) return [];
  return [...new Set(location.linkedEventIds.filter((id) => typeof id === 'string' && id.trim())
    .map(toFirestoreEventId))].filter(Boolean);
};

export const getAreaLocationGroupForFeature = (event: Event, featureId: string): AreaLocationGroup | null =>
  getAreaLocationGroups(event).find((group) => group.id === featureId) ?? null;

/** Native hitboxes may return several features in drawing order, not tap distance. */
export const getAreaLocationGroupForPress = (event: Event, press: {
  features?: { properties?: { id?: unknown } | null }[];
  coordinates?: RouteCoordinate;
}): AreaLocationGroup | null => {
  const ids = new Set((press.features || []).map((feature) => String(feature.properties?.id || '')));
  const candidates = getAreaLocationGroups(event).filter((group) => ids.has(group.id));
  const point = press.coordinates;
  if (!isValidCoordinate(point)) return candidates[0] ?? null;
  const longitudeScale = Math.cos(point.latitude * Math.PI / 180);
  const distance = (group: AreaLocationGroup) =>
    ((group.coordinates.longitude - point.longitude) * longitudeScale) ** 2
    + (group.coordinates.latitude - point.latitude) ** 2;
  return candidates.sort((a, b) => distance(a) - distance(b))[0] ?? null;
};

/** No venue/date searches or recurrence substitution: links are explicit membership. */
export const getAvailableAreaLinkedEvents = (umbrella: Event, location: EventAreaLocation, records: Event[], now = new Date()): Event[] => {
  const ids = new Set(getAreaLinkedEventIds(location));
  const start = getEventDateKey(umbrella.startDate);
  const end = getEventDateKey(umbrella.endDate) || start;
  const seen = new Set<string>();
  return records.filter((event) => {
    const id = toFirestoreEventId(event.id);
    const childStart = getEventDateKey(event.startDate);
    const childEnd = getEventDateKey(event.endDate) || childStart;
    if (!ids.has(id) || seen.has(id) || !start || !end || !childStart || !childEnd
      || childStart < start || childEnd > end || childEnd < childStart
      || event.venueId !== location.venueId || event.type !== 'event'
      || event.friendEvent || event.isRecurring || event.isRecurringInstance || event.originalEventId
      || event.isCancelled || event.isExpired
      || ['cancelled', 'canceled', 'deleted', 'expired'].includes(String(event.status || '').trim().toLowerCase())
      || isEventPast(event, now) || (event.timing && !isEventDefaultMapEligible(event, now))) return false;
    seen.add(id);
    return true;
  }).sort((a, b) => (getEventScheduleStartLocalScalar(a) ?? Number.MAX_SAFE_INTEGER)
    - (getEventScheduleStartLocalScalar(b) ?? Number.MAX_SAFE_INTEGER) || String(a.id).localeCompare(String(b.id)));
};

export const getAreaLocationBounds = (
  event: Event
): { northEast: [number, number]; southWest: [number, number] } | null => {
  const locations = getAreaLocations(event);
  if (locations.length === 0) return null;

  const longitudes = locations.map(({ coordinates }) => coordinates.longitude);
  const latitudes = locations.map(({ coordinates }) => coordinates.latitude);
  return {
    northEast: [Math.max(...longitudes), Math.max(...latitudes)],
    southWest: [Math.min(...longitudes), Math.min(...latitudes)],
  };
};

export const getAreaLocationCallout = (
  event: Event,
  locationId: string
): RouteFeatureCalloutData | null => {
  const location = getAreaLocations(event).find(({ id }) => id === locationId);
  if (!location) return null;

  return {
    featureType: 'stop',
    id: location.id,
    title: cleanOptionalText(location.label) || 'Event location',
    statusLabel:
      location.certainty === 'confirmed'
        ? 'Confirmed event location'
        : 'Possible event location',
    coordinate: location.coordinates,
    locationText: cleanOptionalText(location.address),
    timeLabel: cleanOptionalText(location.timeLabel),
    description: cleanOptionalText(location.description),
    sourceLabel:
      cleanOptionalText(location.sourceLabel) ||
      cleanOptionalText(event.areaData?.sourceLabel),
  };
};

export const getAreaLocationsLabel = (event: Event): string => {
  const locations = getAreaLocations(event);
  const confirmedCount = locations.filter(
    ({ certainty }) => certainty === 'confirmed'
  ).length;
  const approximateCount = locations.length - confirmedCount;

  if (confirmedCount > 0 && approximateCount === 0) {
    return `${confirmedCount} confirmed ${confirmedCount === 1 ? 'location' : 'locations'}`;
  }
  if (confirmedCount > 0) {
    return `${confirmedCount} confirmed + ${approximateCount} possible`;
  }
  return `${approximateCount} possible ${approximateCount === 1 ? 'location' : 'locations'}`;
};

export const getAreaSourceUrl = (event: Event): string =>
  String(
    event.areaData?.sourceUrl ||
      event.facebookUrl ||
      event.ticketLinkEvents ||
      ''
  ).trim();
