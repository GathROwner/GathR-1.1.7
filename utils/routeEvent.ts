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

export type RouteLineDisplayKind =
  | 'confirmed'
  | 'street_estimate'
  | 'suggested_connection';

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

const normalizeStreetName = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLocaleLowerCase('en-CA')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Converts stored evidence into honest display semantics. In particular,
 * connected_stops and unqualified manual-review chords return null: endpoints
 * alone are not evidence that the event travels through the space between them.
 */
export const getRouteSegmentDisplayKind = (
  segment: EventRouteSegment,
  routeData?: EventRouteData | null
): RouteLineDisplayKind | null => {
  if (segment.certainty === 'confirmed') return 'confirmed';
  if (segment.source === 'routed_streets') return 'suggested_connection';
  if (segment.source === 'official_streets') return 'street_estimate';

  const listedStreets = new Set(
    (routeData?.confirmedStreets || []).map(normalizeStreetName).filter(Boolean)
  );
  if (
    segment.streetName &&
    listedStreets.has(normalizeStreetName(segment.streetName))
  ) {
    return 'street_estimate';
  }

  return null;
};

export const getRenderableRouteSegments = (event: Event): EventRouteSegment[] =>
  getRouteSegments(event).filter(
    (segment) => getRouteSegmentDisplayKind(segment, event.routeData) !== null
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
  (getRenderableRouteSegments(event).length > 0 || getRouteStops(event).length > 0);

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
  displayKind: RouteLineDisplayKind
) => ({
  type: 'FeatureCollection' as const,
  features: getRenderableRouteSegments(event)
    .filter(
      (segment) =>
        getRouteSegmentDisplayKind(segment, event.routeData) === displayKind
    )
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
    ...getRenderableRouteSegments(event).flatMap((segment) => segment.coordinates),
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
  const event = { locationScope: 'route', routeData } as Event;
  const displayKinds = new Set(
    getRenderableRouteSegments(event).map((segment) =>
      getRouteSegmentDisplayKind(segment, routeData)
    )
  );

  if (routeData?.status === 'verified' && displayKinds.has('confirmed')) {
    return 'Official route';
  }
  if (displayKinds.has('confirmed') && displayKinds.has('street_estimate')) {
    return 'Confirmed streets + estimated connections';
  }
  if (displayKinds.has('street_estimate')) {
    return 'Estimated along organizer-listed streets';
  }
  if (displayKinds.has('suggested_connection')) {
    return 'Suggested street connection • route unconfirmed';
  }
  if (displayKinds.has('confirmed')) return 'Confirmed route section';
  if (getRouteStops(event).length > 0) {
    return 'Route unknown • showing possible stops';
  }
  return 'Route details unavailable';
};
