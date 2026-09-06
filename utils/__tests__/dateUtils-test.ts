/**
 * Regression coverage for parseDateTime's format fallthrough, exercised
 * through the public isEventNow/getEventTimeStatus API.
 *
 * date-fns parse() returns an Invalid Date rather than throwing on a format
 * mismatch, so seconds-less 12h times ("7:00 PM") used to die in the
 * with-seconds strategy and never reach the matching format - events with
 * those times could never read as "happening now" from the dateUtils engine.
 */

import {
  getEventDisplayUntilDate,
  getEventTimeStatus,
  isEventNow,
  sortEventsByTimeStatus,
} from '../dateUtils';
import { createLegacyTimingContract } from '../eventTiming';

// Freeze "now" at 2026-07-10 20:00 local - inside a 7 PM-11 PM event window.
const NOW = new Date(2026, 6, 10, 20, 0, 0);

const timeFormats: Array<[string, string, string]> = [
  ['12h without seconds', '7:00 PM', '11:00 PM'],
  ['12h with seconds (backend format)', '7:00:00 PM', '11:00:00 PM'],
  ['24h', '19:00', '23:00'],
];

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('isEventNow time-format handling', () => {
  it.each(timeFormats)(
    'detects a live event with %s times',
    (_label, startTime, endTime) => {
      expect(isEventNow('2026-07-10', startTime, '2026-07-10', endTime)).toBe(true);
    }
  );

  it.each(timeFormats)(
    'does not report a %s event as live before it starts',
    (_label, startTime, endTime) => {
      jest.setSystemTime(new Date(2026, 6, 10, 15, 0, 0));
      expect(isEventNow('2026-07-10', startTime, '2026-07-10', endTime)).toBe(false);
    }
  );
});

describe('getEventTimeStatus time-format handling', () => {
  it.each(timeFormats)(
    'returns "now" during a %s event',
    (_label, startTime, endTime) => {
      expect(
        getEventTimeStatus({
          startDate: '2026-07-10',
          endDate: '2026-07-10',
          startTime,
          endTime,
        })
      ).toBe('now');
    }
  );
});

describe('sortEventsByTimeStatus', () => {
  it('puts the earliest upcoming event first within today', () => {
    jest.setSystemTime(new Date(2026, 7, 31, 8, 15, 0));

    const events = [
      {
        id: 'open-mic',
        startDate: '2026-08-31',
        endDate: '2026-08-31',
        startTime: '10:00 PM',
        endTime: '11:59 PM',
      },
      {
        id: 'maya-patio-meetup',
        startDate: '2026-08-31',
        endDate: '2026-08-31',
        startTime: '8:50 AM',
        endTime: '10:50 AM',
      },
    ];

    expect(sortEventsByTimeStatus(events).map((event) => event.id)).toEqual([
      'maya-patio-meetup',
      'open-mic',
    ]);
  });

  it('keeps an event happening now ahead of upcoming events', () => {
    jest.setSystemTime(new Date(2026, 7, 31, 8, 15, 0));

    const events = [
      {
        id: 'starts-soon',
        startDate: '2026-08-31',
        endDate: '2026-08-31',
        startTime: '8:30 AM',
        endTime: '9:30 AM',
      },
      {
        id: 'happening-now',
        startDate: '2026-08-31',
        endDate: '2026-08-31',
        startTime: '8:00 AM',
        endTime: '9:00 AM',
      },
    ];

    expect(sortEventsByTimeStatus(events).map((event) => event.id)).toEqual([
      'happening-now',
      'starts-soon',
    ]);
  });

  it('orders expected-current ahead of unknown-current, later today, and muted today', () => {
    jest.setSystemTime(new Date(2026, 7, 31, 20, 0, 0));
    const unknownTiming = createLegacyTimingContract(
      { startDate: '2026-08-31', startTime: '7:00 PM', endDate: '2026-08-31', endTime: '' },
      { endStatus: 'unknown' }
    );
    const expectedTiming = createLegacyTimingContract(
      { startDate: '2026-08-31', startTime: '7:00 PM', endDate: '2026-08-31', endTime: '' },
      { endStatus: 'unknown' }
    );
    expectedTiming.estimate = {
      confidence: 'high',
      displayEndDate: '2026-08-31',
      displayEndTime: '9:00 PM',
      discoveryCutoffDate: '2026-08-31',
      discoveryCutoffTime: '9:15 PM',
    };
    const mutedTiming = createLegacyTimingContract(
      { startDate: '2026-08-31', startTime: '5:00 PM', endDate: '2026-08-31', endTime: '' },
      { endStatus: 'unknown' }
    );
    const events = [
      { id: 'later', startDate: '2026-08-31', startTime: '10:00 PM', endDate: '2026-08-31', endTime: '11:00 PM' },
      { id: 'muted', startDate: '2026-08-31', startTime: '5:00 PM', endDate: '2026-08-31', endTime: '', timing: mutedTiming },
      { id: 'unknown', startDate: '2026-08-31', startTime: '7:00 PM', endDate: '2026-08-31', endTime: '', timing: unknownTiming },
      { id: 'expected', startDate: '2026-08-31', startTime: '7:00 PM', endDate: '2026-08-31', endTime: '', timing: expectedTiming },
    ];
    expect(sortEventsByTimeStatus(events).map((event) => event.id)).toEqual([
      'expected',
      'unknown',
      'later',
      'muted',
    ]);
  });
});

describe('getEventDisplayUntilDate', () => {
  it('uses the finite recurrence boundary for a recurring series', () => {
    expect(getEventDisplayUntilDate({
      startDate: '2026-08-26',
      endDate: '2026-08-26',
      isRecurring: true,
      recurrenceUntilDate: '2026-09-30',
    })).toBe('2026-09-30');
  });

  it('does not label a single-day future event as ending on its own start date', () => {
    expect(getEventDisplayUntilDate({
      startDate: '2026-08-26',
      endDate: '2026-08-26',
    })).toBeUndefined();
  });

  it('retains a real multi-day end date', () => {
    expect(getEventDisplayUntilDate({
      startDate: '2026-08-26',
      endDate: '2026-08-29',
    })).toBe('2026-08-29');
  });
});
