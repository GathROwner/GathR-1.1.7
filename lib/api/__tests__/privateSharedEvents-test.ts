jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
}));
jest.mock('../../../config/firebaseConfig', () => ({
  auth: { currentUser: null },
  firestore: {},
}));

import {
  expandPrivateSharedEventRecurrenceForRegression,
  normalizePrivateSharedEventForRegression,
} from '../privateSharedEvents';

describe('private shared event normalization', () => {
  const unknownVenueEvent = {
    ownerUid: 'qa-user',
    ingestId: 'qa-ingest',
    sourcePlatform: 'unknown' as const,
    sourceVisibility: 'user_private' as const,
    routing: 'private_only' as const,
    status: 'saved' as const,
    title: 'Neighbourhood Game Night',
    description: 'Private-address QA fixture.',
    startDate: '2099-09-24',
    endDate: '2099-09-24',
    startTime: '18:30',
    endTime: '20:30',
    locationName: 'Maple Fox Community Studio',
    address: '42 Example Drive, Charlottetown PE C1A1A1',
    latitude: 46.25,
    longitude: -63.1,
    locationScope: 'unknown' as const,
    locationPrecision: 'exact' as const,
    mapMode: 'venue' as const,
    mediaUrls: ['https://example.com/private-owned-photo.jpg'],
  };

  it('shows exact private unknown locations without creating or matching a venue', () => {
    const normalized = normalizePrivateSharedEventForRegression('private-1', unknownVenueEvent, null);
    expect(normalized).not.toBeNull();
    expect(normalized?.venueId).toBeNull();
    expect(normalized?.venue).toBe('Maple Fox Community Studio');
    expect(normalized?.latitude).toBe(46.25);
    expect(normalized?.longitude).toBe(-63.1);
    expect(normalized?.locationScope).toBe('unknown');
    expect(normalized?.sharedEventProvenance?.label).toBe('Shared by you');
    expect(normalized?.venueWebsite).toBe('');
  });

  it('does not put an unresolved address at zero-zero on the map', () => {
    const normalized = normalizePrivateSharedEventForRegression('private-2', {
      ...unknownVenueEvent,
      latitude: undefined,
      longitude: undefined,
    }, null);
    expect(normalized).toBeNull();
  });

  it('materializes a finite multi-day weekly share into the normal recurrence shape', () => {
    const source = {
      ...unknownVenueEvent,
      startDate: '2026-09-01',
      endDate: '2026-09-01',
      recurringPattern: 'weekly_custom',
      recurringDaysOfWeek: ['tuesday', 'thursday'],
      recurrenceUntilDate: '2026-09-10',
    };
    const normalized = normalizePrivateSharedEventForRegression('private-recurring', source, null)!;
    const instances = expandPrivateSharedEventRecurrenceForRegression(normalized, source, {
      todayKey: '2026-08-22',
    });
    expect(instances.map((event) => event.startDate)).toEqual([
      '2026-09-01',
      '2026-09-03',
      '2026-09-08',
      '2026-09-10',
    ]);
    expect(instances.every((event) => event.isRecurringInstance)).toBe(true);
    expect(instances.every((event) => event.originalEventId === 'shared_private-recurring')).toBe(true);
  });

  it('bounds an open-ended recurring share instead of creating an unlimited series', () => {
    const source = {
      ...unknownVenueEvent,
      startDate: '2026-08-22',
      endDate: '2026-08-22',
      recurringPattern: 'daily',
      recurrenceUntilDate: undefined,
    };
    const normalized = normalizePrivateSharedEventForRegression('private-daily', source, null)!;
    const instances = expandPrivateSharedEventRecurrenceForRegression(normalized, source, {
      todayKey: '2026-08-22',
      horizonDays: 14,
    });
    expect(instances).toHaveLength(15);
    expect(instances[0].startDate).toBe('2026-08-22');
    expect(instances.at(-1)?.startDate).toBe('2026-09-05');
  });

  it('leaves a non-recurring private share as one event', () => {
    const normalized = normalizePrivateSharedEventForRegression('private-once', unknownVenueEvent, null)!;
    expect(expandPrivateSharedEventRecurrenceForRegression(normalized, unknownVenueEvent)).toEqual([normalized]);
  });
});
