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
  inferPrivateSharedCategoryForRegression,
  inferPrivateSharedFamilyFriendlyForRegression,
  normalizePrivateSharedEventForRegression,
} from '../privateSharedEvents';
import { isFamilyFriendlyEvent } from '../../../utils/familyFriendly';

describe('private shared event normalization', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

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
    jest.useFakeTimers().setSystemTime(new Date('2026-08-22T12:00:00Z'));
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

  it('uses only the app category contract for a nested live-entertainment event', () => {
    expect(inferPrivateSharedCategoryForRegression({
      ...unknownVenueEvent,
      title: 'Live Entertainment by Floyd Gaudet',
      description: 'Live entertainment inside the West Prince PEI Markets Trail market.',
      contentKind: 'event',
    })).toBe('Live Music');
  });

  it('keeps a market parent distinct from the music component mentioned in its flyer copy', () => {
    expect(inferPrivateSharedCategoryForRegression({
      ...unknownVenueEvent,
      title: 'West Prince PEI Markets Trail - Inside Market',
      description: '25+ vendors with live music by Floyd Gaudet.',
      contentKind: 'event',
    })).toBe('Gatherings & Parties');
  });

  it('classifies drink offers as a supported special category', () => {
    expect(inferPrivateSharedCategoryForRegression({
      ...unknownVenueEvent,
      title: '$6 Burt Reynolds shots',
      description: 'Available during the dance party.',
      contentKind: 'special',
    })).toBe('Drink Special');
  });

  it('adds the Family Friendly facet to a daytime community-market performance', () => {
    const source = {
      ...unknownVenueEvent,
      title: 'Live Entertainment by Floyd Gaudet',
      description: 'Live entertainment inside the West Prince PEI Markets Trail market.',
      parentEventTitle: 'West Prince PEI Markets Trail - Inside Market',
      contentKind: 'event' as const,
      startTime: '12:00',
    };
    const family = inferPrivateSharedFamilyFriendlyForRegression(source);
    const normalized = normalizePrivateSharedEventForRegression('private-family-market', source, null)!;

    expect(family).toEqual(expect.objectContaining({
      familyFriendlyScore: 70,
      familyFriendlyLevel: 'likely',
      familyFriendlyReasons: ['daytime_community_market'],
    }));
    expect(normalized.category).toBe('Live Music');
    expect(isFamilyFriendlyEvent(normalized)).toBe(true);
  });

  it('does not infer family suitability for an adult-only shared event', () => {
    expect(inferPrivateSharedFamilyFriendlyForRegression({
      ...unknownVenueEvent,
      title: 'Late Night Dance Party 19+',
      startTime: '22:00',
    }).familyFriendlyScore).toBe(0);
  });

  it('keeps Family Friendly secondary when the share has a real event category', () => {
    const source = {
      ...unknownVenueEvent,
      title: 'All Ages Family Concert',
      description: 'Families welcome for live music in the park.',
      contentKind: 'event' as const,
      startTime: '14:00',
    };
    const normalized = normalizePrivateSharedEventForRegression('private-family-concert', source, null)!;

    expect(normalized.category).toBe('Live Music');
    expect(isFamilyFriendlyEvent(normalized)).toBe(true);
  });
});
