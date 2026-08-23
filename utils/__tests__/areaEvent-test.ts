import type { Event } from '../../types/events';
import {
  buildAreaLocationFeatureCollection,
  getAreaLocationBounds,
  getAreaLocationCallout,
  getAreaLocationsLabel,
  hasDrawableAreaLocations,
} from '../areaEvent';

const event = {
  id: 'busker',
  type: 'event',
  title: 'Charlottetown Busker Festival',
  locationScope: 'area',
  areaData: {
    version: 1,
    status: 'verified',
    sourceLabel: 'Official festival locations',
    locations: [
      {
        id: 'victoria-row',
        label: 'Victoria Row',
        address: '126-164 Richmond Street, Charlottetown, PE',
        coordinates: { longitude: -63.125907, latitude: 46.234294 },
        certainty: 'confirmed',
      },
      {
        id: 'founders-food-hall',
        label: 'Founders Food Hall',
        coordinates: { longitude: -63.1205401, latitude: 46.2337506 },
        certainty: 'confirmed',
      },
      {
        id: 'peakes-quay',
        label: "Peake's Quay",
        coordinates: { longitude: -63.1228403, latitude: 46.2321161 },
        certainty: 'confirmed',
      },
    ],
  },
} as Event;

describe('multi-location area events', () => {
  it('draws independent points without creating a line or visit order', () => {
    expect(hasDrawableAreaLocations(event)).toBe(true);
    const collection = buildAreaLocationFeatureCollection(event);
    expect(collection.features).toHaveLength(3);
    expect(collection.features.every(({ geometry }) => geometry.type === 'Point')).toBe(true);
    expect(JSON.stringify(collection)).not.toContain('LineString');
  });

  it('fits all confirmed locations and explains a selected point', () => {
    expect(getAreaLocationBounds(event)).toEqual({
      northEast: [-63.1205401, 46.234294],
      southWest: [-63.125907, 46.2321161],
    });
    expect(getAreaLocationsLabel(event)).toBe('3 confirmed locations');
    expect(getAreaLocationCallout(event, 'victoria-row')).toMatchObject({
      title: 'Victoria Row',
      statusLabel: 'Confirmed festival location',
      locationText: '126-164 Richmond Street, Charlottetown, PE',
      sourceLabel: 'Official festival locations',
    });
  });

  it('does not activate for a route or an area without locations', () => {
    expect(hasDrawableAreaLocations({ ...event, locationScope: 'route' })).toBe(false);
    expect(
      hasDrawableAreaLocations({ ...event, areaData: { ...event.areaData!, locations: [] } })
    ).toBe(false);
  });
});
