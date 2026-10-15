import type { Event } from '../../types/events';
import { createLegacyTimingContract, getEventTiming, getEventScheduleState, getEventScheduleSpanLocalScalars, getEventTimingBadge } from '../eventTiming';
import { formatEventTimingSummary } from '../dateUtils';
import { doesEventMatchTypeFilters, createEventTimeContext } from '../mapEventFilters';
import { TimeFilterType } from '../../types/filter';
import { isEventPast } from '../eventExpiry';

const dates = { startDate: '2026-10-14', endDate: '2026-10-18', startTime: '', endTime: '' };
const overview = { ...dates, id: 'area', type: 'event', title: 'ANCHOR Fest', description: '', venue: 'Downtown', locationScope: 'area',
  timing: createLegacyTimingContract(dates) } as Event;

describe('source date-only multi-day area overview', () => {
  it.each(['2026-10-15T15:00:00Z', '2026-10-18T22:00:00Z'])('stays discoverable on %s without claiming active hours', (instant) => {
    const event = { ...overview, timing: getEventTiming(overview) };
    const now = new Date(instant);
    expect(getEventScheduleState(event, now)).toMatchObject({ code: 'date_range_overview', defaultMapEligible: true, todayEligible: true, nowEligibility: 'none' });
    expect(isEventPast(event, now)).toBe(false);
    expect(doesEventMatchTypeFilters(event, { timeFilter: TimeFilterType.TODAY } as any, createEventTimeContext(now))).toBe(true);
    expect(doesEventMatchTypeFilters(event, { timeFilter: TimeFilterType.NOW } as any, createEventTimeContext(now))).toBe(false);
    expect(formatEventTimingSummary(event)).toBe('Oct 14 – Oct 18 • See individual event times');
    expect(getEventTimingBadge(event, now)).toBeNull();
    expect(event.startTime).toBe(''); expect(event.endTime).toBe('');
  });
  it('expires after the advertised final date and uses that date for its schedule span', () => {
    const event = { ...overview, timing: getEventTiming(overview) };
    expect(getEventScheduleState(event, new Date('2026-10-19T03:01:00Z')).code).toBe('confirmed_ended');
    expect(getEventScheduleSpanLocalScalars(event).end - getEventScheduleSpanLocalScalars(event).start).toBe(5 * 1440 - 1);
  });
  it('preserves rich v2 timing and normal unknown-end session rules', () => {
    const rich = createLegacyTimingContract({ ...dates, startTime: '19:00', endTime: '23:00' }, { timeZone: 'America/Toronto' });
    expect(getEventTiming({ ...overview, timing: rich })).toBe(rich);
    const session = { ...overview, locationScope: 'venue' as const };
    expect(getEventScheduleState(session, new Date('2026-10-15T15:00:00Z')).code).toBe('confirmed_ended');
  });
  it('preserves explicit all-day, until-close, and displayable estimated contracts', () => {
    const allDay = createLegacyTimingContract(overview, { scheduleKind: 'all_day', timeZone: 'America/Toronto' });
    const untilClose = createLegacyTimingContract(overview, { scheduleKind: 'until_close', endStatus: 'until_close' });
    expect(getEventTiming({ ...overview, timing: allDay })).toBe(allDay);
    expect(getEventTiming({ ...overview, timing: untilClose })).toBe(untilClose);
    const semanticUntilClose = { ...untilClose, scheduleKind: 'multi_day' as const };
    expect(getEventTiming({ ...overview, timing: semanticUntilClose })).toBe(semanticUntilClose);
    const estimated = { ...overview.timing!, estimate: { confidence: 'medium' as const,
      displayEndDate: '2026-10-18', displayEndTime: '22:00', method: 'source_estimate' } };
    expect(getEventTiming({ ...overview, timing: estimated })).toBe(estimated);
  });
});
