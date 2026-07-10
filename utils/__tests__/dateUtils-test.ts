/**
 * Regression coverage for parseDateTime's format fallthrough, exercised
 * through the public isEventNow/getEventTimeStatus API.
 *
 * date-fns parse() returns an Invalid Date rather than throwing on a format
 * mismatch, so seconds-less 12h times ("7:00 PM") used to die in the
 * with-seconds strategy and never reach the matching format - events with
 * those times could never read as "happening now" from the dateUtils engine.
 */

import { getEventTimeStatus, isEventNow } from '../dateUtils';

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
