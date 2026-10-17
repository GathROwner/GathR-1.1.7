import type { Event } from '../../types/events';
import { TimeFilterType } from '../../types/filter';
import { createLegacyTimingContract } from '../eventTiming';
import { createEventTimeContext } from '../mapEventFilters';
import { eventOverlapsDateWindow, formatUpcomingDateLabel, getUpcomingDateWindow, normalizeUpcomingDate, normalizeUpcomingTypeFilters } from '../upcomingDateWindow';

const event = (startDate: string, endDate = startDate, overrides: Partial<Event> = {}): Event => ({
  startDate, endDate, startTime: '19:00', endTime: '23:00', ...overrides,
} as Event);

describe('Upcoming local calendar windows', () => {
  it.each([
    ['2026-09-25', '2026-09-26', '2026-09-27'], // Friday
    ['2026-09-26', '2026-09-26', '2026-09-27'], // Saturday: intersection excludes today
    ['2026-09-27', '2026-10-03', '2026-10-04'], // Sunday rolls to the next usable weekend
    ['2026-09-28', '2026-10-03', '2026-10-04'], // Monday rolls forward
    ['2026-12-31', '2027-01-02', '2027-01-03'],
  ])('selects the current or next local weekend on %s', (today, startDate, endDate) => {
    expect(getUpcomingDateWindow({ kind: 'weekend' }, today)).toEqual({ startDate, endDate });
  });

  it.each(['2026-03-07', '2026-10-31'])('keeps seven calendar days across DST from %s', today => {
    const window = getUpcomingDateWindow({ kind: 'next7' }, today)!;
    expect(window).toEqual(today === '2026-03-07'
      ? { startDate: '2026-03-08', endDate: '2026-03-14' }
      : { startDate: '2026-11-01', endDate: '2026-11-07' });
    // Run this suite under America/Halifax as well as UTC. The context must use local dates.
    const now = today === '2026-03-07' ? new Date(2026, 2, 7, 23, 30) : new Date(2026, 9, 31, 23, 30);
    expect(createEventTimeContext(now).tomorrowKey).toBe(window.startDate);
  });

  it('normalizes expired, invalid, and reversed custom dates; trims a partially elapsed range', () => {
    const custom = (startDate: string, endDate = startDate) => ({ kind: 'custom' as const, startDate, endDate });
    for (const value of [custom('2026-09-24'), custom('2026-09-25'), custom('2026-02-30'), custom('2026-10-03', '2026-10-01')]) {
      expect(normalizeUpcomingDate(value, '2026-09-25')).toEqual({ kind: 'any' });
    }
    expect(normalizeUpcomingDate(custom('2026-09-24', '2026-09-28'), '2026-09-25'))
      .toEqual(custom('2026-09-26', '2026-09-28'));
    expect(normalizeUpcomingTypeFilters({ timeFilter: TimeFilterType.TODAY, upcomingDate: custom('2026-09-28') }).upcomingDate).toBeUndefined();
  });

  it('matches spanning and overnight occurrences, with inclusive date endpoints', () => {
    const window = { startDate: '2026-09-28', endDate: '2026-09-30' };
    expect(eventOverlapsDateWindow(event('2026-09-27', '2026-09-29'), window)).toBe(true);
    expect(eventOverlapsDateWindow(event('2026-09-27', '2026-09-27', { endTime: '01:00' }), window)).toBe(true);
    expect(eventOverlapsDateWindow(event('2026-09-30'), window)).toBe(true);
    expect(eventOverlapsDateWindow(event('2026-10-01'), window)).toBe(false);
    expect(eventOverlapsDateWindow(event('2026-09-27'), window)).toBe(false);
  });

  it('uses the resolved v2 occurrence and never treats recurrenceUntilDate as an active span', () => {
    const timing = createLegacyTimingContract(event('2026-09-28', '2026-09-29'));
    const recurring = event('2026-09-01', '2026-12-31', { timing, isRecurring: true, recurrenceUntilDate: '2026-12-31' });
    expect(eventOverlapsDateWindow(recurring, { startDate: '2026-09-29', endDate: '2026-09-29' })).toBe(true);
    expect(eventOverlapsDateWindow(recurring, { startDate: '2026-10-01', endDate: '2026-10-01' })).toBe(false);
  });

  it('resolves instant-only endpoints in the existing event-local timezone', () => {
    const timing = createLegacyTimingContract(event('', ''));
    timing.schedule.start = { status: 'observed', at: '2026-09-29T01:00:00Z', timeZone: 'America/Halifax' };
    timing.schedule.end = { status: 'observed', at: '2026-09-29T04:00:00Z', timeZone: 'America/Halifax' };
    const occurrence = event('', '', { startTime: '', endTime: '', timing });
    expect(eventOverlapsDateWindow(occurrence, { startDate: '2026-09-28', endDate: '2026-09-28' })).toBe(true);
    expect(eventOverlapsDateWindow(occurrence, { startDate: '2026-09-29', endDate: '2026-09-29' })).toBe(true);
  });

  it('uses all-day dates and conservative unknown-ending cutoffs without stale legacy spans', () => {
    const allDay = event('2026-09-28', '2026-09-28', { startTime: '', endTime: '' });
    allDay.timing = createLegacyTimingContract(allDay, { scheduleKind: 'all_day', endStatus: 'all_day' });
    expect(eventOverlapsDateWindow(allDay, { startDate: '2026-09-28', endDate: '2026-09-28' })).toBe(true);
    const unknown = event('2026-09-28');
    unknown.timing = createLegacyTimingContract(unknown, { endStatus: 'unknown' });
    unknown.endDate = '2026-12-31';
    expect(eventOverlapsDateWindow(unknown, { startDate: '2026-09-29', endDate: '2026-09-29' })).toBe(false);
  });

  it('formats compact same-month and cross-month labels', () => {
    expect(formatUpcomingDateLabel({ kind: 'custom', startDate: '2026-09-28', endDate: '2026-09-30' }, '2026-09-25')).toBe('Sep 28–30');
    expect(formatUpcomingDateLabel({ kind: 'custom', startDate: '2026-09-28', endDate: '2026-10-02' }, '2026-09-25')).toBe('Sep 28–Oct 2');
  });
});
