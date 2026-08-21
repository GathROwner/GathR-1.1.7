import {
  CITY_EVENTS_CATEGORY,
  isAreaExperienceEvent,
  isCityLevelEvent,
  isRouteEvent,
  isScopedLocationEvent,
  isScopedLocationScope,
} from '../locationScope';
import type { Event } from '../../types/events';

const eventWithScope = (locationScope: Event['locationScope']): Event =>
  ({ locationScope } as Event);

describe('locationScope predicates', () => {
  it('isScopedLocationScope accepts city/area/route only', () => {
    expect(isScopedLocationScope('city')).toBe(true);
    expect(isScopedLocationScope('area')).toBe(true);
    expect(isScopedLocationScope('route')).toBe(true);
    expect(isScopedLocationScope('venue')).toBe(false);
    expect(isScopedLocationScope('unknown')).toBe(false);
    expect(isScopedLocationScope(null)).toBe(false);
    expect(isScopedLocationScope(undefined)).toBe(false);
  });

  it('isScopedLocationEvent mirrors the scope predicate', () => {
    expect(isScopedLocationEvent(eventWithScope('city'))).toBe(true);
    expect(isScopedLocationEvent(eventWithScope('route'))).toBe(true);
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

  it('exposes the city-events sentinel category', () => {
    expect(CITY_EVENTS_CATEGORY).toBe('__city_events__');
  });
});
