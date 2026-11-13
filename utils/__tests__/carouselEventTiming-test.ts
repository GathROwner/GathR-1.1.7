import { getCarouselTimeParts } from '../carouselEventTiming';
import { createLegacyTimingContract, getEventScheduleState, getEventTimeRangeText } from '../eventTiming';
import { softInternet } from './fixtures/softInternet';
import { dateOnlyActivity } from './fixtures/dateOnlyActivity';
import type { Event } from '../../types/events';

const now = new Date('2026-10-24T19:00:00Z'); // 4PM Halifax
const event = (overrides: Partial<Event> = {}) => {
  const e = { startDate: '2026-10-24', endDate: '2026-10-24', startTime: '14:15', endTime: '18:30', ...overrides } as Event;
  e.timing = overrides.timing || createLegacyTimingContract(e, { endStatus: e.endTime ? 'observed' : 'unknown' });
  return e;
};
const text = (e: Event, date?: string | null) => {
  const p = getCarouselTimeParts(e, now, date);
  return `${p.prefix}${p.start}${p.separator}${p.end}`;
};

it('shows exact current and later-today times without status prefixes and preserves shared/lightbox wording', () => {
  const current = event();
  expect(text(current)).toBe('2:15PM–6:30PM');
  expect(getEventScheduleState(current, now).nowEligibility).toBe('confirmed');
  const future = event({ startTime: '19:00', endTime: '21:00' });
  expect(text(future)).toBe('7PM–9PM');
  for (const startTime of ['15:00', '08:30', '19:00']) {
    const unknown = event({ startTime, endTime: '' });
    expect(text(unknown)).not.toMatch(/Started|Starts|Starting|NOW/);
    expect(getEventTimeRangeText(unknown, now)).toMatch(/Started|Starts/);
  }
});
it('retains future dates, both overnight dates, cross-meridiem clocks and nonzero minutes', () => {
  expect(text(event({ startDate: '2026-10-25', endDate: '2026-10-25', startTime: '11:45', endTime: '13:15' })))
    .toBe('Oct 25 · 11:45AM–1:15PM');
  expect(text(event({ startTime: '22:00', endTime: '01:30', endDate: '2026-10-25' })))
    .toBe('Oct 24 · 10PM–Oct 25 · 1:30AM');
});
it.each(['local estimate', 'instant estimate', 'endpoint instant'])('retains both overnight dates from the displayed %s clock', source => {
  const overnight = event({ startTime: '22:00', endTime: '' });
  overnight.timing!.estimate = { confidence: 'high', method: 'official_runtime',
    displayEndDate: '2026-10-25', displayEndTime: '01:30',
    discoveryCutoffDate: '2026-10-26', discoveryCutoffTime: '02:00' };
  if (source === 'instant estimate') {
    overnight.timing!.estimate = { confidence: 'high', method: 'official_runtime', displayEndAt: '2026-10-25T04:30:00Z' };
  }
  if (source === 'endpoint instant') {
    overnight.timing!.schedule.end = { status: 'estimated', confidence: 'high', method: 'official_runtime', at: '2026-10-25T04:30:00Z' };
    // Conflicting fallback must not override the endpoint supplying the clock.
    overnight.timing!.estimate!.displayEndTime = '04:00';
  }
  expect(text(overnight)).toBe('Oct 24 · 10PM ~ Oct 25 · 1:30AM');
});
it('retains supported estimate provenance and truthful date-only/visiting-hours labels', () => {
  const estimated = event(); estimated.timing!.schedule.end.status = 'estimated';
  estimated.timing!.schedule.end.confidence = 'high'; estimated.timing!.schedule.end.method = 'official_runtime';
  const p = getCarouselTimeParts(estimated, now);
  expect(p.endEstimated).toBe(true); expect(p.separator).toBe(' ~ ');
  const gallery = softInternet();
  expect(text(gallery, '2026-10-25')).toBe('Oct 25 · 1PM–5PM');
  expect(text(gallery, null)).toContain('Oct 3–Jan 24 · Hours vary by day');
  expect(text(dateOnlyActivity())).toContain('Time not provided');
});
