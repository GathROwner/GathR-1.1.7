import type { Event } from '../types/events';

/**
 * Shared predicates for scoped-location ("city-level") events — events whose
 * location is a broad place (Charlottetown, Downtown, Rustico...) rather than
 * a venue. Single source of truth for checks previously inlined in
 * mapStore/events/firestoreEvents.
 */

export type ScopedLocationScope = 'city' | 'area' | 'route';

export const isScopedLocationScope = (
  scope?: string | null
): scope is ScopedLocationScope =>
  scope === 'city' || scope === 'area' || scope === 'route';

/** Any non-venue location scope (city/area/route). */
export const isScopedLocationEvent = (event: Event): boolean =>
  isScopedLocationScope(event.locationScope);

/**
 * City-level events get the festival treatment on the map (gold marker
 * effect, lightbox-first tap, city filter pill). Route-scoped events are
 * scoped but not city-level.
 */
export const isCityLevelEvent = (event: Event): boolean =>
  event.locationScope === 'city' || event.locationScope === 'area';

/**
 * Sentinel category for the city-events filter pill. Not a real event
 * category — matchers special-case it to isCityLevelEvent (same pattern as
 * __FILTER_PILLS_HIDE__).
 */
export const CITY_EVENTS_CATEGORY = '__city_events__';
