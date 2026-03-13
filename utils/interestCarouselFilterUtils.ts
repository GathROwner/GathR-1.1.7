import type { Event } from '../types/events';
import type { FilterCriteria, TypeFilterCriteria } from '../types/filter';
import { TimeFilterType } from '../types/filter';
import { isEventNow, getEventTimeStatus, isEventHappeningToday } from './dateUtils';

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

  return event.category.toLowerCase() === typeFilters.category.toLowerCase();
};

