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

export type RouteFeatureCalloutData = {
  featureType: 'stop' | 'segment';
  id: string;
  title: string;
  statusLabel: string;
  coordinate: RouteCoordinate;
  locationText?: string;
  timeLabel?: string;
  description?: string;
  sourceLabel?: string;
};

export type RouteFeatureCalloutPresentation = {
  anchorX: number;
  placement: 'above' | 'below';
};

export const ROUTE_FEATURE_CALLOUT_WIDTH = 284;
const ROUTE_FEATURE_CALLOUT_EDGE_GUTTER = 12;
const ROUTE_FEATURE_CALLOUT_ESTIMATED_HEIGHT = 190;
const ROUTE_FEATURE_CALLOUT_TOP_CONTROL_BOUNDARY = 120;

export const getRouteFeatureCalloutPresentation = ({
  tapX,
  tapY,
  mapWidth,
  bottomObstructionTop,
  projectedPoint,
}: {
  tapX: number;
  tapY: number;
  mapWidth: number;
  bottomObstructionTop?: number;
  projectedPoint?: readonly number[] | null;
}): RouteFeatureCalloutPresentation => {
  const projectedX = Number(projectedPoint?.[0]);
  const projectedY = Number(projectedPoint?.[1]);
  const resolvedTapX = Number.isFinite(projectedX) ? projectedX : tapX;
  const resolvedTapY = Number.isFinite(projectedY) ? projectedY : tapY;
  let anchorX = 0.5;
  if (Number.isFinite(resolvedTapX) && Number.isFinite(mapWidth) && mapWidth > 0) {
    const maximumLeft = Math.max(
      ROUTE_FEATURE_CALLOUT_EDGE_GUTTER,
      mapWidth - ROUTE_FEATURE_CALLOUT_WIDTH - ROUTE_FEATURE_CALLOUT_EDGE_GUTTER
    );
    const preferredLeft = resolvedTapX - ROUTE_FEATURE_CALLOUT_WIDTH / 2;
    const clampedLeft = Math.min(
      maximumLeft,
      Math.max(ROUTE_FEATURE_CALLOUT_EDGE_GUTTER, preferredLeft)
    );
    anchorX = Math.min(
      1,
      Math.max(0, (resolvedTapX - clampedLeft) / ROUTE_FEATURE_CALLOUT_WIDTH)
    );
  }

  let placement: RouteFeatureCalloutPresentation['placement'] =
    Number.isFinite(resolvedTapY) && resolvedTapY < 360 ? 'below' : 'above';

  // A route summary card is fixed above the bottom navigation while a route is
  // focused. Prefer the side of the selected feature that can contain the
  // detail card without crossing into that measured obstruction.
  if (Number.isFinite(resolvedTapY) && Number.isFinite(bottomObstructionTop)) {
    const spaceAbove = resolvedTapY - ROUTE_FEATURE_CALLOUT_TOP_CONTROL_BOUNDARY;
    const spaceBelow = Number(bottomObstructionTop) - resolvedTapY;
    const fitsAbove = spaceAbove >= ROUTE_FEATURE_CALLOUT_ESTIMATED_HEIGHT;
    const fitsBelow = spaceBelow >= ROUTE_FEATURE_CALLOUT_ESTIMATED_HEIGHT;

    if (fitsAbove && !fitsBelow) {
      placement = 'above';
    } else if (fitsBelow && !fitsAbove) {
      placement = 'below';
    } else if (!fitsAbove && !fitsBelow) {
      placement = spaceAbove >= spaceBelow ? 'above' : 'below';
    }
  }

  return { anchorX, placement };
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

const cleanOptionalText = (value: unknown): string | undefined => {
  const text = String(value || '').trim();
  return text || undefined;
};

const getSegmentMidpoint = (segment: EventRouteSegment): RouteCoordinate => {
  const middleIndex = Math.floor(segment.coordinates.length / 2);
  return segment.coordinates[middleIndex] || segment.coordinates[0];
};

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
  if (segment.source === 'runtime_directions') return 'suggested_connection';

  // Approximate geometry previously produced by Directions was persisted on
  // some events. Never render those stored provider results; the route runtime
  // replaces them with a session-only calculation after the user asks for it.
  if (segment.source === 'routed_streets' || segment.source === 'official_streets') {
    return null;
  }

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

export const hasRuntimeRouteRequest = (event: Event): boolean => {
  if (event.locationScope !== 'route') return false;
  const explicitWaypoints = event.routeData?.routeRequest?.waypoints || [];
  if (explicitWaypoints.length >= 2) return true;
  const stops = event.routeData?.stops || [];
  return stops.length >= 2 && stops.every((stop) => Boolean(stop.coordinates || stop.address));
};

export const hasRouteMapExperience = (event: Event): boolean =>
  hasDrawableRoute(event) || hasRuntimeRouteRequest(event);

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

const getStopStatusLabel = (stop: EventRouteStop): string => {
  if (/\bstart\b.*\bfinish\b|\bfinish\b.*\bstart\b/i.test(stop.label)) {
    return stop.certainty === 'confirmed'
      ? 'Confirmed start and finish'
      : 'Possible start and finish';
  }
  const kind = stop.kind === 'stop' ? 'stop' : stop.kind;
  return stop.certainty === 'confirmed'
    ? `Confirmed ${kind}`
    : `Possible ${kind}`;
};

const canUseEventAddressForStop = (event: Event, stop: EventRouteStop): boolean => {
  if (stop.kind === 'stop') return false;
  return /\b(start|finish)\b/i.test(String(event.address || ''));
};

/**
 * Builds the user-facing evidence card for a route stop. Event-level addresses
 * are used only when they explicitly describe a start or finish; a generic
 * route/city address must not be presented as the address of an intermediate
 * or uncertain stop.
 */
export const getRouteStopCallout = (
  event: Event,
  stopId: string
): RouteFeatureCalloutData | null => {
  const stop = getRouteStops(event).find(({ id }) => id === stopId);
  if (!stop) return null;

  return {
    featureType: 'stop',
    id: stop.id,
    title: cleanOptionalText(stop.label) || 'Route stop',
    statusLabel: getStopStatusLabel(stop),
    coordinate: stop.coordinates,
    locationText:
      cleanOptionalText(stop.address) ||
      (canUseEventAddressForStop(event, stop)
        ? cleanOptionalText(event.address)
        : undefined),
    timeLabel: cleanOptionalText(stop.timeLabel),
    description: cleanOptionalText(stop.description),
    sourceLabel:
      cleanOptionalText(stop.sourceLabel) ||
      cleanOptionalText(event.routeData?.sourceLabel),
  };
};

const getSegmentStatusLabel = (
  displayKind: RouteLineDisplayKind
): string => {
  if (displayKind === 'confirmed') return 'Confirmed route section';
  if (displayKind === 'street_estimate') {
    return 'Estimated on organizer-listed streets';
  }
  return 'Suggested street connection';
};

/** Builds the evidence card for a rendered route line at the tapped point. */
export const getRouteSegmentCallout = (
  event: Event,
  segmentId: string,
  pressedCoordinate?: RouteCoordinate
): RouteFeatureCalloutData | null => {
  const segment = getRenderableRouteSegments(event).find(
    ({ id }) => id === segmentId
  );
  if (!segment) return null;

  const displayKind = getRouteSegmentDisplayKind(segment, event.routeData);
  if (!displayKind) return null;

  const streetName = cleanOptionalText(segment.streetName);
  return {
    featureType: 'segment',
    id: segment.id,
    title:
      cleanOptionalText(segment.label) ||
      (streetName ? `${streetName} route section` : 'Route section'),
    statusLabel: getSegmentStatusLabel(displayKind),
    coordinate: isValidCoordinate(pressedCoordinate)
      ? pressedCoordinate
      : getSegmentMidpoint(segment),
    locationText: streetName ? `Along ${streetName}` : undefined,
    description:
      cleanOptionalText(segment.description) ||
      cleanOptionalText(event.routeData?.geometrySource),
    sourceLabel:
      cleanOptionalText(segment.sourceLabel) ||
      cleanOptionalText(event.routeData?.sourceLabel),
  };
};

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
    return routeData.geometryMethod === 'map_aligned_street_trace'
      ? 'Confirmed street route • map-aligned trace'
      : 'Official route';
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

/**
 * Compact certainty copy for the image-overlay badge. The route summary card
 * retains the longer explanatory label; the badge must stay fully readable on
 * narrow phones beside the lightbox controls.
 */
export const getRouteCompactCertaintyLabel = (
  routeData?: EventRouteData | null
): string => {
  switch (getRouteCertaintyLabel(routeData)) {
    case 'Confirmed street route • map-aligned trace':
    case 'Official route':
      return 'Confirmed Route';
    case 'Confirmed streets + estimated connections':
      return 'Partly Confirmed';
    case 'Estimated along organizer-listed streets':
      return 'Estimated Route';
    case 'Suggested street connection • route unconfirmed':
      return 'Suggested Route';
    case 'Confirmed route section':
      return 'Confirmed Section';
    case 'Route unknown • showing possible stops':
      return 'Stops Only';
    default:
      return 'Route Details';
  }
};
