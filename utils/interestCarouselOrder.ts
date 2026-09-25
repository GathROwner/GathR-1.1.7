import type { Event } from '../types/events';
import { TimeFilterType, type FilterCriteria } from '../types/filter';
import { getEventScheduleStartLocalScalar } from './eventTiming';
import { doesEventMatchInterestCarouselActiveCategory } from './interestCarouselFilterUtils';

/** Select cards from the already viewport-filtered input, then order Upcoming events. */
export const getInterestCarouselEvents = (
  onScreenEvents: Event[],
  criteria: FilterCriteria
): Event[] => {
  const cards = onScreenEvents.filter((event) =>
    doesEventMatchInterestCarouselActiveCategory(event, criteria)
  );
  if (criteria.eventFilters.timeFilter !== TimeFilterType.UPCOMING) return cards;

  const upcomingEvents = cards
    .filter((event) => event.type === 'event')
    .map((event) => {
      const start = getEventScheduleStartLocalScalar(event);
      return { event, start: Number.isFinite(start) ? start : Infinity, id: String(event.id) };
    })
    .sort((a, b) => {
      if (a.start !== b.start) return a.start < b.start ? -1 : 1;
      // A stable identity breaks ties even when fetch/cache input order changes.
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  // Family / City pills can include both types. Keep every Special in its
  // existing slot and only reorder Event slots; never mutate map/store arrays.
  let eventIndex = 0;
  return cards.map((event) =>
    event.type === 'event' ? upcomingEvents[eventIndex++].event : event
  );
};
