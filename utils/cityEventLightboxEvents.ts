import type { Event } from '../types/events';
import type { FilterCriteria } from '../types/filter';
import { doesEventMatchInterestCarouselBaseFilters } from './interestCarouselFilterUtils';
import { isCityLevelEvent } from './locationScope';

type BuildCityEventLightboxEventsParams = {
  onScreenEvents: Event[];
  filterCriteria: FilterCriteria;
};

export const buildCityEventLightboxEvents = ({
  onScreenEvents,
  filterCriteria,
}: BuildCityEventLightboxEventsParams): Event[] => {
  const seenIds = new Set<string>();
  return onScreenEvents.filter((event) => {
    if (!isCityLevelEvent(event)) {
      return false;
    }

    if (!doesEventMatchInterestCarouselBaseFilters(event, filterCriteria)) {
      return false;
    }

    const key = String(event.id);
    if (seenIds.has(key)) {
      return false;
    }
    seenIds.add(key);
    return true;
  });
};
