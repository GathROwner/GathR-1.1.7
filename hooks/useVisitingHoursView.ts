import { useMapStore } from '../store';
import type { Event } from '../types/events';
import { readVisitingHours, visitingViewDate, visitingLocalNow } from '../utils/visitingHours';
import { getEventTimeStatusFromTiming } from '../utils/eventTiming';
import { getContinuousDonationCampaignRange, getRemainingCampaignDateText, type CampaignTimingInput } from '../utils/campaignTimingPresentation';

/** Shared selected-date context for cards, carousel and lightbox. No record mutation. */
function useVisitingContext(event: Pick<Event, 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'timing'> & Partial<Pick<Event, 'type'>>) {
  const active = Boolean(readVisitingHours(event));
  const filters = useMapStore(s => active ? event.type === 'special' ? s.filterCriteria.specialFilters : s.filterCriteria.eventFilters : undefined);
  return { date: active ? visitingViewDate(event, filters) : undefined, filters };
}

export function useVisitingHoursView(event: Parameters<typeof useVisitingContext>[0]) { return useVisitingContext(event).date; }

/** Selected-day presentation for continuous campaigns; does not alter shared time-status rules. */
export function useRemainingCampaignDateText(event: CampaignTimingInput, enabled = true) {
  const active = enabled && Boolean(getContinuousDonationCampaignRange(event));
  const filters = useMapStore(s => active ? event.type === 'special' ? s.filterCriteria.specialFilters : s.filterCriteria.eventFilters : undefined);
  return active ? getRemainingCampaignDateText(event, filters) : null;
}

export function useViewedEventTimeStatus(event: Pick<Event, 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'timing'> & Partial<Pick<Event, 'type'>>) {
  const {date,filters} = useVisitingContext(event), status = getEventTimeStatusFromTiming(event);
  return status === 'now' && (filters?.timeFilter === 'upcoming' || (date && date !== visitingLocalNow(event).date)) ? 'future' : status;
}
