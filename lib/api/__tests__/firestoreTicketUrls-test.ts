jest.mock('../../../config/firebaseConfig', () => ({
  auth: { currentUser: null },
  firestore: {},
}));

import { normalizeFirestoreEvent } from '../firestoreEvents';
import type { FirestoreEvent } from '../../../types/firestore';

describe('Firestore ticket URL mapping', () => {
  it('maps the Come From Away ticketsBuyUrl into the app ticket CTA field', () => {
    const event = {
      id: 'i5rV9dIg2n9KwUD7R5gq',
      title: 'Come From Away (Charlottetown Festival)',
      description: '',
      startDate: '2026-08-06',
      startTime: '19:30',
      venueId: 'slug_confedcentre',
      venue: 'Confederation Centre',
      category: 'Live Theatre',
      isEvent: true,
      price: null,
      metadata: {
        ticketsBuyUrl: 'https://confederationcentre.com/event/come-from-away/#',
        ticketLink: 'https://confederationcentre.com/event/come-from-away/#',
      },
    } as FirestoreEvent;

    const normalized = normalizeFirestoreEvent(event);

    expect(normalized.ticketLinkEvents).toBe(
      'https://confederationcentre.com/event/come-from-away/'
    );
    expect(normalized.ticketPrice).toBe('Ticketed Event');
  });
});
