import type {
  Event,
  EventRouteRequestWaypoint,
  EventRouteSegment,
  EventRouteStop,
  RouteCoordinate,
} from '../types/events';
import {
  app,
  auth,
  firebaseTarget,
  useFirebaseEmulators,
} from '../config/firebaseConfig';
import { getSocialAppCheckToken } from '../services/appCheckService';

type RouteRuntimeResponse = {
  profile: 'walking' | 'driving' | 'cycling';
  coordinates: RouteCoordinate[];
  resolvedWaypoints: (EventRouteRequestWaypoint & { coordinates: RouteCoordinate })[];
  distanceMeters: number;
  durationSeconds: number;
};

type CallableEnvelope = {
  result?: RouteRuntimeResponse;
  data?: RouteRuntimeResponse;
  error?: { status?: string; message?: string };
};

const FUNCTION_NAME = 'resolveEventRoutePathCallable';
const REGION = 'northamerica-northeast1';
const ROUTE_FUNCTION_PROJECT_ID = 'gathr-m1';
const STAGING_AUTH_HEADER = 'x-gathr-staging-auth';
const sessionRouteCache = new Map<string, Promise<Event>>();

export class RouteRuntimeError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RouteRuntimeError';
    this.code = code;
  }
}

function callableUrl(): string {
  const projectId = app.options.projectId;
  if (!projectId) throw new RouteRuntimeError('failed-precondition', 'Firebase is not configured.');
  if (useFirebaseEmulators) {
    const host = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || '10.0.2.2';
    return `http://${host}:5001/${projectId}/${REGION}/${FUNCTION_NAME}`;
  }
  // Keep quota accounting in one production-owned function. Android Preview
  // authenticates against staging and uses a separately verified header below.
  return `https://${REGION}-${ROUTE_FUNCTION_PROJECT_ID}.cloudfunctions.net/${FUNCTION_NAME}`;
}

export function buildRouteRuntimeHeaders(
  target: string,
  idToken: string | null,
  appCheckToken: string | null
): Record<string, string> {
  if (target === 'staging') {
    return idToken ? { [STAGING_AUTH_HEADER]: `Bearer ${idToken}` } : {};
  }
  return {
    ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),
    ...(appCheckToken ? { 'X-Firebase-AppCheck': appCheckToken } : {}),
  };
}

function providerGeneratedStoredSegment(segment: EventRouteSegment): boolean {
  return segment.certainty === 'approximate'
    && (segment.source === 'routed_streets' || segment.source === 'official_streets');
}

function routeWaypoints(event: Event): EventRouteRequestWaypoint[] {
  const explicit = event.routeData?.routeRequest?.waypoints || [];
  if (explicit.length >= 2) return explicit;
  return (event.routeData?.stops || []).map((stop) => ({
    id: stop.id,
    label: stop.label,
    coordinates: stop.coordinates,
    ...(stop.address ? { address: stop.address } : {}),
  }));
}

function routeProfile(event: Event): 'walking' | 'driving' | 'cycling' {
  return event.routeData?.routeRequest?.profile || 'walking';
}

export function needsSessionRouteResolution(event: Event): boolean {
  if (event.locationScope !== 'route' || event.routeData?.runtimeResolvedAt) return false;
  if ((event.routeData?.segments || []).some(providerGeneratedStoredSegment)) return true;
  return Boolean(event.routeData?.routeRequest && routeWaypoints(event).length >= 2);
}

function withoutStoredProviderGeometry(event: Event): Event {
  if (!event.routeData) return event;
  return {
    ...event,
    routeData: {
      ...event.routeData,
      segments: (event.routeData.segments || []).filter(
        (segment) => !providerGeneratedStoredSegment(segment)
      ),
    },
  };
}

