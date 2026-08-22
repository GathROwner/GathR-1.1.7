import type { Event, EventRouteData } from '../../types/events';
import {
  buildRouteLineFeatureCollection,
  buildRouteStopFeatureCollection,
  getRouteBounds,
  getRouteCertaintyLabel,
  getRouteCompactCertaintyLabel,
  getRouteFeatureCalloutPresentation,
  getRouteSegmentCallout,
  getRouteStopCallout,
  hasDrawableRoute,
  shouldSuppressOrdinaryMapMarkers,
} from '../routeEvent';

const routeEvent = {
  id: 'gold-cup',
  address: 'Start and finish at Queen Charlotte Intermediate School',
  locationScope: 'route',
  routeData: {
    version: 1,
    status: 'partial',
    sourceLabel: 'Official organizer route map',
    geometrySource: 'Street-following trace of the organizer-listed route.',
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
        address: 'Fitzroy Street, Charlottetown, PE',
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

  it('builds a stop callout from specific metadata before event-level fallback', () => {
    expect(getRouteStopCallout(routeEvent, 'finish')).toEqual(
      expect.objectContaining({
        title: 'Parade finish',
        statusLabel: 'Confirmed finish',
        locationText: 'Fitzroy Street, Charlottetown, PE',
        sourceLabel: 'Official organizer route map',
      })
    );
    expect(getRouteStopCallout(routeEvent, 'start')).toEqual(
      expect.objectContaining({
        statusLabel: 'Confirmed start',
        locationText: 'Start and finish at Queen Charlotte Intermediate School',
      })
    );
  });

  it('does not mislabel an event start address as an intermediate stop address', () => {
    const eventWithPossibleStop = {
      ...routeEvent,
      routeData: {
        ...routeEvent.routeData,
        stops: [
          ...(routeEvent.routeData?.stops || []),
          {
            id: 'turnaround',
            label: 'Possible turnaround',
            coordinates: { longitude: -63.13, latitude: 46.24 },
            kind: 'stop' as const,
            certainty: 'approximate' as const,
          },
        ],
      },
    } as Event;

    expect(getRouteStopCallout(eventWithPossibleStop, 'turnaround')).toEqual(
      expect.objectContaining({
        statusLabel: 'Possible stop',
        locationText: undefined,
      })
    );
  });

  it('labels a shared start/finish point as both roles', () => {
    const loopEvent = {
      ...routeEvent,
      routeData: {
        ...routeEvent.routeData,
        stops: [
          {
            id: 'shared-start-finish',
            label: 'Start and finish — Cornwall Civic Centre',
            coordinates: { longitude: -63.216882, latitude: 46.23067 },
            kind: 'start' as const,
            certainty: 'confirmed' as const,
          },
        ],
      },
    } as Event;

    expect(getRouteStopCallout(loopEvent, 'shared-start-finish')).toEqual(
      expect.objectContaining({ statusLabel: 'Confirmed start and finish' })
    );
  });

  it('explains the evidence and certainty behind a tapped route line', () => {
    expect(
      getRouteSegmentCallout(routeEvent, 'listed-street-estimate', {
        longitude: -63.132,
        latitude: 46.242,
      })
    ).toEqual(
      expect.objectContaining({
        title: 'North River Road route section',
        statusLabel: 'Estimated on organizer-listed streets',
        locationText: 'Along North River Road',
        description: 'Street-following trace of the organizer-listed route.',
        sourceLabel: 'Official organizer route map',
        coordinate: { longitude: -63.132, latitude: 46.242 },
      })
    );
  });

  it('keeps callouts inside map edges and below top controls', () => {
    const leftEdge = getRouteFeatureCalloutPresentation({
      tapX: 20,
      tapY: 200,
      mapWidth: 390,
    });
    expect(leftEdge.placement).toBe('below');
    expect(leftEdge.anchorX).toBeCloseTo(8 / 284);

    const rightEdge = getRouteFeatureCalloutPresentation({
      tapX: 370,
      tapY: 700,
      mapWidth: 390,
    });
    expect(rightEdge.placement).toBe('above');
    expect(rightEdge.anchorX).toBeCloseTo(276 / 284);

    expect(
      getRouteFeatureCalloutPresentation({ tapX: 195, tapY: 700, mapWidth: 390 })
    ).toEqual({ anchorX: 0.5, placement: 'above' });

    const formerlyClippedStop = getRouteFeatureCalloutPresentation({
      tapX: 150,
      tapY: 250,
      mapWidth: 390,
    });
    expect(formerlyClippedStop.anchorX).toBeCloseTo(138 / 284);
  });

  it('keeps route details above the measured lower route summary', () => {
    const presentation = getRouteFeatureCalloutPresentation({
      tapX: 195,
      tapY: 330,
      mapWidth: 390,
      bottomObstructionTop: 465,
    });

    expect(presentation).toEqual({ anchorX: 0.5, placement: 'above' });
  });

  it('uses the currently projected map position instead of a stale press point', () => {
    const presentation = getRouteFeatureCalloutPresentation({
      tapX: 370,
      tapY: 250,
      mapWidth: 390,
      projectedPoint: [150, 700],
    });

    expect(presentation.anchorX).toBeCloseTo(138 / 284);
    expect(presentation.placement).toBe('above');
  });

  it('falls back to the press point when native map projection is unavailable', () => {
    const presentation = getRouteFeatureCalloutPresentation({
      tapX: 370,
      tapY: 250,
      mapWidth: 390,
      projectedPoint: [Number.NaN, Number.NaN],
    });

    expect(presentation.anchorX).toBeCloseTo(276 / 284);
    expect(presentation.placement).toBe('below');
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

  it('uses compact route certainty copy in narrow lightbox badges', () => {
    expect(getRouteCompactCertaintyLabel(routeEvent.routeData)).toBe(
      'Partly confirmed'
    );

    const estimatedRouteData: EventRouteData = {
      ...routeEvent.routeData,
      version: 1,
      status: 'approximate' as const,
      segments: routeEvent.routeData!.segments!.map((segment) => ({
        ...segment,
        certainty: 'approximate' as const,
        source: 'official_streets' as const,
      })),
    };
    expect(getRouteCompactCertaintyLabel(estimatedRouteData)).toBe(
      'Estimated Route'
    );
  });

  it('separates an organizer-confirmed route from its map-aligned geometry method', () => {
    const confirmedStreetTrace = {
      ...routeEvent,
      routeData: {
        ...routeEvent.routeData,
        status: 'verified' as const,
        evidenceLevel: 'official_full_route' as const,
        geometryMethod: 'map_aligned_street_trace' as const,
        confirmedStreets: ['North River Road'],
        segments: [{
          id: 'confirmed-north-river-road',
          streetName: 'North River Road',
          certainty: 'confirmed' as const,
          source: 'routed_streets' as const,
          coordinates: [
            { longitude: -63.142, latitude: 46.248 },
            { longitude: -63.137, latitude: 46.245 },
          ],
        }],
      },
    } as Event;

    expect(getRouteCertaintyLabel(confirmedStreetTrace.routeData)).toBe(
      'Confirmed street route • map-aligned trace'
    );
    expect(
      buildRouteLineFeatureCollection(confirmedStreetTrace, 'confirmed').features
    ).toHaveLength(1);
    expect(
      buildRouteLineFeatureCollection(confirmedStreetTrace, 'suggested_connection').features
    ).toHaveLength(0);
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
