import type { Event } from '../types/events';

type SeriesEvent = Pick<
  Event,
  | 'title'
  | 'description'
  | 'startDate'
  | 'endDate'
  | 'isRecurring'
  | 'recurringPattern'
  | 'recurrenceUntilDate'
> & Partial<Pick<Event, 'startTime' | 'endTime'>>;

export interface EventScheduleContext {
  endDate: string;
  label: string;
  kind: 'daily' | 'weekly' | 'select_dates' | 'overnight_end' | 'multi_day_span';
}

const WEEKDAY_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const parseDateOnly = (value?: string | null): Date | null => {
  const normalized = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatSeriesEndDate = (value: string, referenceDate: Date): string => {
  const parsed = parseDateOnly(value);
  if (!parsed) return '';
  const label = parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return parsed.getFullYear() === referenceDate.getFullYear()
    ? label
    : `${label}, ${parsed.getFullYear()}`;
};

const formatDatedEndLabel = (value: string, referenceDate: Date): string => {
  const parsed = parseDateOnly(value);
  if (!parsed) return '';
  const label = parsed.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return parsed.getFullYear() === referenceDate.getFullYear()
    ? label
    : `${label}, ${parsed.getFullYear()}`;
};

const parseTimeMinutes = (value?: string | null): number | null => {
  const normalized = String(value || '').trim().toLowerCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3];
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes > 59) return null;

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === 'am' && hours === 12) hours = 0;
    if (meridiem === 'pm' && hours < 12) hours += 12;
  } else if (hours > 23) {
    return null;
  }

  return hours * 60 + minutes;
};

const differenceInCalendarDays = (start: Date, end: Date): number =>
  Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));

const isOvernightOccurrence = (event: SeriesEvent, start: Date, end: Date): boolean => {
  if (differenceInCalendarDays(start, end) !== 1) return false;
  const startMinutes = parseTimeMinutes(event.startTime);
  const endMinutes = parseTimeMinutes(event.endTime);
  return startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes;
};

const explicitlySaysSelectDates = (event: SeriesEvent): boolean => {
  const copy = `${event.title || ''} ${event.description || ''}`.toLowerCase();
  return /\bselect(?:ed)?\s+dates?\b/.test(copy);
};

/**
 * Separates the time of one occurrence from its quieter date context. Explicit
 * recurrence metadata is preferred. Legacy select-date copy is recognized,
 * while ordinary overnight and multi-day events retain distinct wording.
 */
export const getEventScheduleContext = (
  event: SeriesEvent,
  referenceDate: Date = new Date()
): EventScheduleContext | null => {
  const start = parseDateOnly(event.startDate);
  const recurrenceEnd = parseDateOnly(event.recurrenceUntilDate);
  const end = parseDateOnly(event.endDate);
  const hasExplicitRecurrenceBoundary = Boolean(
    event.isRecurring &&
    recurrenceEnd &&
    start &&
    recurrenceEnd.getTime() > start.getTime()
  );
  const hasLegacySelectDatesRange = Boolean(
    start &&
    end &&
    end.getTime() > start.getTime() &&
    explicitlySaysSelectDates(event)
  );

  if (hasExplicitRecurrenceBoundary || hasLegacySelectDatesRange) {
    const endDate = hasExplicitRecurrenceBoundary
      ? String(event.recurrenceUntilDate)
      : String(event.endDate);
    const endLabel = formatSeriesEndDate(endDate, referenceDate);
    if (!endLabel) return null;

    if (explicitlySaysSelectDates(event)) {
      return { endDate, label: `Select dates through ${endLabel}`, kind: 'select_dates' };
    }

    const pattern = String(event.recurringPattern || '').trim().toLowerCase();
    if (pattern === 'daily') {
      return { endDate, label: `Daily through ${endLabel}`, kind: 'daily' };
    }

    const weeklyDay = pattern.match(/^weekly_([a-z]+)$/)?.[1];
    if (weeklyDay && WEEKDAY_LABELS[weeklyDay]) {
      return {
        endDate,
        label: `Every ${WEEKDAY_LABELS[weeklyDay]} through ${endLabel}`,
        kind: 'weekly',
      };
    }

    return { endDate, label: `Recurring through ${endLabel}`, kind: 'weekly' };
  }

  if (!(start && end && end.getTime() > start.getTime())) return null;

  const endDate = String(event.endDate);
  if (isOvernightOccurrence(event, start, end)) {
    const endLabel = formatDatedEndLabel(endDate, referenceDate);
    return endLabel
      ? { endDate, label: `Ends ${endLabel}`, kind: 'overnight_end' }
      : null;
  }

  const endLabel = formatSeriesEndDate(endDate, referenceDate);
  return endLabel
    ? { endDate, label: `Runs through ${endLabel}`, kind: 'multi_day_span' }
    : null;
};

/** @deprecated Use getEventScheduleContext. */
export const getEventSeriesContext = getEventScheduleContext;
