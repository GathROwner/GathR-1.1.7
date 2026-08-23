import type {
  Event,
  EventAreaLocation,
  RouteCoordinate,
} from '../types/events';
import type { RouteFeatureCalloutData } from './routeEvent';

type AreaLocationFeature = {
  type: 'Feature';
  properties: {
    id: string;
    label: string;
    certainty: EventAreaLocation['certainty'];
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
  features: getAreaLocations(event).map<AreaLocationFeature>((location) => ({
    type: 'Feature',
    properties: {
      id: location.id,
      label: location.label,
      certainty: location.certainty,
    },
    geometry: {
      type: 'Point',
      coordinates: [location.coordinates.longitude, location.coordinates.latitude],
    },
  })),
});

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
    title: cleanOptionalText(location.label) || 'Festival location',
    statusLabel:
      location.certainty === 'confirmed'
        ? 'Confirmed festival location'
        : 'Possible festival location',
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
