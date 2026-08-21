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
        id: 'connected-stops',
        certainty: 'approximate',
        source: 'connected_stops',
        coordinates: [
          { longitude: -63.137, latitude: 46.245 },
          { longitude: -63.126, latitude: 46.238 },
        ],
      },
    ],
  },
} as Event;

describe('route event map contract', () => {
  it('keeps confirmed and approximate lines separate', () => {
    expect(buildRouteLineFeatureCollection(routeEvent, 'confirmed').features).toHaveLength(1);
    expect(buildRouteLineFeatureCollection(routeEvent, 'approximate').features).toHaveLength(1);
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
      'Confirmed details + approximate line'
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
