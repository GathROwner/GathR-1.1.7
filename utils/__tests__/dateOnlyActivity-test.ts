import { normalizeFirestoreEvent } from '../../lib/api/firestoreEvents';
import type { FirestoreEvent } from '../../types/firestore';
import type { Event } from '../../types/events';
import { dateOnlyActivity } from './fixtures/dateOnlyActivity';
import { createLegacyTimingContract, getDateOnlyScheduleRange, getEventScheduleState, getEventTimeRangeText,
  getEventTimingBadge, getEventTimingDisclosure } from '../eventTiming';
import { formatEventTimingSummary } from '../dateUtils';
import { isEventPast } from '../eventExpiry';
import { doesEventMatchTypeFilters, createEventTimeContext } from '../mapEventFilters';
import { TimeFilterType } from '../../types/filter';
import { getCachedEventScheduleState, resetEventScheduleStateCache } from '../eventScheduleStateCache';

jest.mock('../../config/firebaseConfig', () => ({ auth: { currentUser: null }, firestore: {} }));

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-15T15:00:00Z')); resetEventScheduleStateCache(); });
afterEach(() => jest.useRealTimers());

it.each(['event', 'special'] as const)('retains normalized %s date-only metadata without fabricating clocks', (type) => {
  const source = dateOnlyActivity({ type });
  const normalized = normalizeFirestoreEvent({ ...source, timing: undefined, isEvent: type === 'event',
    metadata: { timing: source.timing } } as unknown as FirestoreEvent);
  expect(normalized.type).toBe(type);
  expect(normalized.startTime).toBe(''); expect(normalized.endTime).toBe('');
  expect(getDateOnlyScheduleRange(normalized)).toEqual({ startDate: '2026-10-15', endDate: '2026-10-15' });
  expect(getEventScheduleState(normalized)).toMatchObject({ code: 'date_only_today', nowEligibility: 'none', todayEligible: true, defaultMapEligible: true });
  expect(formatEventTimingSummary(normalized)).toBe('Today • Time not provided');
  expect(getEventTimingDisclosure(normalized)).toContain('no start or end time');
  expect(getEventTimingBadge(normalized)?.text).toBe('TIMES\nUNKNOWN');
});

it.each(['top', 'metadata'] as const)('normalizes saved Yes/No recurrence flags from %s feed fields', (placement) => {
  for (const type of ['event', 'special'] as const) {
    for (const field of ['isRecurring', 'isRecurringInstance'] as const) {
      for (const flag of ['No', 'Yes'] as const) {
        const source = dateOnlyActivity({ type });
        const flags = { isRecurring: 'No', isRecurringInstance: 'No', [field]: flag };
        const normalized = normalizeFirestoreEvent({ ...source, isEvent: type === 'event',
          isRecurring: undefined, isRecurringInstance: undefined,
          ...(placement === 'top' ? flags : {}),
          metadata: { timing: source.timing, ...(placement === 'metadata' ? flags : {}) },
        } as unknown as FirestoreEvent);
        expect(normalized[field]).toBe(flag === 'Yes');
        expect(Boolean(getDateOnlyScheduleRange(normalized))).toBe(flag === 'No');
        if (flag === 'No') expect(formatEventTimingSummary(normalized)).toBe('Today • Time not provided');
      }
    }
  }
});

it('handles persisted string flags in the schedule cache without promoting recurring records', () => {
  const event = { ...dateOnlyActivity(), isRecurring: 'No', isRecurringInstance: 'No' } as unknown as Event;
  expect(getCachedEventScheduleState(event).code).toBe('date_only_today');
  (event as unknown as { isRecurring: string }).isRecurring = 'Yes';
  expect(getCachedEventScheduleState(event).code).toBe('started_unknown_end');
  (event as unknown as { isRecurring: string }).isRecurring = ' false ';
  expect(getCachedEventScheduleState(event).code).toBe('date_only_today');
  (event as unknown as { isRecurringInstance: string }).isRecurringInstance = 'Yes';
  expect(getCachedEventScheduleState(event).code).toBe('started_unknown_end');
  (event as unknown as { isRecurringInstance: string }).isRecurringInstance = 'No';
  expect(getCachedEventScheduleState(event).code).toBe('date_only_today');
  (event as unknown as { isRecurring: string }).isRecurring = 'unrecognized';
  expect(getDateOnlyScheduleRange(event)).toBeNull();
});

