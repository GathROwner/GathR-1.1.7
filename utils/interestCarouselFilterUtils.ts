import type { Cluster, Event, TimeStatus, Venue } from '../types/events';
import type { FilterCriteria, TypeFilterCriteria } from '../types/filter';
import type { InterestCarouselFilter } from '../types/store';
import { TimeFilterType } from '../types/filter';
import { isEventNow, getEventTimeStatus, isEventHappeningToday } from './dateUtils';
import { isEventPast } from './eventExpiry';
import { CITY_EVENTS_CATEGORY, isAreaExperienceEvent, isRouteEvent } from './locationScope';
import {
  doesEventMatchCategoryOrFacet,
  isFamilyFriendlyInterest,
} from './familyFriendly';

type ActiveInterestCarouselFilter = Extract<InterestCarouselFilter, { status: 'active' }>;

const getTypeFiltersForEvent = (
  event: Event,
  criteria: FilterCriteria
): TypeFilterCriteria => (event.type === 'event' ? criteria.eventFilters : criteria.specialFilters);

const isEventTypeVisible = (event: Event, criteria: FilterCriteria): boolean => {
  if (event.type === 'event') return criteria.showEvents;
  if (event.type === 'special') return criteria.showSpecials;
  return false;
};

export const doesEventMatchInterestCarouselBaseFilters = (
  event: Event,
  criteria: FilterCriteria
): boolean => {
  // Ended events never match, regardless of the active time filter
  if (isEventPast(event)) {
    return false;
  }

  if (!isEventTypeVisible(event, criteria)) {
    return false;
  }

  const typeFilters = getTypeFiltersForEvent(event, criteria);

  if (typeFilters.timeFilter === TimeFilterType.NOW) {
    const isNow = isEventNow(
      event.startDate,
      event.startTime,
      event.endDate || event.startDate,
      event.endTime || ''
    );
    if (!isNow) return false;
  } else if (typeFilters.timeFilter === TimeFilterType.TODAY) {
    if (!isEventHappeningToday(event)) return false;
  } else if (typeFilters.timeFilter === TimeFilterType.TOMORROW) {
    const eventDate = new Date(`${event.startDate}T00:00:00`);
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (eventDate.getTime() !== tomorrow.getTime()) return false;
  } else if (typeFilters.timeFilter === TimeFilterType.UPCOMING) {
    if (getEventTimeStatus(event) !== 'future') return false;
  }

  if (typeFilters.search && typeFilters.search.trim() !== '') {
    const searchTerm = typeFilters.search.toLowerCase().trim();
    const matchesSearch =
      event.title.toLowerCase().includes(searchTerm) ||
      event.description.toLowerCase().includes(searchTerm) ||
      event.venue.toLowerCase().includes(searchTerm);

    if (!matchesSearch) return false;
  }

  return true;
};

export const doesEventMatchInterestCarouselActiveCategory = (
  event: Event,
  criteria: FilterCriteria
): boolean => {
  if (!doesEventMatchInterestCarouselBaseFilters(event, criteria)) {
    return false;
  }

  const typeFilters = getTypeFiltersForEvent(event, criteria);

  if (!typeFilters.category) {
    return false;
  }

  if (typeFilters.category.toLowerCase() === '__filter_pills_hide__') {
    return false;
  }

  // City-events sentinel matches by location scope, not category.
  if (typeFilters.category === CITY_EVENTS_CATEGORY) {
    return isAreaExperienceEvent(event);
  }

  return doesEventMatchCategoryOrFacet(event, typeFilters.category);
};

/**
 * Match the personalized side-pill filter. Family Friendly is a cross-type
 * facet, so it intentionally includes scored events and scored specials.
 * Ordinary interests retain their existing event/special separation.
 */
export const doesEventMatchInterestCarouselFilter = (
  event: Event,
  filter: ActiveInterestCarouselFilter
): boolean => {
  if (filter.kind === 'city') return isAreaExperienceEvent(event);
  if (isFamilyFriendlyInterest(filter.category)) {
    return doesEventMatchCategoryOrFacet(event, filter.category);
  }
  return event.type === filter.type && doesEventMatchCategoryOrFacet(event, filter.category);
};

const getFilteredClusterTimeStatus = (events: Event[], fallback: TimeStatus): TimeStatus => {
  const statuses = events.map(getEventTimeStatus);
  if (statuses.includes('now')) return 'now';
  if (statuses.includes('today')) return 'today';
  if (statuses.includes('future')) return 'future';
  return statuses.includes('past') ? 'past' : fallback;
};

/**
 * Remove nonmatching records from a cluster before it is rendered or opened.
 * Without this, a qualifying event can keep a geographic cluster visible while
 * the callout exposes unrelated records from nearby venues.
 */
export const filterClusterForInterestCarouselFilter = (
  cluster: Cluster,
  filter: ActiveInterestCarouselFilter
): Cluster | null => {
  const venues: Venue[] = cluster.venues
    .map((venue) => ({
      ...venue,
      events: venue.events.filter((event) => doesEventMatchInterestCarouselFilter(event, filter)),
    }))
    .filter((venue) => venue.events.length > 0);

  if (venues.length === 0) return null;

  const events = venues.flatMap((venue) => venue.events);
  const timeStatus = getFilteredClusterTimeStatus(events, cluster.timeStatus);

  return {
    ...cluster,
    clusterType: venues.length === 1 ? 'single' : 'multi',
    venues,
    timeStatus,
    isBroadcasting: timeStatus === 'now',
    eventCount: events.filter((event) => event.type === 'event').length,
    specialCount: events.filter((event) => event.type === 'special').length,
    categories: Array.from(new Set(events.map((event) => event.category))),
    containsCityLevelEvent: events.some(isAreaExperienceEvent),
    containsRouteEvent: events.some(isRouteEvent),
  };
};