function stopsFromResolvedWaypoints(
  existingStops: EventRouteStop[],
  waypoints: RouteRuntimeResponse['resolvedWaypoints']
): EventRouteStop[] {
  if (existingStops.length > 0) return existingStops;
  return waypoints.map((waypoint, index) => ({
    id: waypoint.id || `runtime-stop-${index + 1}`,
    label: waypoint.label || `Route point ${index + 1}`,
    coordinates: waypoint.coordinates,
    kind: index === 0 ? 'start' : index === waypoints.length - 1 ? 'finish' : 'stop',
    certainty: 'approximate',
    ...(waypoint.address ? { address: waypoint.address } : {}),
  }));
}

export function applySessionRouteResult(event: Event, result: RouteRuntimeResponse): Event {
  const sanitized = withoutStoredProviderGeometry(event);
  const runtimeSegment: EventRouteSegment = {
    id: 'session-mapbox-directions',
    label: 'Suggested route calculated for this session',
    certainty: 'approximate',
    source: 'runtime_directions',
    description: 'Calculated when you selected Show Route. It is not stored by GathR.',
    coordinates: result.coordinates,
  };
  return {
    ...sanitized,
    routeData: {
      ...sanitized.routeData!,
      geometryMethod: 'street_routing_estimate',
      geometrySource: 'Session-only Mapbox route based on the event route points.',
      runtimeResolvedAt: new Date().toISOString(),
      stops: stopsFromResolvedWaypoints(
        sanitized.routeData?.stops || [],
        result.resolvedWaypoints
      ),
      segments: [...(sanitized.routeData?.segments || []), runtimeSegment],
    },
  };
}

function cacheKey(event: Event): string {
  return JSON.stringify({
    id: String(event.id),
    profile: routeProfile(event),
    waypoints: routeWaypoints(event),
  });
}

function friendlyError(code: string, fallback?: string): RouteRuntimeError {
  if (code === 'resource-exhausted') {
    return new RouteRuntimeError(
      code,
      'GathR has reached its monthly route safety limit. Route information is still available from the event source.'
    );
  }
  if (code === 'unauthenticated') {
    return new RouteRuntimeError(code, 'Sign in to calculate this route in the current Preview.');
  }
  return new RouteRuntimeError(
    code,
    fallback || 'The route could not be calculated right now. Please try again.'
  );
}

async function requestSessionRoute(event: Event): Promise<Event> {
  const waypoints = routeWaypoints(event);
  const sanitized = withoutStoredProviderGeometry(event);
  if (waypoints.length < 2) return sanitized;

  const user = auth.currentUser;
  const [idToken, appCheckToken] = await Promise.all([
    user ? user.getIdToken() : Promise.resolve(null),
    getSocialAppCheckToken(),
  ]);
  const response = await fetch(callableUrl(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...buildRouteRuntimeHeaders(firebaseTarget, idToken, appCheckToken),
    },
    body: JSON.stringify({
      data: {
        eventId: String(event.id),
        profile: routeProfile(event),
        waypoints,
      },
    }),
  });
  const envelope = await response.json() as CallableEnvelope;
  if (!response.ok || envelope.error) {
    const code = String(envelope.error?.status || `http-${response.status}`)
      .toLowerCase()
      .replace(/_/g, '-');
    throw friendlyError(code, envelope.error?.message);
  }
  const result = envelope.result ?? envelope.data;
  if (!result || result.coordinates.length < 2) {
    throw friendlyError('invalid-response');
  }
  return applySessionRouteResult(event, result);
}

/**
 * Resolves provider-generated geometry only after Show Route is tapped. The
 * module cache is intentionally process-memory only and dies with the app.
 */
export async function resolveRouteForMap(event: Event): Promise<Event> {
  if (!needsSessionRouteResolution(event)) return withoutStoredProviderGeometry(event);
  const key = cacheKey(event);
  const cached = sessionRouteCache.get(key);
  if (cached) return cached;
  const request = requestSessionRoute(event).catch((error) => {
    sessionRouteCache.delete(key);
    throw error;
  });
  sessionRouteCache.set(key, request);
  return request;
}

export function clearSessionRouteCacheForTests(): void {
  sessionRouteCache.clear();
}
