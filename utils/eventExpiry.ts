/**
 * Shared "event has ended" logic — single source of truth for every surface
 * (map clusters, events tab, specials tab, callout, lightboxes, trending).
 *
 * All comparisons run in device-local time, matching the app-wide convention;
 * the backend's America/Halifax serve-time filter remains the authority.
 */

// Events stay visible this long past their listed end time before being hidden.
export const EVENT_EXPIRY_GRACE_MINUTES = 5;

const NOON_MINUTES = 12 * 60;
const END_OF_DAY_MINUTES = 23 * 60 + 59;

export type EventScheduleFields = {
  startDate?: string | null;
  startTime?: string | null;
  endDate?: string | null;
  endTime?: string | null;
};

export type ExpiryTimeContext = {
  todayKey: string;
  nowMinutes: number;
};

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const formatLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getEventDateKey = (dateStr?: string | null): string => {
  if (!dateStr) return '';

  const rawKey = dateStr.slice(0, 10);
  if (DATE_KEY_PATTERN.test(rawKey)) {
    return rawKey;
  }

  const parsed = new Date(dateStr);
  if (!Number.isNaN(parsed.getTime())) {
    return formatLocalDateKey(parsed);
  }

  return '';
};

export const parseTimeMinutes = (
  timeStr?: string | null,
  fallbackMinutes: number | null = null
): number | null => {
  if (!timeStr) return fallbackMinutes;

  const trimmed = timeStr.trim();
  const twelveHour = trimmed.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(AM|PM)$/i);
  if (twelveHour) {
    let hours = Number(twelveHour[1]);
    const minutes = Number(twelveHour[2] ?? 0);
    const ampm = twelveHour[3].toUpperCase();

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    return hours * 60 + minutes;
  }

  const twentyFourHour = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFourHour) {
    const hours = Number(twentyFourHour[1]);
    const minutes = Number(twentyFourHour[2]);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return hours * 60 + minutes;
    }
  }

  return fallbackMinutes;
};

export const addDaysToDateKey = (key: string, days: number): string => {
  const match = key.match(DATE_KEY_PATTERN);
  if (!match) return key;

  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatLocalDateKey(date);
};

export const createExpiryTimeContext = (now = new Date()): ExpiryTimeContext => ({
  todayKey: formatLocalDateKey(now),
  nowMinutes: now.getHours() * 60 + now.getMinutes(),
});

/**
 * True once the event's end (plus grace) is in the past.
 *
 * Rules:
 * - Missing endTime => the event runs until end of its end day (23:59).
 * - endTime earlier than startTime => the event crosses midnight and ends the
 *   day after endDate (mirrors isEventNowFast's overnight handling).
 * - Unparseable dates => never past on the client; the backend excludes and
 *   logs those authoritatively.
 * - Grace is clamped to end-of-day so an event ending 23:58 is past at
 *   midnight, not 00:03 the next day.
 */
export const isEventPastFast = (
  event: EventScheduleFields,
  context: ExpiryTimeContext,
  graceMinutes: number = EVENT_EXPIRY_GRACE_MINUTES
): boolean => {
  const startKey = getEventDateKey(event.startDate);
  const endKey = getEventDateKey(event.endDate) || startKey;
  if (!endKey) return false;

  const startMinutes = parseTimeMinutes(event.startTime, NOON_MINUTES);
  const endMinutes = parseTimeMinutes(event.endTime, END_OF_DAY_MINUTES);
  if (startMinutes === null || endMinutes === null) return false;

  const crossesMidnight = endMinutes < startMinutes;
  const effectiveEndDayKey = crossesMidnight ? addDaysToDateKey(endKey, 1) : endKey;

  if (context.todayKey > effectiveEndDayKey) {
    return true;
  }

  if (context.todayKey === effectiveEndDayKey) {
    const cutoffMinutes = Math.min(endMinutes + graceMinutes, END_OF_DAY_MINUTES);
    return context.nowMinutes > cutoffMinutes;
  }

  return false;
};

export const isEventPast = (
  event: EventScheduleFields,
  now: Date = new Date(),
  graceMinutes: number = EVENT_EXPIRY_GRACE_MINUTES
): boolean => isEventPastFast(event, createExpiryTimeContext(now), graceMinutes);

export const filterOutPastEvents = <T extends EventScheduleFields>(
  events: T[],
  now: Date = new Date()
): T[] => {
  const context = createExpiryTimeContext(now);
  return events.filter((event) => !isEventPastFast(event, context));
};
