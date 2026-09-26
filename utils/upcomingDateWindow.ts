import type { Event } from '../types/events';
import { TimeFilterType, type TypeFilterCriteria, type UpcomingDateFilter } from '../types/filter';
import { addDaysToDateKey, formatLocalDateKey } from './eventExpiry';
import { getEventScheduleSpanLocalScalars } from './eventTiming';

export { formatLocalDateKey } from './eventExpiry';
export const ANY_UPCOMING_DATE: UpcomingDateFilter = { kind: 'any' };
export type DateWindow = { startDate: string; endDate: string };

export const localDateFromKey = (key: string): Date => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
};

const validDateKey = (key: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(key) && formatLocalDateKey(localDateFromKey(key)) === key;

export const normalizeUpcomingDate = (
  selection: UpcomingDateFilter | undefined,
  todayKey = formatLocalDateKey(new Date())
): UpcomingDateFilter => {
  if (!selection) return ANY_UPCOMING_DATE;
  if (selection.kind !== 'custom') return selection;
  if (!validDateKey(selection.startDate) || !validDateKey(selection.endDate) ||
      selection.endDate < selection.startDate || selection.endDate <= todayKey) {
    return ANY_UPCOMING_DATE;
  }
  // A range crossing today keeps only its remaining Upcoming days.
  const tomorrow = addDaysToDateKey(todayKey, 1);
  return selection.startDate < tomorrow ? { ...selection, startDate: tomorrow } : selection;
};

export const normalizeUpcomingTypeFilters = (
  filters: TypeFilterCriteria,
  todayKey = formatLocalDateKey(new Date())
): TypeFilterCriteria => {
  const upcomingDate = filters.timeFilter === TimeFilterType.UPCOMING
    ? normalizeUpcomingDate(filters.upcomingDate, todayKey) : undefined;
  return filters.upcomingDate === upcomingDate ? filters : { ...filters, upcomingDate };
};

/** Saturday/Sunday of the current local week; on Sunday it has no remaining
 * Upcoming day, so target next weekend.
 * Calendar addition, never elapsed 24-hour increments, is safe across DST. */
export const getUpcomingDateWindow = (
  selection: UpcomingDateFilter | undefined,
  todayKey = formatLocalDateKey(new Date())
): DateWindow | null => {
  const normalized = normalizeUpcomingDate(selection, todayKey);
  if (normalized.kind === 'any') return null;
  if (normalized.kind === 'custom') return normalized;
  if (normalized.kind === 'next7') {
    return { startDate: addDaysToDateKey(todayKey, 1), endDate: addDaysToDateKey(todayKey, 7) };
  }
  const weekday = localDateFromKey(todayKey).getDay();
  const saturday = addDaysToDateKey(todayKey, weekday === 0 ? 6 : 6 - weekday);
  return { startDate: saturday, endDate: addDaysToDateKey(saturday, 1) };
};

const dayScalar = (key: string): number => {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 60000;
};

/** Compare calendar coordinates, not UTC instants. Each record is one resolved occurrence. */
export const eventOverlapsDateWindow = (event: Event, window: DateWindow | null): boolean => {
  if (!window) return true;
  const span = getEventScheduleSpanLocalScalars(event);
  const start = dayScalar(window.startDate);
  const endExclusive = dayScalar(addDaysToDateKey(window.endDate, 1));
  return Number.isFinite(span.start) && span.start < endExclusive && span.end >= start;
};

export const formatUpcomingDateLabel = (
  selection: UpcomingDateFilter | undefined,
  todayKey = formatLocalDateKey(new Date())
): string => {
  const normalized = normalizeUpcomingDate(selection, todayKey);
  if (normalized.kind === 'any') return 'Upcoming';
  if (normalized.kind === 'weekend') return 'Weekend';
  if (normalized.kind === 'next7') return 'Next 7 days';
  const start = localDateFromKey(normalized.startDate);
  const end = localDateFromKey(normalized.endDate);
  const short = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (normalized.startDate === normalized.endDate) return short(start);
  return `${short(start)}–${start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear() ? end.getDate() : short(end)}`;
};
