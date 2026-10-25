import type { Event } from '../types/events';
import type { TypeFilterCriteria } from '../types/filter';
import { getEventTiming } from './eventTiming';
import { normalizeRecurrenceFlag } from './eventRecurrence';
import { readVisitingHours, visitingDateAfter, visitingLocalNow } from './visitingHours';

export type CampaignTimingInput = Pick<Event, 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'timing'>
  & Partial<Pick<Event, 'title' | 'description' | 'type' | 'isRecurring' | 'isRecurringInstance' | 'recurringPattern'>>;

const validDate = (value?: string): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value);

/** Source-advertised continuous donation campaigns, not daily sessions or inferred opening hours. */
export function getContinuousDonationCampaignRange(event: CampaignTimingInput) {
  const clean = (text?: string) => String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const title = clean(event.title);
  const description = clean(event.description);
  const instructions = `${title} ${description}`;
  // Only a clear collection window qualifies. Session/hours evidence stays on
  // the ordinary timing path; this display override never infers daily hours.
  if (!/\b(?:campaign|(?:donation|collection)\s+drive)\b/i.test(title)
    || !/\bdonations?\s+(?:are\s+)?accepted\b/i.test(description)
    || !/\bdrop[- ]?off\s+(?:depot|location|bin|box|point)\b/i.test(description)
    || /\bno\s+donations?\b|\bdonations?\s+(?:are\s+)?not\s+accepted\b/i.test(description)
    || /\b(?:daily|weekly|sessions?|appointments?|every|each|hours?|opens?|opening|closes?|closing|noon|midnight|(?:mon|tues|wednes|thurs|fri|satur|sun)days?)\b|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(instructions)
    || normalizeRecurrenceFlag(event.isRecurring) || normalizeRecurrenceFlag(event.isRecurringInstance)
    || (event.recurringPattern && event.recurringPattern !== 'none')) return null;
  const timing = getEventTiming(event);
  const startDate = timing.schedule.start.localDate || event.startDate;
  const endDate = event.endDate;
  if (timing.scheduleKind !== 'multi_day' || timing.schedule.end.status !== 'unknown'
    || timing.schedule.start.status === 'estimated' || readVisitingHours(event)
    || !validDate(startDate) || !validDate(endDate)
    || Date.parse(endDate) - Date.parse(startDate) <= 86400000) return null;
  return { startDate, endDate };
}

/** Presentation only. Original campaign dates, clocks, recurrence and eligibility stay untouched. */
export function getRemainingCampaignDateText(event: CampaignTimingInput, filters?: TypeFilterCriteria, now = new Date()): string | null {
  const range = getContinuousDonationCampaignRange(event);
  if (!range) return null;
  const today = visitingLocalNow(event, now).date;
  let selectedDate = filters?.timeFilter === 'tomorrow' ? visitingDateAfter(today, 1) : today;
  const selection = filters?.timeFilter === 'upcoming' ? filters.upcomingDate : undefined;
  if (selection?.kind === 'custom' && validDate(selection.startDate) && validDate(selection.endDate)
    && selection.startDate <= selection.endDate) selectedDate = selection.startDate;
  // Outside the advertised window retain its original span; never imply a new or inverted occurrence.
  const startDate = selectedDate >= range.startDate && selectedDate <= range.endDate ? selectedDate : range.startDate;
  const showYear = startDate.slice(0, 4) !== range.endDate.slice(0, 4);
  const label = (date: string) => new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', ...(showYear ? { year: 'numeric' } : {}),
  }).format(new Date(`${date}T12:00:00Z`));
  return startDate === range.endDate ? label(startDate) : `${label(startDate)}–${label(range.endDate)}`;
}
