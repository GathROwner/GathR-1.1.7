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

/** Province records have coverage, not a physical destination. */
export const hasPhysicalEventDestination = (event: Event): boolean =>
  !isProvinceScopeEvent(event) && event.mapMode !== 'none';

/** Only events with a physical map representation may enter clustering. */
export const isMapRenderableEvent = (event: Event): boolean =>
  hasPhysicalEventDestination(event);

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
 * A scoped event may skip the callout only when its marker represents one
 * venue. Multi-venue markers must reveal their contents first so users can
 * choose the intended venue/event before opening a lightbox.
 */
export const shouldOpenAreaExperienceLightboxDirectly = (
  event: Event | null | undefined,
  venueCount: number
): boolean => Boolean(event && isAreaExperienceEvent(event) && venueCount === 1);

/**
 * Sentinel category for the city-events filter pill. Not a real event
 * category — matchers special-case it to isCityLevelEvent (same pattern as
 * __FILTER_PILLS_HIDE__).
 */
export const CITY_EVENTS_CATEGORY = '__city_events__';
