import type { Event } from '../../../types/events';

/** Synthetic producer contract, not a copy of any live event. */
export const dateOnlyActivity = (overrides: Partial<Event> = {}): Event => {
  const startDate = overrides.startDate || '2026-10-15';
  const endDate = overrides.endDate || startDate;
  return { id: 'qa_date_only', type: 'event', title: 'Community supper', category: 'Gatherings & Parties',
    description: 'A dated activity whose organizer has not supplied exact hours.', venue: 'Example venue', venueId: 'qa_venue',
    address: '1 Example St', latitude: 0, longitude: 0, startDate, endDate, startTime: '', endTime: '',
    isRecurring: false, recurringPattern: 'none', timing: {
      version: 2, timeZone: 'America/Halifax', scheduleKind: startDate === endDate ? 'timed_session' : 'multi_day',
      schedule: { start: { localDate: startDate, localTime: null, timeZone: 'America/Halifax', status: 'unknown' },
        end: { localDate: endDate, localTime: null, timeZone: 'America/Halifax', status: 'unknown' } },
      estimate: { confidence: 'low', discoveryCutoffDate: endDate, discoveryCutoffTime: '23:59',
        method: 'source_dated_activity_unknown_clock', estimateVersion: 'date-only-activity-v1' },
      policyVersion: 'honest-end-times-v2',
    }, ...overrides } as Event;
};
