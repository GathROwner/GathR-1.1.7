jest.mock('../../../config/firebaseConfig', () => ({
  auth: { currentUser: null },
  firestore: {},
}));

import { normalizeFirestoreEvent } from '../firestoreEvents';
import type { FirestoreEvent } from '../../../types/firestore';
import { EVENTS_MINIMAL } from '../../queryKeys';

describe('Firestore family-friendly field mapping', () => {
  it('uses the current persisted cache key so older event shapes are not restored', () => {
    expect(EVENTS_MINIMAL).toEqual([
      'events-minimal',
      'honest-end-times-v2',
    ]);
  });

  it('preserves score fields on the normalized event used by filters', () => {
    const normalized = normalizeFirestoreEvent({
      id: 'family-music-1',
      title: 'All Ages Concert',
      description: '',
      startDate: '2026-09-01',
      startTime: '19:00',
      venueId: 'venue-1',
      venue: 'Some Venue',
      category: 'Live Music',
      isEvent: true,
      familyFriendlyScore: 85,
      familyFriendlyLevel: 'high',
      familyFriendlyReasons: ['explicit_all_ages'],
      familyFriendlyScoringVersion: 'family-friendly-v4',
      metadata: {},
    } as FirestoreEvent);

    expect(normalized.category).toBe('Live Music');
    expect(normalized.familyFriendlyScore).toBe(85);
    expect(normalized.familyFriendlyLevel).toBe('high');
    expect(normalized.familyFriendlyReasons).toEqual(['explicit_all_ages']);
    expect(normalized.familyFriendlyScoringVersion).toBe('family-friendly-v4');
  });

  it('preserves the finite recurrence boundary used by event cards', () => {
    const normalized = normalizeFirestoreEvent({
      id: 'shared-recurring-1',
      title: 'GATHR QA Sunset Sessions',
      description: '',
      startDate: '2026-08-26',
      endDate: '2026-08-26',
      startTime: '19:00',
      venueId: 'venue-1',
      venue: 'Peake’s Quay',
      category: 'Live Music',
      isEvent: true,
      isRecurring: true,
      recurringPattern: 'weekly_wednesday',
      recurrenceUntilDate: '2026-09-30',
      metadata: {},
    } as FirestoreEvent);

    expect(normalized.recurrenceUntilDate).toBe('2026-09-30');
  });
});
