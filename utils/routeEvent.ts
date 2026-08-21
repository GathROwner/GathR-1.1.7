import type {
  Event,
  EventRouteData,
  EventRouteSegment,
  EventRouteStop,
  RouteCoordinate,
} from '../types/events';

type LineFeature = {
  type: 'Feature';
  properties: {
    id: string;
    certainty: EventRouteSegment['certainty'];
  };
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
};

type StopFeature = {
  type: 'Feature';
  properties: {
    id: string;
    label: string;
    kind: EventRouteStop['kind'];
    certainty: EventRouteStop['certainty'];
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

const toGeoJsonCoordinate = (
  coordinate: RouteCoordinate
): [number, number] => [coordinate.longitude, coordinate.latitude];

export const getRouteSegments = (event: Event): EventRouteSegment[] =>
  (event.routeData?.segments || []).filter(
    (segment) =>
      !!segment &&
      (segment.certainty === 'confirmed' || segment.certainty === 'approximate') &&
      Array.isArray(segment.coordinates) &&
      segment.coordinates.length >= 2 &&
      segment.coordinates.every(isValidCoordinate)
  );

export const getRouteStops = (event: Event): EventRouteStop[] =>
  (event.routeData?.stops || []).filter(
    (stop) =>
      !!stop &&
      typeof stop.id === 'string' &&
      typeof stop.label === 'string' &&
      isValidCoordinate(stop.coordinates)
  );

export const hasDrawableRoute = (event: Event): boolean =>
  event.locationScope === 'route' &&
  (getRouteSegments(event).length > 0 || getRouteStops(event).length > 0);

/**
 * Route focus is a temporary map presentation mode. Ordinary event and
 * special markers must leave the map so they cannot cover route lines or stop
 * labels; the user-location puck remains a separate layer.
 */
export const shouldSuppressOrdinaryMapMarkers = (
  activeRouteEvent?: Event | null
): boolean => Boolean(activeRouteEvent && hasDrawableRoute(activeRouteEvent));

export const buildRouteLineFeatureCollection = (
  event: Event,
  certainty: EventRouteSegment['certainty']
) => ({
  type: 'FeatureCollection' as const,
  features: getRouteSegments(event)
    .filter((segment) => segment.certainty === certainty)
    .map<LineFeature>((segment) => ({
      type: 'Feature',
      properties: { id: segment.id, certainty: segment.certainty },
      geometry: {
        type: 'LineString',
        coordinates: segment.coordinates.map(toGeoJsonCoordinate),
      },
    })),
});

export const buildRouteStopFeatureCollection = (event: Event) => ({
  type: 'FeatureCollection' as const,
  features: getRouteStops(event).map<StopFeature>((stop) => ({
    type: 'Feature',
    properties: {
      id: stop.id,
      label: stop.label,
      kind: stop.kind,
      certainty: stop.certainty,
    },
    geometry: { type: 'Point', coordinates: toGeoJsonCoordinate(stop.coordinates) },
  })),
});

export const getRouteBounds = (
  event: Event
): { northEast: [number, number]; southWest: [number, number] } | null => {
  const coordinates = [
    ...getRouteSegments(event).flatMap((segment) => segment.coordinates),
    ...getRouteStops(event).map((stop) => stop.coordinates),
  ];

  if (coordinates.length === 0) return null;

  const longitudes = coordinates.map(({ longitude }) => longitude);
  const latitudes = coordinates.map(({ latitude }) => latitude);
  return {
    northEast: [Math.max(...longitudes), Math.max(...latitudes)],
    southWest: [Math.min(...longitudes), Math.min(...latitudes)],
  };
};

export const getRouteSourceUrl = (event: Event): string =>
  String(event.routeData?.sourceUrl || event.facebookUrl || event.ticketLinkEvents || '').trim();

export const getRouteCertaintyLabel = (routeData?: EventRouteData | null): string => {
  if (routeData?.status === 'verified') return 'Official route';
  if (routeData?.status === 'partial') return 'Confirmed details + approximate line';
  return 'Approximate route';
};
