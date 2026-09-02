import type { Event } from '../types/events';

/**
 * Shared predicates for scoped-location ("city-level") events — events whose
 * location is a broad place (Charlottetown, Downtown, Rustico...) rather than
 * a venue. Single source of truth for checks previously inlined in
 * mapStore/events/firestoreEvents.
 */

export type ScopedLocationScope = 'city' | 'area' | 'province' | 'route';

export const isScopedLocationScope = (
  scope?: string | null
): scope is ScopedLocationScope =>
  scope === 'city' || scope === 'area' || scope === 'province' || scope === 'route';

/** Any non-venue location scope (city/area/route). */
export const isScopedLocationEvent = (event: Event): boolean =>
  isScopedLocationScope(event.locationScope);

/**
 * City-level events get the festival treatment on the map (gold marker
 * effect, lightbox-first tap, city filter pill). Route-scoped events are
 * scoped but not city-level.
 */
export const isCityLevelEvent = (event: Event): boolean =>
  event.locationScope === 'city' || event.locationScope === 'area' || event.locationScope === 'province';

/** Coverage events are discoverable across PEI, but must not claim a venue. */
export const isProvinceScopeEvent = (event: Event): boolean =>
  event.locationScope === 'province';

/**
 * Events represented by the gold Area treatment: citywide, area-wide, and
 * route experiences. Route remains a distinct scope so map geometry and
 * certainty can be handled without pretending it is a venue.
 */
export const isAreaExperienceEvent = (event: Event): boolean =>
  isScopedLocationEvent(event);

export const isRouteEvent = (event: Event): boolean =>
  event.locationScope === 'route';

/**
 * Sentinel category for the city-events filter pill. Not a real event
 * category — matchers special-case it to isCityLevelEvent (same pattern as
 * __FILTER_PILLS_HIDE__).
 */
export const CITY_EVENTS_CATEGORY = '__city_events__';
