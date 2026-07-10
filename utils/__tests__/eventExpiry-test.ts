import {
  EVENT_EXPIRY_GRACE_MINUTES,
  createExpiryTimeContext,
  filterOutPastEvents,
  getEventDateKey,
  isEventPast,
  isEventPastFast,
} from '../eventExpiry';

// Fixed reference: "today" is 2026-07-10 in every test below.
const ctx = (nowMinutes: number, todayKey = '2026-07-10') => ({ todayKey, nowMinutes });

const minutes = (h: number, m: number) => h * 60 + m;

describe('isEventPastFast', () => {
  it('marks a single-day event that ended yesterday as past', () => {
    const event = {
      startDate: '2026-07-09',
      endDate: '2026-07-09',
      startTime: '7:00 PM',
      endTime: '11:00 PM',
    };
    expect(isEventPastFast(event, ctx(minutes(9, 0)))).toBe(true);
  });

  it('keeps an event visible during the grace window and hides it after', () => {
    const event = {
      startDate: '2026-07-10',
      endDate: '2026-07-10',
      startTime: '5:00 PM',
      endTime: '7:00 PM',
    };
    // Grace is 5 minutes: 7:04 PM within grace, 7:06 PM past it
    expect(isEventPastFast(event, ctx(minutes(19, 4)))).toBe(false);
    expect(isEventPastFast(event, ctx(minutes(19, 5)))).toBe(false);
    expect(isEventPastFast(event, ctx(minutes(19, 6)))).toBe(true);
  });

  it('handles 12h ("7:00:00 PM") and 24h ("19:00") end time formats identically', () => {
    const base = { startDate: '2026-07-10', endDate: '2026-07-10', startTime: '17:00' };
    const twelveHour = { ...base, endTime: '7:00:00 PM' };
    const twentyFourHour = { ...base, endTime: '19:00' };
    for (const event of [twelveHour, twentyFourHour]) {
      expect(isEventPastFast(event, ctx(minutes(19, 4)))).toBe(false);
      expect(isEventPastFast(event, ctx(minutes(19, 6)))).toBe(true);
    }
  });

  it('treats a missing end time as running until end of day', () => {
    const event = {
      startDate: '2026-07-10',
      endDate: '2026-07-10',
      startTime: '11:00 AM',
      endTime: '',
    };
    expect(isEventPastFast(event, ctx(minutes(23, 50)))).toBe(false);
    expect(isEventPastFast(event, ctx(minutes(0, 1), '2026-07-11'))).toBe(true);
  });

  it('keeps an overnight event (10pm-1am) alive past midnight and expires it after end + grace', () => {
    const event = {
      startDate: '2026-07-10',
      endDate: '2026-07-10',
      startTime: '10:00 PM',
      endTime: '1:00 AM',
    };
    expect(isEventPastFast(event, ctx(minutes(23, 0)))).toBe(false);
    expect(isEventPastFast(event, ctx(minutes(0, 30), '2026-07-11'))).toBe(false);
    expect(isEventPastFast(event, ctx(minutes(1, 6), '2026-07-11'))).toBe(true);
  });

  it('keeps a multi-day event through its window and expires it after the final day end time', () => {
    const event = {
      startDate: '2026-07-08',
      endDate: '2026-07-12',
      startTime: '10:00 AM',
      endTime: '5:00 PM',
    };
    expect(isEventPastFast(event, ctx(minutes(20, 0)))).toBe(false); // mid-window
    expect(isEventPastFast(event, ctx(minutes(16, 0), '2026-07-12'))).toBe(false);
    expect(isEventPastFast(event, ctx(minutes(17, 6), '2026-07-12'))).toBe(true);
    expect(isEventPastFast(event, ctx(minutes(9, 0), '2026-07-13'))).toBe(true);
  });

  it('clamps grace at end of day so a 23:58 event is past at midnight', () => {
    const event = {
      startDate: '2026-07-09',
      endDate: '2026-07-09',
      startTime: '9:00 PM',
      endTime: '11:58 PM',
    };
    expect(isEventPastFast(event, ctx(minutes(0, 2), '2026-07-10'))).toBe(true);
  });

  it('parses full ISO timestamp dates via their date prefix', () => {
    const event = {
      startDate: '2026-07-09T00:00:00.000Z',
      endDate: '2026-07-09T00:00:00.000Z',
      startTime: '7:00 PM',
      endTime: '11:00 PM',
    };
    expect(getEventDateKey(event.endDate)).toBe('2026-07-09');
    expect(isEventPastFast(event, ctx(minutes(9, 0)))).toBe(true);
  });

  it('never hides an event whose dates are unparseable (client-safe default)', () => {
    const event = {
      startDate: 'TBD',
      endDate: null,
      startTime: '7:00 PM',
      endTime: '9:00 PM',
    };
    expect(isEventPastFast(event, ctx(minutes(23, 0)))).toBe(false);
  });

  it('respects a custom grace period', () => {
    const event = {
      startDate: '2026-07-10',
      endDate: '2026-07-10',
      startTime: '5:00 PM',
      endTime: '7:00 PM',
    };
    expect(isEventPastFast(event, ctx(minutes(19, 1)), 0)).toBe(true);
    expect(isEventPastFast(event, ctx(minutes(19, 20)), 30)).toBe(false);
  });
});

describe('isEventPast / createExpiryTimeContext / filterOutPastEvents', () => {
  it('isEventPast works with an explicit Date', () => {
    const event = {
      startDate: '2026-07-09',
      endDate: '2026-07-09',
      startTime: '7:00 PM',
      endTime: '11:00 PM',
    };
    expect(isEventPast(event, new Date(2026, 6, 10, 9, 0))).toBe(true);
    expect(isEventPast(event, new Date(2026, 6, 9, 22, 0))).toBe(false);
  });

  it('createExpiryTimeContext builds a local date key and minutes', () => {
    const context = createExpiryTimeContext(new Date(2026, 6, 10, 14, 30));
    expect(context).toEqual({ todayKey: '2026-07-10', nowMinutes: minutes(14, 30) });
  });

  it('filterOutPastEvents drops ended events and keeps live ones', () => {
    const ended = {
      startDate: '2026-07-09',
      endDate: '2026-07-09',
      startTime: '7:00 PM',
      endTime: '11:00 PM',
    };
    const live = {
      startDate: '2026-07-10',
      endDate: '2026-07-10',
      startTime: '7:00 PM',
      endTime: '11:00 PM',
    };
    const result = filterOutPastEvents([ended, live], new Date(2026, 6, 10, 12, 0));
    expect(result).toEqual([live]);
  });

  it('exposes the configured default grace period', () => {
    expect(EVENT_EXPIRY_GRACE_MINUTES).toBe(5);
  });
});
