jest.mock('../../../config/firebaseConfig', () => ({
  auth: { currentUser: null },
  firestore: {},
}));

import { normalizeFirestoreEvent } from '../firestoreEvents';
import type { FirestoreEvent } from '../../../types/firestore';

describe('Firestore gallery hero fields', () => {
  it('retains the parser-selected image separately from the feed image', () => {
    const normalized = normalizeFirestoreEvent({
      id: 'wings-special',
      title: '99¢ Wings',
      description: '',
      startDate: '2026-09-30',
      startTime: '18:00',
      venueId: 'venue-1',
      venue: 'Pub',
      category: 'Food Special',
      isEvent: false,
      imageUrl: 'https://images.example/dining-room.jpg',
      relevantImageUrl: 'https://images.example/wings.jpg',
      mediaUrls: [
        'https://images.example/dining-room.jpg',
        'https://images.example/wings.jpg',
      ],
      metadata: {},
    } as FirestoreEvent);

    expect(normalized.imageUrl).toBe('https://images.example/dining-room.jpg');
    expect(normalized.relevantImageUrl).toBe('https://images.example/wings.jpg');
    expect(normalized.mediaUrls).toEqual([
      'https://images.example/dining-room.jpg',
      'https://images.example/wings.jpg',
    ]);
  });
});
