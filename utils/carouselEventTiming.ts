import type { Event } from '../types/events';
import { getEventTimeRangeParts, getEventTiming } from './eventTiming';
import { readVisitingHours, visitingLocalNow } from './visitingHours';

type TimingEvent = Pick<Event, 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'timing'>;

// Preserve actual minutes and meridiems; shorten only whole hours and spacing.
const compactClocks = (text: string) => text
  .replace(/\b(\d{1,2}):00\s*(AM|PM)\b/g, '$1$2')
  .replace(/\b(\d{1,2}:\d{2})\s+(AM|PM)\b/g, '$1$2')
  .replace(/ [–-] /g, '–');
const dateLabel = (date: string) => {
  const key = date.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isFinite(Date.parse(key))
    ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
      .format(new Date(`${key}T12:00:00Z`))
    : '';
};

/** Display only: shared schedule states, source clocks and estimate markers stay intact. */
export function getCarouselTimeParts(event: TimingEvent, now = new Date(), viewedDate?: string | null) {
  const parts = getEventTimeRangeParts(event, now, viewedDate);
  const timing = getEventTiming(event);
  const startDate = timing.schedule.start.localDate || event.startDate;
  const localInstantDate = (instant?: string | null) => {
    try { return instant ? visitingLocalNow({ ...event, timing }, new Date(instant)).date : ''; }
    catch { return ''; }
  };
  let endDate = timing.schedule.end.localDate || event.endDate || startDate;
  if (parts.endEstimated) {
    // Ask the shared formatter which estimate supplies the displayed clock,
    // then take its date too. Discovery cutoffs never supply display dates.
    const endpointEstimate = getEventTimeRangeParts({ ...event, timing: { ...timing, estimate: null } }, now, viewedDate).endEstimated;
    const point = timing.schedule.end;
    const estimate = timing.estimate;
    endDate = endpointEstimate
      ? (point.localTime ? point.localDate || localInstantDate(point.at) : localInstantDate(point.at)) || endDate
      : (estimate?.displayEndTime
        ? estimate.displayEndDate || localInstantDate(estimate.displayEndAt || estimate.endAt)
        : localInstantDate(estimate?.displayEndAt || estimate?.endAt)) || endDate;
  }
  if (readVisitingHours(event)) {
    const date = viewedDate === undefined ? visitingLocalNow(event, now).date : viewedDate;
    return { ...parts, prefix: `${date ? `${dateLabel(date)} · ` : `${dateLabel(startDate)}–${dateLabel(endDate)} · `}${compactClocks(parts.prefix)}` };
  }
  if (!parts.start) {
    const dates = endDate !== startDate ? `${dateLabel(startDate)}–${dateLabel(endDate)}` : dateLabel(startDate);
    return { ...parts, prefix: `${dates ? `${dates} · ` : ''}${parts.prefix}` };
  }
  const spansDates = Boolean(parts.end && endDate !== startDate);
  const showDate = spansDates || startDate !== visitingLocalNow(event, now).date;
  return {
    ...parts,
    prefix: showDate ? `${dateLabel(startDate)} · ` : '',
    start: compactClocks(parts.start),
    separator: parts.separator === ' – ' ? '–' : parts.separator,
    end: `${spansDates ? `${dateLabel(endDate)} · ` : ''}${compactClocks(parts.end)}`,
  };
}
