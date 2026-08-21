import type { Event } from '../../types/events';
import {
  buildRouteLineFeatureCollection,
  buildRouteStopFeatureCollection,
  getRouteBounds,
  getRouteCertaintyLabel,
  hasDrawableRoute,
  shouldSuppressOrdinaryMapMarkers,
} from '../routeEvent';

const routeEvent = {
  id: 'gold-cup',
  locationScope: 'route',
  routeData: {
    version: 1,
    status: 'partial',
    confirmedStreets: ['North River Road'],
    stops: [
      {
        id: 'start',
        label: 'Parade start',
        coordinates: { longitude: -63.142, latitude: 46.248 },
        kind: 'start',
        certainty: 'confirmed',
      },
      {
        id: 'finish',
        label: 'Parade finish',
        coordinates: { longitude: -63.126, latitude: 46.238 },
        kind: 'finish',
        certainty: 'confirmed',
      },
    ],
    segments: [
      {
        id: 'official-street',
        certainty: 'confirmed',
        source: 'official_streets',
        coordinates: [
          { longitude: -63.142, latitude: 46.248 },
          { longitude: -63.137, latitude: 46.245 },
        ],
      },
      {
        id: 'listed-street-estimate',
        streetName: 'North River Road',
        certainty: 'approximate',
        source: 'manual_review',
        coordinates: [
          { longitude: -63.137, latitude: 46.245 },
          { longitude: -63.126, latitude: 46.238 },
        ],
      },
      {
        id: 'unsafe-connected-stops',
        certainty: 'approximate',
        source: 'connected_stops',
        coordinates: [
          { longitude: -63.142, latitude: 46.248 },
          { longitude: -63.126, latitude: 46.238 },
        ],
      },
    ],
  },
} as Event;

describe('route event map contract', () => {
  it('keeps confirmed and street-estimate lines separate', () => {
    expect(buildRouteLineFeatureCollection(routeEvent, 'confirmed').features).toHaveLength(1);
    expect(buildRouteLineFeatureCollection(routeEvent, 'street_estimate').features).toHaveLength(1);
  });

  it('never draws a raw straight-line connection between stops', () => {
    const renderedIds = [
      ...buildRouteLineFeatureCollection(routeEvent, 'confirmed').features,
      ...buildRouteLineFeatureCollection(routeEvent, 'street_estimate').features,
      ...buildRouteLineFeatureCollection(routeEvent, 'suggested_connection').features,
    ].map((feature) => feature.properties.id);

    expect(renderedIds).not.toContain('unsafe-connected-stops');
  });

  it('distinguishes a street-routed guess from an estimate based on listed streets', () => {
    const suggestedEvent = {
      ...routeEvent,
      routeData: {
        ...routeEvent.routeData,
        status: 'approximate' as const,
        confirmedStreets: [],
        segments: [
          {
            id: 'road-routed-guess',
            certainty: 'approximate' as const,
            source: 'routed_streets' as const,
            coordinates: [
              { longitude: -63.142, latitude: 46.248 },
              { longitude: -63.126, latitude: 46.238 },
            ],
          },
        ],
      },
    } as Event;

    expect(
      buildRouteLineFeatureCollection(suggestedEvent, 'suggested_connection').features
    ).toHaveLength(1);
    expect(getRouteCertaintyLabel(suggestedEvent.routeData)).toBe(
      'Suggested street connection • route unconfirmed'
    );
  });

  it('marks confirmed stops and calculates bounds', () => {
    expect(buildRouteStopFeatureCollection(routeEvent).features).toHaveLength(2);
    expect(getRouteBounds(routeEvent)).toEqual({
      northEast: [-63.126, 46.248],
      southWest: [-63.142, 46.238],
    });
  });

  it('requires route scope and usable geometry', () => {
    expect(hasDrawableRoute(routeEvent)).toBe(true);
    expect(hasDrawableRoute({ ...routeEvent, locationScope: 'area' })).toBe(false);
  });

  it('uses honest user-facing certainty language', () => {
    expect(getRouteCertaintyLabel(routeEvent.routeData)).toBe(
      'Confirmed streets + estimated connections'
    );
  });

  it('uses stops-only language when no defensible line exists', () => {
    const stopsOnlyEvent = {
      ...routeEvent,
      routeData: {
        ...routeEvent.routeData,
        confirmedStreets: [],
        segments: routeEvent.routeData!.segments!.filter(
          (segment) => segment.id === 'unsafe-connected-stops'
        ),
      },
    } as Event;

    expect(getRouteCertaintyLabel(stopsOnlyEvent.routeData)).toBe(
      'Route unknown • showing possible stops'
    );
  });

  it('suppresses unrelated markers only while a drawable route is focused', () => {
    expect(shouldSuppressOrdinaryMapMarkers(routeEvent)).toBe(true);
    expect(shouldSuppressOrdinaryMapMarkers(null)).toBe(false);
    expect(
      shouldSuppressOrdinaryMapMarkers({ ...routeEvent, routeData: undefined })
    ).toBe(false);
  });
});
