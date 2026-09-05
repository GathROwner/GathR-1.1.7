import {
  CITY_EVENTS_CATEGORY,
  getAreaScopeBadgePresentation,
  getScopedLocationSummary,
  hasPhysicalEventDestination,
  isAreaExperienceEvent,
  isCityLevelEvent,
  isMapRenderableEvent,
  isRouteEvent,
  isScopedLocationEvent,
  isScopedLocationScope,
  shouldOpenAreaExperienceLightboxDirectly,
} from '../locationScope';
import type { Event } from '../../types/events';

const eventWithScope = (locationScope: Event['locationScope']): Event =>
  ({ locationScope } as Event);

describe('locationScope predicates', () => {
  it('isScopedLocationScope accepts city/area/province/route only', () => {
    expect(isScopedLocationScope('city')).toBe(true);
    expect(isScopedLocationScope('area')).toBe(true);
    expect(isScopedLocationScope('province')).toBe(true);
    expect(isScopedLocationScope('route')).toBe(true);
    expect(isScopedLocationScope('venue')).toBe(false);
    expect(isScopedLocationScope('unknown')).toBe(false);
    expect(isScopedLocationScope(null)).toBe(false);
    expect(isScopedLocationScope(undefined)).toBe(false);
  });

  it('isScopedLocationEvent mirrors the scope predicate', () => {
    expect(isScopedLocationEvent(eventWithScope('city'))).toBe(true);
    expect(isScopedLocationEvent(eventWithScope('route'))).toBe(true);
    expect(isScopedLocationEvent(eventWithScope('province'))).toBe(true);
    expect(isScopedLocationEvent(eventWithScope('venue'))).toBe(false);
    expect(isScopedLocationEvent(eventWithScope(null))).toBe(false);
  });

  it('isCityLevelEvent excludes route scope', () => {
    expect(isCityLevelEvent(eventWithScope('city'))).toBe(true);
    expect(isCityLevelEvent(eventWithScope('area'))).toBe(true);
    expect(isCityLevelEvent(eventWithScope('route'))).toBe(false);
    expect(isCityLevelEvent(eventWithScope('venue'))).toBe(false);
  });

  it('uses the Area treatment for city, area, and route events', () => {
    expect(isAreaExperienceEvent(eventWithScope('city'))).toBe(true);
    expect(isAreaExperienceEvent(eventWithScope('area'))).toBe(true);
    expect(isAreaExperienceEvent(eventWithScope('route'))).toBe(true);
    expect(isAreaExperienceEvent(eventWithScope('venue'))).toBe(false);
    expect(isRouteEvent(eventWithScope('route'))).toBe(true);
    expect(isRouteEvent(eventWithScope('area'))).toBe(false);
  });

  it('opens a scoped-event lightbox directly only for a single-venue marker', () => {
    const routeEvent = eventWithScope('route');

    expect(shouldOpenAreaExperienceLightboxDirectly(routeEvent, 1)).toBe(true);
    expect(shouldOpenAreaExperienceLightboxDirectly(routeEvent, 2)).toBe(false);
    expect(shouldOpenAreaExperienceLightboxDirectly(eventWithScope('venue'), 1)).toBe(false);
    expect(shouldOpenAreaExperienceLightboxDirectly(undefined, 1)).toBe(false);
  });

  it('keeps province coverage out of physical destination and map-marker paths', () => {
    const provinceEvent = { locationScope: 'province', mapMode: 'none' } as Event;
    const venueEvent = { locationScope: 'venue', mapMode: 'venue' } as Event;

    expect(hasPhysicalEventDestination(provinceEvent)).toBe(false);
    expect(isMapRenderableEvent(provinceEvent)).toBe(false);
    expect(hasPhysicalEventDestination(venueEvent)).toBe(true);
    expect(isMapRenderableEvent(venueEvent)).toBe(true);
  });

  it('exposes the city-events sentinel category', () => {
    expect(CITY_EVENTS_CATEGORY).toBe('__city_events__');
  });

  it('presents area scopes consistently without implying a route', () => {
    const areaEvent = {
      locationScope: 'area',
      locationCity: 'Charlottetown',
      venue: "Hunter's Corner and Kent Street",
      areaData: {
        version: 1,
        status: 'verified',
        locations: [
          {
            id: 'kent-street',
            label: 'Kent Street',
            coordinates: { latitude: 46.235, longitude: -63.13 },
            certainty: 'confirmed',
          },
          {
            id: 'hunters-corner',
            label: "Hunter's Corner",
            coordinates: { latitude: 46.236, longitude: -63.129 },
            certainty: 'confirmed',
          },
        ],
      },
    } as Event;

    expect(getAreaScopeBadgePresentation(areaEvent)).toEqual({
      label: 'Area · 2 locations',
      iconName: 'map',
    });
    expect(getScopedLocationSummary(areaEvent)).toBe('Charlottetown · 2 locations');
  });

  it('uses explicit city and province scope labels', () => {
    const cityEvent = {
      locationScope: 'city',
      locationLabel: 'Charlottetown, PEI',
    } as Event;
    const provinceEvent = {
      locationScope: 'province',
      locationLabel: 'Across Prince Edward Island',
      mapMode: 'none',
    } as Event;

    expect(getAreaScopeBadgePresentation(cityEvent)).toEqual({
      label: 'City-wide',
      iconName: 'location-city',
    });
    expect(getScopedLocationSummary(cityEvent)).toBe('Charlottetown, PEI');
    expect(getAreaScopeBadgePresentation(provinceEvent)).toEqual({
      label: 'Province-wide',
      iconName: 'public',
    });
    expect(getScopedLocationSummary(provinceEvent)).toBe('Across Prince Edward Island');
  });

  it('keeps route and venue events out of unordered-area presentation', () => {
    expect(getAreaScopeBadgePresentation(eventWithScope('route'))).toBeNull();
    expect(getAreaScopeBadgePresentation(eventWithScope('venue'))).toBeNull();
    expect(getScopedLocationSummary(eventWithScope('route'))).toBeNull();
  });
});
