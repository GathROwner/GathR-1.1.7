import type { EventTiming, EventVisitingHours } from '../types/events';
import type { TypeFilterCriteria } from '../types/filter';

type Input = { startDate: string; endDate?: string; startTime?: string; endTime?: string;
  venueId?: string | null; isRecurring?: unknown; isRecurringInstance?: unknown; recurringPattern?: string;
  timing?: EventTiming | null };
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dateOK = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && Number.isFinite(Date.parse(s)) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;
const minutes = (s: unknown): number => typeof s === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s)
  ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : NaN;
export const visitingDateAfter = (s: string, n: number): string => {
  const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
const recurring = (v: unknown) => v === true || /^(yes|true|1)$/i.test(String(v || '').trim());

/** Complete explicit source schedule only. Malformed/unsupported data stays unknown. */
export function readVisitingHours(event: Input): EventVisitingHours | null {
  const t = event.timing, h = t?.visitingHours;
  if (!h || typeof h !== 'object' || h.version !== 1 || t?.version !== 2 || t.scheduleKind !== 'multi_day'
    || event.startTime?.trim() || event.endTime?.trim()
    || recurring(event.isRecurring) || recurring(event.isRecurringInstance)
    || (event.recurringPattern && event.recurringPattern !== 'none')
    || t.schedule?.start?.status !== 'unknown' || t.schedule?.end?.status !== 'unknown'
    || t.schedule.start.localTime || t.schedule.start.at || t.schedule.end.localTime || t.schedule.end.at
    || !dateOK(h.startDate) || !dateOK(h.endDate) || h.endDate < h.startDate
    || h.startDate !== event.startDate || h.endDate !== event.endDate
    || !h.facilityId || !event.venueId || event.venueId !== h.facilityId
    || h.source?.type !== 'source_explicit' || !/^https:\/\/[^\s]+$/.test(h.source.url || '')
    || typeof h.source.evidence !== 'string' || !h.source.evidence.trim() || !Array.isArray(h.source.postIds) || !h.source.postIds.length
    || !h.source.postIds.every(id => typeof id === 'string' && id.trim())
    || !Number.isFinite(Date.parse(h.source.verifiedAt)) || typeof h.caveat !== 'string'
    || t.schedule.start.localDate !== h.startDate || t.schedule.end.localDate !== h.endDate
    || t.estimate?.method !== 'source_dated_activity_unknown_clock' || t.estimate?.estimateVersion !== 'date-only-activity-v1'
    || t.estimate?.invalidatedAt || t.estimate?.displayEndAt || t.estimate?.endAt || t.estimate?.displayEndTime
    || !Array.isArray(h.week) || h.week.length !== 7 || !h.week.every(d => d && typeof d === 'object')
    || new Set(h.week.map(d => d.weekday)).size !== 7) return null;
  // This minimum slice does not consume dated exceptions. Do not ignore one if later added.
  if ('exceptions' in h) return null;
  if (typeof t.timeZone !== 'string' || !t.timeZone.trim()) return null;
  try { new Intl.DateTimeFormat('en', { timeZone: t.timeZone }).format(); } catch { return null; }
  for (const day of h.week) {
    if (!days.includes(day.weekday) || typeof day.closed !== 'boolean' || !Array.isArray(day.segments)
      || day.segments.length > 4 || (day.closed ? day.segments.length !== 0 : !day.segments.length)) return null;
    let previousEnd = -1;
    for (const s of day.segments) {
      if (!s || typeof s !== 'object') return null;
      const open = minutes(s.open), close = minutes(s.close), end = close + (s.overnight ? 1440 : 0);
      if (!Number.isFinite(open) || !Number.isFinite(close) || typeof s.overnight !== 'boolean'
        || end <= open || end - open > 1440 || open < previousEnd) return null;
      previousEnd = end;
    }
  }
  return h;
}

export function visitingLocalNow(event: Input, now = new Date()): { date: string; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: event.timing?.timeZone || 'America/Halifax',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute) };
}

/** Local-minute overlaps on the viewed date, including yesterday's overnight tail. */
export function visitingIntervals(event: Input, date: string): { open: number; close: number }[] {
  const h = readVisitingHours(event);
  if (!h || !dateOK(date) || date < h.startDate || date > h.endDate) return [];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const today = h.week.find(d => d.weekday === days[weekday])!;
  const result = today.segments.map(s => ({ open: minutes(s.open), close: minutes(s.close) + (s.overnight ? 1440 : 0) }));
  if (date > h.startDate) {
    const previous = h.week.find(d => d.weekday === days[(weekday + 6) % 7])!;
    result.push(...previous.segments.filter(s => s.overnight && minutes(s.close) > 0)
      .map(s => ({ open: 0, close: minutes(s.close) })));
  }
  return result.sort((a, b) => a.open - b.open);
}

export function visitingWindowHasHours(event: Input, start: string, end?: string): boolean {
  const h = readVisitingHours(event); if (!h || !dateOK(start) || (end && !dateOK(end))) return false;
  const from = start > h.startDate ? start : h.startDate, to = end && end < h.endDate ? end : h.endDate;
  if (from > to) return false;
  // A complete weekly template repeats after seven days; include overnight carryover.
  for (let d = from, i = 0; d <= to && i < 8; d = visitingDateAfter(d, 1), i++) if (visitingIntervals(event, d).length) return true;
  return false;
}

export const visitingClock = (n: number): string => {
  const m = n % 1440, h = Math.floor(m / 60); return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export function visitingHoursText(event: Input, date: string | null): string {
  const h = readVisitingHours(event); if (!h) return '';
  if (date === null) return 'Hours vary by day';
  if (date < h.startDate) return 'Not yet on view';
  if (date > h.endDate) return 'Exhibition ended';
  const intervals = visitingIntervals(event, date);
  return intervals.length ? intervals.map(s => `${visitingClock(s.open)} – ${visitingClock(s.close)}${s.close > 1440 ? ' (+1 day)' : ''}`).join(', ') : 'Closed';
}

export function visitingViewDate(event: Input, filters?: TypeFilterCriteria, now = new Date()): string | null {
  const today = visitingLocalNow(event, now).date;
  if (filters?.timeFilter === 'tomorrow') return visitingDateAfter(today, 1);
  if (filters?.timeFilter === 'upcoming' || filters?.timeFilter === 'all') {
    const range = filters.upcomingDate;
    return range?.kind === 'custom' && range.startDate === range.endDate && dateOK(range.startDate) ? range.startDate : null;
  }
  return today;
}

export function visitingHoursSummary(event: Input, date: string | null, now = new Date()): string {
  const h = readVisitingHours(event); if (!h) return '';
  if (date === null) return `${dateLabel(h.startDate)} – ${dateLabel(h.endDate)} • ${visitingHoursText(event, null)}`;
  const today = visitingLocalNow(event, now).date;
  const label = date === today ? 'Today' : date === visitingDateAfter(today, 1) ? 'Tomorrow' : dateLabel(date);
  return `${label} • ${visitingHoursText(event, date)}`;
}
const dateLabel = (date: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00Z`));