it('matches future/tomorrow/today filters without Now, and expires at local midnight after its date', () => {
  const event = dateOnlyActivity({ startDate: '2026-10-16' });
  for (const [instant, today, tomorrow, upcoming, past] of [
    ['2026-10-15T15:00:00Z', false, true, true, false],
    ['2026-10-16T03:00:00Z', true, false, false, false],
    ['2026-10-17T02:59:59Z', true, false, false, false],
    ['2026-10-17T03:00:00Z', false, false, false, true],
  ] as const) {
    const now = new Date(instant), context = createEventTimeContext(now);
    const matches = (timeFilter: TimeFilterType) => doesEventMatchTypeFilters(event, { timeFilter }, context);
    expect([matches(TimeFilterType.TODAY), matches(TimeFilterType.TOMORROW), matches(TimeFilterType.UPCOMING), isEventPast(event, now)])
      .toEqual([today, tomorrow, upcoming, past]);
    expect(matches(TimeFilterType.NOW)).toBe(false);
  }
  expect(formatEventTimingSummary(event)).toBe('Tomorrow • Time not provided');
});

it('shows an explicit offer date range through its final date, including the DST change', () => {
  const offer = dateOnlyActivity({ type: 'special', startDate: '2026-10-31', endDate: '2026-11-02' });
  expect(formatEventTimingSummary(offer)).toBe('Oct 31 – Nov 2 • Time not provided');
  expect(getEventScheduleState(offer, new Date('2026-11-03T03:59:59Z'))).toMatchObject({ code: 'date_only_today', nowEligibility: 'none' });
  expect(isEventPast(offer, new Date('2026-11-03T04:00:00Z'))).toBe(true);
});

it('rejects missing/stale contracts, invalid dates, printed clocks, estimates and recurrence', () => {
  const event = dateOnlyActivity();
  const timing = event.timing!;
  const invalid = [ { ...event, timing: undefined }, { ...event, startTime: '19:00' },
    { ...event, isRecurring: true }, { ...event, isRecurringInstance: true }, { ...event, recurringPattern: 'weekly_thursday' },
    dateOnlyActivity({ startDate: '2026-02-30' }), { ...event, timing: { ...timing, scheduleKind: 'all_day' as const } },
    { ...event, timing: { ...timing, estimate: { ...timing.estimate!, displayEndTime: '20:00' } } },
    { ...event, timing: { ...timing, estimate: { ...timing.estimate!, discoveryCutoffDate: '2026-10-16' } } },
    { ...event, timing: { ...timing, estimate: { ...timing.estimate!, method: 'unreviewed_policy' } } } ];
  invalid.forEach((candidate) => expect(getDateOnlyScheduleRange(candidate)).toBeNull());
  const overnight = { ...event, startTime: '23:00', endDate: '2026-10-16', endTime: '01:00' };
  overnight.timing = createLegacyTimingContract(overnight, { endStatus: 'observed' });
  expect(getDateOnlyScheduleRange(overnight)).toBeNull();
  expect(getEventTimeRangeText(overnight)).toBe('11:00 PM – 1:00 AM');
});

it('invalidates the schedule cache if recurrence eligibility changes', () => {
  const event = dateOnlyActivity();
  expect(getCachedEventScheduleState(event).code).toBe('date_only_today');
  event.isRecurring = true;
  expect(getCachedEventScheduleState(event).code).toBe('started_unknown_end');
});
