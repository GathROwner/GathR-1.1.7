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
>;

export interface EventSeriesContext {
  endDate: string;
  label: string;
  kind: 'daily' | 'weekly' | 'select_dates';
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

const explicitlySaysSelectDates = (event: SeriesEvent): boolean => {
  const copy = `${event.title || ''} ${event.description || ''}`.toLowerCase();
  return /\bselect(?:ed)?\s+dates?\b/.test(copy);
};

/**
 * Separates a series boundary from the time of one occurrence. Explicit
 * recurrence metadata is preferred. A legacy long-span record is only treated
 * as a series when its own copy explicitly says it runs on select dates.
 */
export const getEventSeriesContext = (
  event: SeriesEvent,
  referenceDate: Date = new Date()
): EventSeriesContext | null => {
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

  if (!hasExplicitRecurrenceBoundary && !hasLegacySelectDatesRange) return null;

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

  return { endDate, label: `Select dates through ${endLabel}`, kind: 'select_dates' };
};

