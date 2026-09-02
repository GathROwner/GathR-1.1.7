import type { Event } from '../types/events';
import {
  applySessionRouteResult,
  clearSessionRouteCacheForTests,
  needsSessionRouteResolution,
  resolveRouteForMap,
} from './routeRuntime';

jest.mock('../config/firebaseConfig', () => ({
  app: { options: { projectId: 'gathr-m1' } },
  auth: { currentUser: { getIdToken: jest.fn(async () => 'id-token') } },
  useFirebaseEmulators: false,
}));

jest.mock('../services/appCheckService', () => ({
  getSocialAppCheckToken: jest.fn(async () => null),
}));

const storedRouteEvent = {
  id: 'route-1',
  locationScope: 'route',
  routeData: {
    version: 1,
    status: 'approximate',
    stops: [
      {
        id: 'start',
        label: 'Start',
        kind: 'start',
        certainty: 'confirmed',
        coordinates: { longitude: -63.13, latitude: 46.24 },
      },
      {
        id: 'finish',
        label: 'Finish',
        kind: 'finish',
        certainty: 'confirmed',
        coordinates: { longitude: -63.12, latitude: 46.25 },
      },
    ],
    segments: [{
      id: 'stored-directions',
      certainty: 'approximate',
      source: 'routed_streets',
      coordinates: [
        { longitude: -63.13, latitude: 46.24 },
        { longitude: -63.12, latitude: 46.25 },
      ],
    }],
  },
} as Event;

describe('session-only route runtime', () => {
  beforeEach(() => {
    clearSessionRouteCacheForTests();
    jest.restoreAllMocks();
  });

  it('replaces persisted provider geometry with an ephemeral segment', () => {
    const resolved = applySessionRouteResult(storedRouteEvent, {
      profile: 'walking',
      coordinates: [
        { longitude: -63.13, latitude: 46.24 },
        { longitude: -63.125, latitude: 46.245 },
        { longitude: -63.12, latitude: 46.25 },
      ],
      resolvedWaypoints: storedRouteEvent.routeData!.stops!.map((stop) => ({
        id: stop.id,
        label: stop.label,
        coordinates: stop.coordinates,
      })),
      distanceMeters: 1000,
      durationSeconds: 600,
    });
    expect(resolved.routeData?.segments?.map(({ source }) => source)).toEqual([
      'runtime_directions',
    ]);
    expect(resolved.routeData?.runtimeResolvedAt).toBeTruthy();
  });

  it('requires runtime resolution for old routed geometry', () => {
    expect(needsSessionRouteResolution(storedRouteEvent)).toBe(true);
  });

  it('reuses one network request during the same app session', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          profile: 'walking',
          coordinates: [
            { longitude: -63.13, latitude: 46.24 },
            { longitude: -63.12, latitude: 46.25 },
          ],
          resolvedWaypoints: storedRouteEvent.routeData!.stops,
          distanceMeters: 1000,
          durationSeconds: 600,
        },
      }),
    } as Response);

    const [first, second] = await Promise.all([
      resolveRouteForMap(storedRouteEvent),
      resolveRouteForMap(storedRouteEvent),
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual(
      expect.objectContaining({ data: expect.objectContaining({ eventId: 'route-1' }) })
    );
  });
});
