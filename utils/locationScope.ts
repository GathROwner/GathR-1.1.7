import type { Event } from '../types/events';
import { getAreaLocations } from './areaEvent';

/**
 * Shared predicates for scoped-location ("city-level") events — events whose
 * location is a broad place (Charlottetown, Downtown, Rustico...) rather than
 * a venue. Single source of truth for checks previously inlined in
 * mapStore/events/firestoreEvents.
 */

export type ScopedLocationScope = 'city' | 'area' | 'province' | 'route';

export type AreaScopeBadgePresentation = {
  label: string;
  iconName: 'location-city' | 'map' | 'public';
};

const cleanLocationText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

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
 * User-facing treatment for unordered broad-location events. Route events keep
 * their separate route badge because their ordered stops have different
 * meaning and map behavior.
 */
export const getAreaScopeBadgePresentation = (
  event: Event
): AreaScopeBadgePresentation | null => {
  if (event.locationScope === 'province') {
    return { label: 'Province-wide', iconName: 'public' };
  }

  if (event.locationScope === 'city') {
    return { label: 'City-wide', iconName: 'location-city' };
  }

  if (event.locationScope === 'area') {
    const locationCount = getAreaLocations(event).length;
    return {
      label: locationCount >= 2
        ? `Area · ${locationCount} locations`
        : 'Area-wide',
      iconName: 'map',
    };
  }

  return null;
};

/**
 * Concise location copy for cards and lightbox headers. Multi-point area
 * events lead with their stored city/area and state the number of independent
 * locations without implying an order or route.
 */
export const getScopedLocationSummary = (event: Event): string | null => {
  if (event.locationScope === 'province') {
    return cleanLocationText(event.locationLabel)
      || 'Across Prince Edward Island';
  }

  if (event.locationScope === 'city') {
    return cleanLocationText(event.locationLabel)
      || cleanLocationText(event.locationCity)
      || cleanLocationText(event.venue)
      || 'City-wide event';
  }

  if (event.locationScope === 'area') {
    const locationCount = getAreaLocations(event).length;
    const place = cleanLocationText(event.locationCity)
      || cleanLocationText(event.locationLabel)
      || cleanLocationText(event.venue);

    if (locationCount >= 2) {
      return place
        ? `${place} · ${locationCount} locations`
        : `${locationCount} locations`;
    }

    return place || 'Area-wide event';
  }

  return null;
};

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
