import type { Event, EventTiming } from '../../types/events';
import {
  createLegacyTimingContract,
  getCalendarEndDecision,
  getEventScheduleState,
  getEventTimeRangeText,
  getEventTimeStatusFromTiming,
  getEventTimingBadge,
} from '../eventTiming';

const baseEvent = (timing: EventTiming): Pick<Event, 'startDate' | 'startTime' | 'endDate' | 'endTime' | 'timing'> => ({
  startDate: '2026-09-05',
  startTime: '7:00 PM',
  endDate: '2026-09-05',
  endTime: '8:00 PM',
  timing,
});

const atHalifax = (hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 8, 5, hour + 3, minute));

describe('honest event timing state machine', () => {
  it('reserves Happening Now for an observed ending', () => {
    const event = baseEvent(createLegacyTimingContract(baseEvent(null as never), { endStatus: 'observed' }));
    expect(getEventScheduleState(event, atHalifax(19, 30)).code).toBe('happening_confirmed');
    expect(getEventTimeStatusFromTiming(event, atHalifax(19, 30))).toBe('now');
    expect(getEventTimingBadge(event, atHalifax(19, 30))).toBeNull();
  });

  it('uses a hidden cutoff but never displays it as an ending', () => {
    const timing = createLegacyTimingContract(
      { startDate: '2026-09-05', startTime: '7:00 PM', endDate: '2026-09-05', endTime: '11:00 PM' },
      { endStatus: 'unknown', endResolutionMethod: 'category_default' }
    );
    const event = baseEvent(timing);

    expect(getEventScheduleState(event, atHalifax(19, 30)).code).toBe('started_unknown_end');
    expect(getEventTimeStatusFromTiming(event, atHalifax(19, 30))).toBe('today');
    expect(getEventTimeRangeText(event, atHalifax(19, 30))).toBe('Started 7:00 PM');
    expect(getEventTimingBadge(event, atHalifax(19, 30))?.text).toBe('END\nUNKNOWN');

    expect(getEventScheduleState(event, atHalifax(23, 30))).toMatchObject({
      code: 'unknown_cutoff_passed',
      defaultMapEligible: false,
      todayEligible: true,
    });
    expect(getEventTimingBadge(event, atHalifax(23, 30))?.text).toBe('STATUS\nUNKNOWN');
  });

  it('distinguishes a supported estimate before and after its display end', () => {
    const timing = createLegacyTimingContract(
      { startDate: '2026-09-05', startTime: '7:00 PM', endDate: '2026-09-05', endTime: '' },
      { endStatus: 'unknown' }
    );
    timing.estimate = {
      confidence: 'high',
      displayEndDate: '2026-09-05',
      displayEndTime: '8:00 PM',
      discoveryCutoffDate: '2026-09-05',
      discoveryCutoffTime: '8:15 PM',
      method: 'official_runtime',
    };
    const event = baseEvent(timing);

    expect(getEventScheduleState(event, atHalifax(19, 30)).code).toBe('expected_happening');
    expect(getEventTimingBadge(event, atHalifax(19, 30))?.text).toBe('EXPECTED\nNOW');
    expect(getEventTimeRangeText(event, atHalifax(19, 30))).toBe('7:00 PM – around 8:00 PM');

    expect(getEventScheduleState(event, atHalifax(20, 1)).code).toBe('estimate_passed');
    expect(getEventTimingBadge(event, atHalifax(20, 1))?.text).toBe('MAY HAVE\nENDED');
  });

  it('treats verified until-close semantics as supported current status', () => {
    const timing = createLegacyTimingContract(
      { startDate: '2026-09-05', startTime: '7:00 PM', endDate: '2026-09-05', endTime: '11:00 PM' },
      { endStatus: 'until_close', scheduleKind: 'until_close' }
    );
    const event = baseEvent(timing);
    expect(getEventScheduleState(event, atHalifax(20)).code).toBe('until_close_active');
    expect(getEventTimeStatusFromTiming(event, atHalifax(20))).toBe('now');
  });

  it('retains uncertain events under Today only until local midnight', () => {
    const timing = createLegacyTimingContract(
      { startDate: '2026-09-05', startTime: '7:00 PM', endDate: '2026-09-05', endTime: '' },
      { endStatus: 'unknown' }
    );
    const event = baseEvent(timing);
    expect(getEventScheduleState(event, atHalifax(22)).code).toBe('unknown_cutoff_passed');
    expect(getEventScheduleState(event, new Date('2026-09-06T03:05:00.000Z')).code).toBe('confirmed_ended');
  });

  it('retains an overnight cutoff under Today until the cutoff day ends', () => {
    const timing = createLegacyTimingContract(
      { startDate: '2026-09-05', startTime: '11:30 PM', endDate: '2026-09-05', endTime: '' },
      { endStatus: 'unknown' }
    );
    const event = baseEvent(timing);
    expect(getEventScheduleState(event, new Date('2026-09-06T04:00:00.000Z')).code).toBe('started_unknown_end');
    expect(getEventScheduleState(event, new Date('2026-09-06T05:45:00.000Z'))).toMatchObject({
      code: 'unknown_cutoff_passed',
      todayEligible: true,
      defaultMapEligible: false,
    });
    expect(getEventScheduleState(event, new Date('2026-09-07T03:05:00.000Z')).code).toBe('confirmed_ended');
  });

  it('requires a user-selected calendar ending when the source omitted one', () => {
    const timing = createLegacyTimingContract(
      { startDate: '2026-09-05', startTime: '7:00 PM', endDate: '2026-09-05', endTime: '' },
      { endStatus: 'unknown' }
    );
    expect(getCalendarEndDecision(baseEvent(timing)).kind).toBe('user_required');
  });
});
